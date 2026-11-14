// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import "./dom-stub.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { getSupportedOverlays } from "klinecharts";
import { ema, macd, rsi } from "indicatorts";
import type { Bar } from "../src/bar.ts";
import {
  FIBONACCI_LINE_PERCENTS,
  OVERLAY_NAMES,
  addDrawing,
  emptyDrawingDoc,
  fibonacciLinePrices,
  toOverlay,
  undoDrawing,
} from "../src/chart/drawings.ts";
import { priceOnLine, priceOnSegment } from "../src/chart/geometry.ts";
import { flowchartIndicatorTemplates, registerFlowchartIndicators } from "../src/chart/indicators.ts";
import { heikinAshi } from "../src/chart-types/heikin-ashi.ts";
import { renko } from "../src/chart-types/bricks.ts";
import { lineSeries, stepLine, volumeCandles } from "../src/chart-types/series.ts";
import { checkImpulse, matchHarmonics, pitchfork, positionLevels } from "../src/drawings/figures.ts";
import { averageDirectionalIndex } from "../src/indicators/desk.ts";
import { listStudies, runStudy } from "../src/indicators/index.ts";

function bars(count: number, start = Date.UTC(2024, 0, 1)): Bar[] {
  const out: Bar[] = [];
  let price = 100;
  for (let index = 0; index < count; index += 1) {
    const open = price;
    const close = price + Math.sin(index / 3);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    out.push({ time: start + index * 60_000, open, high, low, close, volume: 1_000 + index });
    price = close;
  }
  return out;
}

function bar(time: number, open: number, high: number, low: number, close: number, volume = 1): Bar {
  return { time, open, high, low, close, volume };
}

test("overlay names match the chart library", () => {
  assert.deepEqual([...OVERLAY_NAMES].sort(), getSupportedOverlays().sort());
});

test("fibonacci prices follow the chart line percents", () => {
  const levels = fibonacciLinePrices(20, 10);
  assert.deepEqual(levels.map((level) => level.percent), [...FIBONACCI_LINE_PERCENTS]);
  assert.equal(levels[0].price, 20);
  assert.equal(levels[levels.length - 1].price, 10);
});

test("a segment overlay prices the line and undoes", () => {
  const drawing = {
    id: "leg",
    name: "segment" as const,
    points: [{ time: 0, price: 10 }, { time: 10, price: 20 }],
  };
  const overlay = toOverlay(drawing);
  assert.equal(overlay.name, "segment");
  assert.equal(priceOnLine(drawing.points[0], drawing.points[1], 5), 15);
  assert.equal(priceOnSegment(drawing.points[0], drawing.points[1], 15), null);
  const doc = addDrawing(emptyDrawingDoc(), drawing);
  assert.equal(undoDrawing(doc).items.length, 0);
});

test("registered studies calculate with indicatorts", () => {
  const names: string[] = [];
  registerFlowchartIndicators({ registerIndicator(indicator) { names.push(indicator.name); } });
  assert.ok(names.includes("flowchart_ema"));
  const window = bars(40);
  const templates = flowchartIndicatorTemplates();
  const emaTemplate = templates.find((template) => template.name === "flowchart_ema");
  const calculated = emaTemplate?.calc?.(window.map((item) => ({
    timestamp: item.time,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
  })), { calcParams: [3] } as never);
  const rows = calculated instanceof Promise ? undefined : calculated;
  assert.ok(rows);
  const study = runStudy("ema", window, { period: 3 }).value;
  assert.equal((rows[10] as { value: number | null }).value, study[10]);
});

test("every study matches the window and the reference averages", () => {
  const window = bars(80);
  const closes = window.map((item) => item.close);
  for (const study of listStudies()) {
    const plots = runStudy(study.id, window);
    assert.ok(Object.keys(plots).length > 0, study.id);
    for (const series of Object.values(plots)) {
      assert.equal(series.length, window.length, study.id);
    }
  }
  const emaPlot = runStudy("ema", window, { period: 3 }).value;
  const library = ema(closes, { period: 3 });
  assert.equal(emaPlot[10], library[10]);
  const rsiPlot = runStudy("rsi", window, { period: 14, seed: "sma" }).value;
  const libraryRsi = rsi(closes, { period: 14, seed: "sma" });
  assert.equal(rsiPlot[5], null);
  assert.equal(rsiPlot[20], libraryRsi[20]);
  const macdPlot = runStudy("macd", window);
  const libraryMacd = macd(closes);
  assert.equal(macdPlot.macdLine[40], libraryMacd.macdLine[40]);
  assert.equal(macdPlot.histogram[40], (macdPlot.macdLine[40] ?? 0) - (macdPlot.signalLine[40] ?? 0));
});

test("session extremes use the observed day", () => {
  const first = [bar(Date.UTC(2024, 0, 1, 1), 1, 3, 0.5, 2), bar(Date.UTC(2024, 0, 1, 2), 2, 4, 1, 3)];
  const second = [bar(Date.UTC(2024, 0, 2, 1), 3, 5, 2, 4)];
  const window = [...first, ...second];
  const session = runStudy("sessionHighLow", window);
  assert.equal(session.high[1], 4);
  const prior = runStudy("previousDayHighLow", window);
  assert.equal(prior.high[0], null);
  assert.equal(prior.high[2], 4);
});

test("directional index matches a hand-worked period of 3", () => {
  const window = [
    bar(0, 9, 10, 8, 9),
    bar(1, 9, 12, 9, 11),
    bar(2, 11, 11, 10, 10),
    bar(3, 10, 13, 10.5, 12),
    bar(4, 12, 15, 12, 14),
  ];
  const result = averageDirectionalIndex(window, 3);
  assert.ok(Math.abs((result.plus[2] ?? 0) - 100 / 3) < 1e-9);
  assert.equal(result.adx[4], 100);
});

test("heikin-ashi, renko, and close series transform the window", () => {
  const first = bar(0, 10, 12, 8, 11);
  const second = bar(1, 11, 14, 10, 13);
  const synthetic = heikinAshi([first, second]);
  assert.equal(synthetic[0].close, (10 + 12 + 8 + 11) / 4);
  assert.equal(synthetic[1].open, (synthetic[0].open + synthetic[0].close) / 2);
  const bricks = renko([10, 10.5, 12, 12, 9].map((close, index) => bar(index, close, close, close, close)), 1);
  assert.deepEqual(bricks.map((brick) => brick.close), [11, 12, 11, 10, 9]);
  const series = [bar(0, 1, 2, 0, 2, 4), bar(1, 2, 3, 1, 3, 8)];
  assert.deepEqual(lineSeries(series).map((point) => point.value), [2, 3]);
  assert.deepEqual(stepLine(series).map((point) => point.value), [2, 2, 3]);
  assert.equal(volumeCandles(series)[1].width, 1);
});

test("pitchfork, harmonics, impulse, and position levels use the anchors", () => {
  const fork = pitchfork("andrews", { time: 0, price: 0 }, { time: 10, price: 10 }, { time: 10, price: 0 }, 10);
  assert.equal(fork.median, 5);
  assert.equal(matchHarmonics(0, 100, 38.2, 70, 21.4).includes("gartley"), true);
  assert.equal(checkImpulse([0, 5, 2, 10, 6, 12]).ok, true);
  assert.equal(positionLevels("buy", 10, 8, 14).r, 2);
});
