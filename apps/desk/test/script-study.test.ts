// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Minute } from "@flowchart/bars";
import { closedScriptBars, scriptOnClosedBars } from "../src/script-study.ts";

const source = readFileSync(new URL("../../../packages/script/examples/ma-cross.flow", import.meta.url), "utf8");

function tape(count: number): Minute[] {
  const start = Date.parse("2024-06-03T07:00:00Z");
  return Array.from({ length: count }, (_, i) => {
    const price = (1.1 + i * 0.0001).toFixed(5);
    return { t: start + i * 60_000, o: price, h: price, l: price, c: price };
  });
}

test("the script sees a minute only after that minute has closed", () => {
  const minutes = tape(40);
  const closedThrough = minutes[19].t + 60_000;
  const sealed = scriptOnClosedBars(source, minutes, "1m", closedThrough);
  assert.equal(sealed.error, null);
  assert.equal(sealed.name, "ma_cross");
  assert.equal(sealed.bars, 20);
  assert.equal(sealed.plots.find((plot) => plot.label === "Fast")?.last === null, false);
  assert.equal(sealed.plots.find((plot) => plot.label === "Slow")?.last, null);

  const stillOpen = minutes[19].t + 30_000;
  assert.equal(closedScriptBars(minutes, "1m", stillOpen).length, 19);
  assert.equal(scriptOnClosedBars(source, minutes, "1m", minutes[39].t + 60_000).bars, 40);
});

test("a later cursor cannot see a bar that has not closed", () => {
  const minutes = tape(8);
  const cursor = minutes[3].t + 60_000;
  const bars = closedScriptBars(minutes, "1m", cursor);
  assert.equal(bars.length, 4);
  assert.equal(bars[bars.length - 1]?.time, new Date(minutes[3].t).toISOString());
  assert.equal(bars.some((bar) => bar.time === new Date(minutes[4].t).toISOString()), false);
});
