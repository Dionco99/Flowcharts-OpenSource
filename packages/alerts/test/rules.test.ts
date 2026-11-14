// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AlertsError,
  assertBar,
  closedBars,
  cmpDecimal,
  evaluateRule,
  firedOnBar,
  runStudy,
  sealBars,
  type Rule,
} from "../src/index.ts";
import { bars } from "./helpers.ts";

test("compare fires on the bar the comparison turns true", () => {
  const series = bars([{ close: "1" }, { close: "1" }, { close: "3" }, { close: "3" }]);
  const rule: Rule = {
    type: "compare",
    left: { kind: "price", source: "close" },
    op: "gt",
    right: { kind: "level", value: "2" },
  };
  assert.equal(firedOnBar(rule, series, 0), false);
  assert.equal(firedOnBar(rule, series, 1), false);
  assert.equal(firedOnBar(rule, series, 2), true);
  assert.equal(firedOnBar(rule, series, 3), false);
});

test("cross detects up, down, and either direction", () => {
  const series = bars([{ close: "1" }, { close: "3" }, { close: "1" }, { close: "3" }]);
  const up: Rule = {
    type: "cross",
    left: { kind: "price", source: "close" },
    right: { kind: "level", value: "2" },
    direction: "up",
  };
  assert.deepEqual([0, 1, 2, 3].map((index) => firedOnBar(up, series, index)), [false, true, false, true]);
  const down: Rule = { ...up, direction: "down" };
  assert.deepEqual([0, 1, 2, 3].map((index) => firedOnBar(down, series, index)), [false, false, true, false]);
  const any: Rule = { ...up, direction: "any" };
  assert.deepEqual([0, 1, 2, 3].map((index) => firedOnBar(any, series, index)), [false, true, true, true]);
});

test("a series crosses another series", () => {
  const series = bars([{ close: "1" }, { close: "2" }, { close: "3" }]);
  const rule: Rule = {
    type: "cross",
    left: { kind: "price", source: "close" },
    right: { kind: "values", values: ["2", "2", "2"] },
    direction: "up",
  };
  assert.equal(firedOnBar(rule, series, 1), false);
  assert.equal(firedOnBar(rule, series, 2), true);
});

test("channel enter and exit", () => {
  const series = bars([{ close: "1" }, { close: "5" }, { close: "5" }, { close: "9" }]);
  const enter: Rule = {
    type: "channel",
    value: { kind: "price", source: "close" },
    lower: { kind: "level", value: "4" },
    upper: { kind: "level", value: "6" },
    event: "enter",
  };
  assert.deepEqual([0, 1, 2, 3].map((index) => firedOnBar(enter, series, index)), [false, true, false, false]);
  const exit: Rule = { ...enter, event: "exit" };
  assert.equal(firedOnBar(exit, series, 3), true);
  assert.equal(firedOnBar(exit, series, 2), false);
});

test("percent change fires when the move reaches the threshold", () => {
  const series = bars([{ close: "100" }, { close: "100" }, { close: "101" }, { close: "101" }]);
  const rule: Rule = {
    type: "percent",
    source: { kind: "price", source: "close" },
    lookback: 2,
    percent: "1",
    direction: "up",
  };
  assert.equal(firedOnBar(rule, series, 1), false);
  assert.equal(firedOnBar(rule, series, 2), true);
  assert.equal(firedOnBar(rule, series, 3), false);
  const down: Rule = {
    type: "percent",
    source: { kind: "price", source: "close" },
    lookback: 1,
    percent: "1",
    direction: "down",
  };
  const falling = bars([{ close: "100" }, { close: "99" }]);
  assert.equal(firedOnBar(down, falling, 1), true);
});

test("indicator compare uses the study on the sealed window", () => {
  const series = bars([{ close: "1" }, { close: "2" }, { close: "3" }, { close: "4" }]);
  const plots = runStudy("sma", series, { length: 2 });
  assert.deepEqual(plots.sma, [null, "1.5", "2.5", "3.5"]);
  const rule: Rule = {
    type: "compare",
    left: { kind: "indicator", name: "sma", params: { length: 2 } },
    op: "gt",
    right: { kind: "level", value: "2" },
  };
  assert.equal(firedOnBar(rule, series, 1), false);
  assert.equal(firedOnBar(rule, series, 2), true);
  const rising = bars(Array.from({ length: 16 }, (_, index) => ({ close: String(index + 1) })));
  const rsi = runStudy("rsi", rising, { length: 14 }).rsi;
  assert.equal(rsi[13], null);
  assert.equal(rsi[14], "100");
  const rsiRule: Rule = {
    type: "compare",
    left: { kind: "indicator", name: "rsi", params: { length: 14 } },
    op: "gt",
    right: { kind: "level", value: "70" },
  };
  assert.equal(firedOnBar(rsiRule, rising, 14), true);
  assert.equal(firedOnBar(rsiRule, rising, 15), false);
});

test("bollinger, average true range, and rolling extremes stay on the window", () => {
  const series = bars([
    { close: "1", high: "1.2", low: "0.8" },
    { close: "2", high: "2.2", low: "1.8" },
    { close: "3", high: "3.2", low: "2.8" },
    { close: "4", high: "4.2", low: "3.8" },
  ]);
  const bands = runStudy("bollinger", series, { length: 3, mult: "2" });
  assert.equal(bands.middle[1], null);
  assert.equal(cmpDecimal(bands.upper[3]!, bands.middle[3]!) > 0, true);
  assert.equal(cmpDecimal(bands.lower[3]!, bands.middle[3]!) < 0, true);
  const range = runStudy("atr", series, { length: 2 }).atr;
  assert.equal(range[0], null);
  assert.notEqual(range[2], null);
  assert.equal(runStudy("highest", series, { length: 2 }).highest[3], "4.2");
  assert.equal(runStudy("lowest", series, { length: 2 }).lowest[3], "2.8");
});

test("a future bar is a leak, and the cursor hides it", () => {
  const series = bars([{ close: "1" }, { close: "2" }, { close: "3" }]);
  const cursor = series[0].closeTime;
  assert.equal(closedBars(series, cursor).length, 1);
  assert.throws(() => sealBars(series, cursor), (error: unknown) => {
    return error instanceof AlertsError && error.code === "window_leak";
  });
  const rule: Rule = {
    type: "compare",
    left: { kind: "price", source: "close" },
    op: "gt",
    right: { kind: "level", value: "2" },
  };
  assert.throws(() => evaluateRule(rule, series, cursor), (error: unknown) => {
    return error instanceof AlertsError && error.code === "window_leak";
  });
  const visible = evaluateRule(rule, closedBars(series, series[1].closeTime), series[1].closeTime);
  assert.equal(visible.fired, false);
});

test("a JSON number price is rejected", () => {
  const [bar] = bars([{ close: "1" }]);
  assert.throws(() => assertBar({ ...bar, close: 1.1 }, 0), (error: unknown) => {
    return error instanceof AlertsError && error.code === "invalid_bar";
  });
});
