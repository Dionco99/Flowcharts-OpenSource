// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright-core";
import { demoScenario } from "../src/scenario.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scenario = demoScenario();
const end = scenario.eurusd.bars[scenario.eurusd.bars.length - 1].closeTime;
const last = scenario.eurusd.bars[scenario.eurusd.bars.length - 1].close;
const shotDir = "/tmp/flowchart-alerts";
mkdirSync(shotDir, { recursive: true });

const server = startServer();
try {
  await waitForServer("http://127.0.0.1:5173/");
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto("http://127.0.0.1:5173/");
    await ready(page);
    if ((await page.locator("#spark polyline").count()) !== 0) {
      throw new Error("the sparkline drew bars before the cursor moved");
    }
    await textIs(page, "status-alert-price", "armed");
    await textIs(page, "status-alert-indicator", "armed");
    await textIs(page, "status-alert-drawing", "armed");
    if ((await page.locator("[data-testid=screen-EURUSD]").count()) !== 0) {
      throw new Error("screener matched EURUSD before the move");
    }
    await page.click("#run");
    await page.waitForFunction((cursor) => document.body.dataset.cursor === cursor && document.body.dataset.ready === "1", end);
    await textIs(page, "status-alert-price", "fired");
    await textIs(page, "status-alert-indicator", "fired");
    await textIs(page, "status-alert-drawing", "fired");
    const outbox = await page.locator("#outbox").innerText();
    for (const kind of ["webhook", "email", "push"]) {
      if (!outbox.includes(kind)) throw new Error(`outbox missing ${kind}`);
    }
    if ((await page.locator("[data-testid=screen-EURUSD]").count()) !== 1) throw new Error("EURUSD missing from the screener");
    if ((await page.locator("[data-testid=screen-GBPUSD]").count()) !== 0) throw new Error("GBPUSD should not pass the screener");
    const top = await page.locator("[data-testid=hotlist-top]").innerText();
    if (!top.startsWith("EURUSD")) throw new Error(`hotlist top was ${top}`);
    await textIs(page, "last-EURUSD", last);
    const points = (await page.locator("#spark polyline").getAttribute("points")) ?? "";
    if (points.trim().split(/\s+/).length !== scenario.eurusd.bars.length) {
      throw new Error("the sparkline did not cover the closed bars");
    }
    await page.screenshot({ path: resolve(shotDir, "desk.png"), fullPage: true });

    await page.fill("#search", "yen");
    await page.waitForFunction(() => document.querySelectorAll("#results button").length === 1);
    await page.click("[data-testid=pick-USDJPY]");
    await page.click("#add-symbol");
    await page.waitForSelector("[data-testid=quote-USDJPY]");
    await page.click("[data-testid=remove-GBPUSD]");
    await page.waitForFunction(() => document.querySelector("[data-testid=quote-GBPUSD]") === null);

    await page.reload();
    await ready(page);
    await page.waitForFunction((cursor) => document.body.dataset.cursor === cursor, end);
    await textIs(page, "status-alert-price", "fired");
    if ((await page.locator("#outbox li").count()) !== 0) throw new Error("reload delivered the fire again");
    if ((await page.locator("[data-testid=quote-USDJPY]").count()) !== 1) throw new Error("USDJPY did not persist");
    if ((await page.locator("[data-testid=quote-GBPUSD]").count()) !== 0) throw new Error("GBPUSD came back");

    await page.click("#start");
    await page.waitForFunction(() => document.body.dataset.ready === "1" && document.body.dataset.cursor?.endsWith("13:01:00Z"));
    await textIs(page, "status-alert-price", "armed");

    await page.setViewportSize({ width: 390, height: 844 });
    const run = await page.locator("#run").boundingBox();
    if (!run || run.x < 0 || run.x + run.width > 390) throw new Error("Run is outside the phone viewport");
    await page.screenshot({ path: resolve(shotDir, "phone.png"), fullPage: true });
  } finally {
    await browser.close();
  }
} finally {
  if (server.pid) {
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  }
}

console.log("browser test passed");

function startServer(): ChildProcess {
  return spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5173"], {
    cwd: root,
    stdio: "inherit",
    detached: true,
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let last = "not started";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      last = `status ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`demo server did not start: ${last}`);
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.ready === "1");
}

async function textIs(page: Page, testId: string, expected: string): Promise<void> {
  const text = (await page.locator(`[data-testid=${testId}]`).innerText()).trim();
  if (text !== expected) throw new Error(`${testId} was ${text}, expected ${expected}`);
}
