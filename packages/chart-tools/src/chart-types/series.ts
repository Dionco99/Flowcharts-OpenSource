// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.js";

export interface LinePoint {
  time: number;
  value: number;
}

export interface ColumnPoint {
  time: number;
  value: number | null;
}

export interface BaselinePoint extends LinePoint {
  side: "above" | "below" | "on";
}

export interface HighLowPoint {
  time: number;
  high: number;
  low: number;
}

/** One point per bar at the close. */
export function lineSeries(bars: readonly Bar[]): LinePoint[] {
  return bars.map((bar) => ({ time: bar.closeTime, value: bar.close }));
}

/**
 * The close is repeated at the next bar's time, then the new close is written.
 * The first bar contributes only its own close.
 */
export function stepSeries(bars: readonly Bar[]): LinePoint[] {
  const points: LinePoint[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    if (i > 0) {
      points.push({ time: bar.closeTime, value: bars[i - 1]!.close });
    }
    points.push({ time: bar.closeTime, value: bar.close });
  }
  return points;
}

/** Close plotted as a filled area. The library candle type is `area`. */
export function areaSeries(bars: readonly Bar[]): { libraryType: "area"; points: LinePoint[] } {
  return { libraryType: "area", points: lineSeries(bars) };
}

/** Each close marked above, below, or on a base price. */
export function baselineSeries(bars: readonly Bar[], base: number): BaselinePoint[] {
  if (!Number.isFinite(base)) {
    throw new Error("baseline price must be finite");
  }
  return bars.map((bar) => ({
    time: bar.closeTime,
    value: bar.close,
    side: bar.close > base ? "above" : bar.close < base ? "below" : "on",
  }));
}

/**
 * Column values. `change` is the close-to-close difference and is the default.
 * The first change has no previous close, so its value is empty.
 */
export function columnSeries(
  bars: readonly Bar[],
  field: "change" | "close" = "change",
): ColumnPoint[] {
  if (field !== "change" && field !== "close") {
    throw new Error(`unknown column field: ${String(field)}`);
  }
  return bars.map((bar, index) => {
    if (field === "close") {
      return { time: bar.closeTime, value: bar.close };
    }
    if (index === 0) {
      return { time: bar.closeTime, value: null };
    }
    return { time: bar.closeTime, value: bar.close - bars[index - 1]!.close };
  });
}

/** High and low only. */
export function highLowSeries(bars: readonly Bar[]): HighLowPoint[] {
  return bars.map((bar) => ({ time: bar.closeTime, high: bar.high, low: bar.low }));
}
