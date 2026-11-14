// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { Bar } from "../src/bar.js";
import { candleView } from "../src/chart-types/candles.js";
import { heikinAshi } from "../src/chart-types/heikin-ashi.js";
import { kagi, lineBreak, pointAndFigure, rangeBars, renko } from "../src/chart-types/bricks.js";
import { barCovering, countdownToClose, crosshair, lastPrice } from "../src/chart-types/readout.js";
import { PRICE_SCALE_AXIS, scalePrice } from "../src/chart-types/scales.js";
import {
  areaSeries,
  baselineSeries,
  columnSeries,
  highLowSeries,
  lineSeries,
  stepSeries,
} from "../src/chart-types/series.js";

function bar(close: number, index = 0, extra: Partial<Bar> = {}): Bar {
  const openTime = extra.openTime ?? index * 60_000;
  return {
    openTime,
    closeTime: extra.closeTime ?? openTime + 60_000,
    open: extra.open ?? close,
    high: extra.high ?? Math.max(extra.open ?? close, close),
    low: extra.low ?? Math.min(extra.open ?? close, close),
    close,
    volume: extra.volume ?? 1,
  };
}

describe("candles and OHLC bars", () => {
  const bars = [bar(10, 0, { open: 9, high: 11, low: 8, volume: 4 }), bar(12, 1, { open: 10, high: 13, low: 9 })];

  it("keeps one symbol's OHLC under solid, hollow, and bar styles", () => {
    for (const style of ["solid", "hollow", "bar"] as const) {
      const view = candleView(bars, style);
      expect(view.bars.map((item) => [item.open, item.high, item.low, item.close])).toEqual([
        [9, 11, 8, 10],
        [10, 13, 9, 12],
      ]);
    }
    expect(candleView(bars, "solid").libraryType).toBe("candle_solid");
    expect(candleView(bars, "hollow").libraryType).toBe("candle_stroke");
    expect(candleView(bars, "bar").libraryType).toBe("ohlc");
  });
});

describe("line and area styles", () => {
  const bars = [bar(10, 0), bar(12, 1), bar(11, 2)];

  it("plots the close, a step, an area, a baseline, columns, and the high-low", () => {
    expect(lineSeries(bars).map((point) => point.value)).toEqual([10, 12, 11]);
    expect(stepSeries(bars)).toEqual([
      { time: bars[0]!.closeTime, value: 10 },
      { time: bars[1]!.closeTime, value: 10 },
      { time: bars[1]!.closeTime, value: 12 },
      { time: bars[2]!.closeTime, value: 12 },
      { time: bars[2]!.closeTime, value: 11 },
    ]);
    expect(areaSeries(bars).libraryType).toBe("area");
    expect(areaSeries(bars).points.map((point) => point.value)).toEqual([10, 12, 11]);
    expect(baselineSeries(bars, 11).map((point) => point.side)).toEqual(["below", "above", "on"]);
    expect(columnSeries(bars).map((point) => point.value)).toEqual([null, 2, -1]);
    expect(columnSeries(bars, "close").map((point) => point.value)).toEqual([10, 12, 11]);
    const span = highLowSeries([bar(10, 0, { open: 9, high: 14, low: 8 })]);
    expect(span).toEqual([{ time: 60_000, high: 14, low: 8 }]);
  });
});

describe("heikin-ashi", () => {
  it("builds synthetic candles from the source bars", () => {
    const bars = [
      bar(1, 0, { open: 1, high: 2, low: 0, volume: 3 }),
      bar(2, 1, { open: 2, high: 3, low: 1, volume: 4 }),
    ];
    const synthetic = heikinAshi(bars);
    expect(synthetic[0]).toMatchObject({ open: 1, close: 1, high: 2, low: 0, volume: 3 });
    expect(synthetic[1]).toMatchObject({ open: 1, close: 2, high: 3, low: 1, volume: 4 });
  });
});

describe("brick chart types", () => {
  it("prints renko bricks, including a one-brick reversal", () => {
    const closes = [10, 10.5, 12.2, 11.4, 11, 9];
    const bricks = renko(closes.map((close, index) => bar(close, index)), 1);
    expect(bricks.map((item) => [item.open, item.close])).toEqual([
      [10, 11],
      [11, 12],
      [12, 11],
      [11, 10],
      [10, 9],
    ]);
  });

  it("extends a kagi line to the extreme and reverses after the reversal amount", () => {
    const closes = [10, 13, 14, 11, 10];
    const points = kagi(closes.map((close, index) => bar(close, index)), 2);
    expect(points.map((point) => point.price)).toEqual([10, 14, 10]);
  });

  it("prints a line break when close breaks the last line or the last N extremes", () => {
    const closes = [10, 12, 13, 11, 9, 14];
    const lines = lineBreak(closes.map((close, index) => bar(close, index)), 3);
    expect(lines.map((line) => [line.open, line.close, line.direction])).toEqual([
      [10, 12, "up"],
      [12, 13, "up"],
      [13, 9, "down"],
      [9, 14, "up"],
    ]);
  });

  it("starts a point-and-figure reversal one box back from the prior extreme", () => {
    const columns = pointAndFigure([10, 14, 12, 15, 10].map((close, index) => bar(close, index)), 1, 3);
    expect(columns.map((column) => [column.direction, column.boxes])).toEqual([
      ["up", [11, 12, 13, 14, 15]],
      ["down", [14, 13, 12, 11, 10]],
    ]);
  });

  it("walks a bullish path into range bars", () => {
    const source = bar(13, 0, { open: 10, high: 14, low: 9 });
    const result = rangeBars([source], 2);
    expect(result.bars.map((item) => [item.open, item.close])).toEqual([
      [10, 12],
      [12, 14],
    ]);
    expect(result.forming).toMatchObject({ open: 14, close: 13, high: 14, low: 13 });
  });
});

describe("price scales", () => {
  it("maps linear, logarithmic, and percentage prices", () => {
    expect(PRICE_SCALE_AXIS).toEqual({
      linear: "normal",
      logarithmic: "logarithm",
      percentage: "percentage",
    });
    expect(scalePrice(10, "linear")).toBe(10);
    expect(scalePrice(Math.E, "logarithmic")).toBeCloseTo(1);
    expect(scalePrice(110, "percentage", 100)).toBeCloseTo(10);
    expect(scalePrice(90, "percentage", 100)).toBeCloseTo(-10);
    expect(() => scalePrice(-1, "logarithmic")).toThrow(/positive/);
  });
});

describe("readout", () => {
  const bars = [bar(10, 0), bar(12, 1), bar(11, 2)];

  it("reads the bar under the crosshair, the last price, and the countdown", () => {
    expect(barCovering(bars, bars[1]!.openTime + 1)?.close).toBe(12);
    expect(barCovering(bars, bars[1]!.closeTime)?.close).toBe(11);
    expect(barCovering(bars, bars[2]!.closeTime)?.close).toBe(11);
    expect(crosshair(bars[0]!, 10.5)).toEqual({
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: 1,
      pointerPrice: 10.5,
    });
    expect(lastPrice(bars)).toBe(11);
    expect(lastPrice([])).toBeNull();
    expect(countdownToClose(1_000, 400)).toBe(600);
    expect(countdownToClose(1_000, 1_000)).toBe(0);
    expect(countdownToClose(1_000, 1_500)).toBe(0);
  });
});
