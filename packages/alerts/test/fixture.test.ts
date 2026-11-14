// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  AlertLog,
  demoScenario,
  generateTape,
  hotlist,
  isDecimal,
  recordingPorts,
  screen,
} from "../src/index.ts";

test("the generated tape is deterministic and keeps decimal strings", () => {
  const left = generateTape({ seed: 20240602, noiseTicks: 2, count: 8 });
  const right = generateTape({ seed: 20240602, noiseTicks: 2, count: 8 });
  const other = generateTape({ seed: 7, noiseTicks: 2, count: 8 });
  assert.deepEqual(left, right);
  assert.notDeepEqual(left.bars.map((bar) => bar.close), other.bars.map((bar) => bar.close));
  for (const bar of left.bars) {
    assert.equal(isDecimal(bar.close), true);
    assert.equal(typeof bar.close, "string");
  }
  assert.equal(left.format, "flowchart.tape");
});

test("the package does not ship a market-data file", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const files = walk(root).filter((path) => !path.includes(`${join("node_modules")}`) && !path.includes(`${join("dist")}`));
  const data = files.filter((path) => /\.(csv|parquet)$/i.test(path) || /binance|dukascopy|histdata/i.test(path));
  assert.deepEqual(data, []);
});

test("the demo scenario fires price, indicator, and drawing alerts and screens two symbols", async () => {
  const scenario = demoScenario();
  const recorded = recordingPorts();
  const log = new AlertLog(recorded.ports);
  for (const alert of scenario.alerts) log.arm(alert);
  const end = scenario.eurusd.bars.at(-1)!.closeTime;
  const start = scenario.eurusd.bars[0].closeTime;
  const early = await log.advance(
    [
      { symbol: "EURUSD", bars: scenario.eurusd.bars },
      { symbol: "GBPUSD", bars: scenario.gbpusd.bars },
    ],
    start,
  );
  assert.equal(early.length, 0);
  const fired = await log.advance(
    [
      { symbol: "EURUSD", bars: scenario.eurusd.bars },
      { symbol: "GBPUSD", bars: scenario.gbpusd.bars },
    ],
    end,
  );
  assert.deepEqual(fired.map((item) => item.row.id).sort(), ["alert-drawing", "alert-indicator", "alert-price"]);
  assert.equal(recorded.outbox.some((item) => item.kind === "webhook"), true);
  assert.equal(recorded.outbox.some((item) => item.kind === "email"), true);
  assert.equal(recorded.outbox.some((item) => item.kind === "push"), true);
  const hits = screen(
    [
      { symbol: "EURUSD", bars: scenario.eurusd.bars },
      { symbol: "GBPUSD", bars: scenario.gbpusd.bars },
    ],
    scenario.filters,
    end,
  );
  assert.deepEqual(hits.map((hit) => hit.symbol), ["EURUSD"]);
  const movers = hotlist(
    [
      { symbol: "EURUSD", bars: scenario.eurusd.bars },
      { symbol: "GBPUSD", bars: scenario.gbpusd.bars },
    ],
    end,
    { by: "percent", lookback: 10, side: "gainers" },
  );
  assert.equal(movers[0].symbol, "EURUSD");
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
