// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { barTouches, firedOnBar, type Rule } from "../src/index.ts";
import { bars } from "./helpers.ts";

test("a horizontal price touches the bar range", () => {
  const series = bars([
    { close: "1.10", high: "1.11", low: "1.09" },
    { close: "1.20", high: "1.21", low: "1.19" },
  ]);
  const rule: Rule = { type: "drawing", drawing: { kind: "horizontal", price: "1.20" } };
  assert.equal(barTouches(series[0], rule.drawing), false);
  assert.equal(barTouches(series[1], rule.drawing), true);
  assert.equal(firedOnBar(rule, series, 1), true);
  assert.equal(firedOnBar(rule, series, 0), false);
});

test("segment, ray, line, and rectangle", () => {
  const series = bars([
    { close: "1", high: "1.2", low: "0.8" },
    { close: "1", high: "1.2", low: "0.8" },
    { close: "1", high: "1.2", low: "0.8" },
  ]);
  const segment: Rule = {
    type: "drawing",
    drawing: {
      kind: "segment",
      from: { time: series[1].openTime, price: "1" },
      to: { time: "2024-06-03T13:01:30Z", price: "1" },
    },
  };
  assert.equal(firedOnBar(segment, series, 0), false);
  assert.equal(firedOnBar(segment, series, 1), true);
  assert.equal(barTouches(series[2], segment.drawing), false);

  const ray: Rule = {
    type: "drawing",
    drawing: {
      kind: "ray",
      from: { time: series[0].openTime, price: "1" },
      to: { time: series[0].closeTime, price: "1" },
    },
  };
  assert.equal(barTouches(series[2], ray.drawing), true);
  const before: Rule = {
    type: "drawing",
    drawing: {
      kind: "ray",
      from: { time: series[2].openTime, price: "1" },
      to: { time: series[2].closeTime, price: "1" },
    },
  };
  assert.equal(barTouches(series[0], before.drawing), false);

  const line: Rule = {
    type: "drawing",
    drawing: {
      kind: "line",
      from: { time: series[2].openTime, price: "1" },
      to: { time: series[2].closeTime, price: "1" },
    },
  };
  assert.equal(barTouches(series[0], line.drawing), true);

  const box: Rule = {
    type: "drawing",
    drawing: {
      kind: "rectangle",
      from: { time: series[1].openTime, price: "0.9" },
      to: { time: series[1].closeTime, price: "1.1" },
    },
  };
  assert.equal(barTouches(series[1], box.drawing), true);
  assert.equal(barTouches(series[0], box.drawing), false);
  const miss: Rule = {
    type: "drawing",
    drawing: {
      kind: "rectangle",
      from: { time: series[1].openTime, price: "3" },
      to: { time: series[1].closeTime, price: "4" },
    },
  };
  assert.equal(barTouches(series[1], miss.drawing), false);
});
