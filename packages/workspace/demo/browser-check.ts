// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createServer, type ViteDevServer } from "vite";
import type { Chart } from "klinecharts";

declare global {
  interface Window {
    __flowchartCharts?: Chart[];
  }
}

const demoRoot = fileURLToPath(new URL(".", import.meta.url));
const artifacts = "/opt/cursor/artifacts";

async function main(): Promise<void> {
  const server = await createServer({
    configFile: false,
    root: demoRoot,
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    await exercise(browser, server);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function exercise(browser: Awaited<ReturnType<typeof puppeteer.launch>>, server: ViteDevServer): Promise<void> {
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    console.error(`pageerror: ${error.message}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  const address = server.resolvedUrls?.local[0];
  if (!address) {
    throw new Error("demo server has no local url");
  }
  await page.goto(address, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => {
    const chart = window.__flowchartCharts?.[0];
    const canvas = document.querySelector("canvas");
    return Boolean(chart && canvas && chart.getIndicators({ id: "sma" }).length > 0);
  });

  const closed = async () =>
    page.$eval("#stats", (node) => node.getAttribute("data-closed") ?? "");
  const period = async () =>
    page.$eval("#stats", (node) => node.getAttribute("data-period") ?? "");

  const twoHour = Number(await closed());
  if (!(twoHour > 0) || (await period()) !== "2h") {
    throw new Error(`expected 2h bars, saw ${await period()} ${twoHour}`);
  }

  await page.click('[data-period="7m"]');
  await page.waitForFunction((previous) => {
    const count = Number(document.querySelector("#stats")?.getAttribute("data-closed"));
    return document.querySelector("#stats")?.getAttribute("data-period") === "7m" && count > previous;
  }, {}, twoHour);
  const seven = Number(await closed());

  await page.click('[data-period="3D"]');
  await page.waitForFunction((baseline) => {
    const count = Number(document.querySelector("#stats")?.getAttribute("data-closed"));
    return document.querySelector("#stats")?.getAttribute("data-period") === "3D" && count > 0 && count < baseline;
  }, {}, twoHour);
  const threeDay = Number(await closed());

  await page.click('[data-period="2h"]');
  await page.waitForFunction(() => document.querySelector("#stats")?.getAttribute("data-period") === "2h");

  await page.select("#scale", "logarithm");
  await page.waitForFunction(() => window.__flowchartCharts?.[0]?.getYAxes({})[0]?.name === "logarithm");
  await page.select("#scale", "normal");

  await page.select("#candle", "area");
  await page.waitForFunction(() => window.__flowchartCharts?.[0]?.getStyles().candle.type === "area");
  await page.select("#candle", "candle_solid");

  await page.click('[data-id="sma"] [data-action="visible"]');
  await page.waitForFunction(() => window.__flowchartCharts?.[0]?.getIndicators({ id: "sma" })[0]?.visible === false);
  await page.click('[data-id="sma"] [data-action="visible"]');
  await page.waitForFunction(() => window.__flowchartCharts?.[0]?.getIndicators({ id: "sma" })[0]?.visible === true);

  await page.click('[data-id="level"] [data-action="lock"]');
  await page.waitForFunction(() => window.__flowchartCharts?.[0]?.getOverlays({ id: "level" })[0]?.lock === true);
  await page.click('[data-id="level"] [data-action="lock"]');
  await page.waitForFunction(() => window.__flowchartCharts?.[0]?.getOverlays({ id: "level" })[0]?.lock === false);

  await page.$eval("#sma-period", (node) => {
    const input = node as HTMLInputElement;
    input.value = "8";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => (document.querySelector("#sma-period") as HTMLInputElement).value === "8");

  await page.$eval("#sma-color", (node) => {
    const input = node as HTMLInputElement;
    input.value = "#22aa66";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const lines = window.__flowchartCharts?.[0]?.getIndicators({ id: "sma" })[0]?.styles?.lines as
      | { color?: string }[]
      | undefined;
    return lines?.[0]?.color?.toLowerCase() === "#22aa66";
  });

  await page.click("#backtest");
  await page.waitForFunction(() => {
    const text = document.querySelector("#backtest-summary")?.textContent ?? "";
    const count = Number(text.split(" ")[0]);
    return count > 0;
  });
  const backtest = await page.$eval("#backtest-summary", (node) => node.textContent ?? "");

  await page.$eval('[data-id="sma"] [data-action="name"]', (node) => {
    const input = node as HTMLInputElement;
    input.value = "Average";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () => (document.querySelector('[data-id="sma"] [data-action="name"]') as HTMLInputElement).value === "Average",
  );

  await page.click('[data-id="sma"] [data-action="down"]');
  await page.waitForFunction(() => document.querySelector('[data-id="sma"]')?.getAttribute("data-index") === "1");

  await page.$eval("#layout-name", (node) => {
    const input = node as HTMLInputElement;
    input.value = "Night";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#save");
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#saved option")].some((option) => option.textContent === "Night"),
  );
  await page.click('[data-period="7m"]');
  await page.waitForFunction(() => document.querySelector("#stats")?.getAttribute("data-period") === "7m");
  await page.select("#saved", "Night");
  await page.click("#load");
  await page.waitForFunction(() => document.querySelector("#stats")?.getAttribute("data-period") === "2h");

  const box = await page.$("#chart-price");
  if (!box) {
    throw new Error("price chart is missing");
  }
  const rect = await box.boundingBox();
  if (!rect) {
    throw new Error("price chart has no box");
  }
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.waitForFunction(() => {
    const left = document.querySelector('[data-testid="cursor-price"]')?.textContent ?? "";
    const right = document.querySelector('[data-testid="cursor-extra"]')?.textContent ?? "";
    return left !== "—" && left === right;
  });
  await page.click("#backtest");
  await page.waitForFunction(() => (document.querySelector("#backtest-summary")?.textContent ?? "").includes("trades"));

  await mkdir(artifacts, { recursive: true });
  const shot = await page.screenshot({ fullPage: true });
  await writeFile(`${artifacts}/chart-workspace.png`, shot);

  await page.click('[data-id="sma"] [data-action="pick"]');
  await page.click('[data-id="level"] [data-action="pick"]');
  await page.click("#group");
  await page.waitForFunction(() => document.querySelector('[data-kind="group"]') !== null);
  const groupId = await page.$eval('[data-kind="group"]', (node) => (node as HTMLElement).dataset.id ?? "");
  await page.click(`[data-id="${groupId}"] [data-action="delete"]`);
  await page.waitForFunction(() => document.querySelector('[data-id="sma"]') === null);

  console.log(
    JSON.stringify({
      twoHour,
      sevenMinute: seven,
      threeDay,
      backtest,
      screenshot: `${artifacts}/chart-workspace.png`,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
