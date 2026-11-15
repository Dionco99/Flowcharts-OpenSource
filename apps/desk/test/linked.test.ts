// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { replayNote, visibleReplay } from "../src/journal-note.ts";
import { linkedReport } from "../src/linked.ts";

test("a replay note keeps the chart snapshot empty", () => {
  const note = replayNote({ symbol: "EURUSD", side: "long", at: "2024-06-03T11:00", r: "1.5" });
  assert.equal("trade" in note, true);
  if (!("trade" in note)) return;
  assert.equal(note.trade.source, "replay");
  assert.equal(note.trade.snapshotId, null);
  assert.equal(note.trade.snapshotRef, "");
  assert.equal(note.trade.rResult, 1.5);
  assert.equal(visibleReplay([note.trade]).length, 1);
});

test("linked packages read the sealed window and leave a swap unquoted", async () => {
  const start = Date.parse("2024-06-03T11:00:00Z");
  const minutes = Array.from({ length: 5 }, (_, index) => {
    const price = "1.10000";
    return { t: start + index * 60_000, o: price, h: price, l: price, c: price };
  });
  const cursor = minutes[4].t + 60_000;
  const report = await linkedReport(minutes, cursor, "1.10000", [1, -0.5]);
  assert.match(report.workspace, /Desk/);
  assert.match(report.plugin, /Session VWAP/);
  assert.match(report.risk, /lots/);
  assert.match(report.alerts, /local/);
  assert.match(report.edge, /2 trades/);
});

test("custom 7m bars and the symbol registry come from the merged packages", async () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const start = Date.parse("2024-06-03T11:00:00Z");
  const minutes = Array.from({ length: 21 }, (_, index) => ({
    t: start + index * 60_000,
    o: "1.08500",
    h: "1.08520",
    l: "1.08480",
    c: "1.08510",
  }));
  const report = await new Promise<{ windows: Record<string, number>; symbol: string; pip: string; catalog: number }>((resolve, reject) => {
    const child = spawn("python3", [path.join(root, "apps/desk/src/server/read.py")], {
      env: {
        ...process.env,
        PYTHONPATH: [path.join(root, "packages/bars/src"), path.join(root, "packages/multi-instrument/src")].join(":"),
      },
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.stdin.end(JSON.stringify({ cursor: minutes[20].t + 60_000, price: "1.08500", minutes, timeframes: ["7m"] }));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || `python exited ${code}`));
      else resolve(JSON.parse(out));
    });
  });
  assert.equal(report.symbol, "EURUSD");
  assert.ok(report.windows["7m"] >= 1);
  assert.equal(report.pip, "10.0000");
  assert.ok(report.catalog > 1);
});
