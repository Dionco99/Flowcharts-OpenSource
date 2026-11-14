// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { aggregate } from "../src/index";
import type { Minute } from "../src/types";

const OPEN = Date.parse("2026-11-04T12:00:00.000Z");

function minute(index: number, o: string, h: string, l: string, c: string): Minute {
  return { t: OPEN + index * 60_000, o, h, l, c };
}

test("a higher timeframe bar stays partial and ignores a minute the cursor has not closed", () => {
  const minutes = Array.from({ length: 16 }, (_, index) => minute(index, "1.09000", "1.09020", "1.08980", "1.09000"));
  minutes[10] = minute(10, "1.09000", "1.09250", "1.08750", "1.09100");
  const cursor = minutes[10].t;
  const bars = aggregate(minutes, "15m", cursor);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].partial, true);
  assert.ok(Number(bars[0].h) < 1.0925);
  assert.ok(Number(bars[0].l) > 1.0875);
  assert.ok(bars[0].ct <= cursor);
});
