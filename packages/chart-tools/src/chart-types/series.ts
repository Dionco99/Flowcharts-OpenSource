// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.ts";

export interface LinePoint {
  time: number;
  value: number;
}

export function lineSeries(bars: readonly Bar[]): LinePoint[] {
  return bars.map((bar) => ({ time: bar.time, value: bar.close }));
}

export function lineWithMarkers(bars: readonly Bar[]): { time: number; value: number; marker: true }[] {
  return bars.map((bar) => ({ time: bar.time, value: bar.close, marker: true }));
}

/** Step line keeps the previous close until the next bar, then jumps. */
export function stepLine(bars: readonly Bar[]): LinePoint[] {
  const out: LinePoint[] = [];
  for (let index = 0; index < bars.length; index += 1) {
    out.push({ time: bars[index].time, value: bars[index].close });
    if (index + 1 < bars.length) out.push({ time: bars[index + 1].time, value: bars[index].close });
  }
  return out;
}

export function hlcArea(bars: readonly Bar[]): { time: number; high: number; low: number; close: number }[] {
  return bars.map((bar) => ({ time: bar.time, high: bar.high, low: bar.low, close: bar.close }));
}

export function baselineSeries(bars: readonly Bar[], baseline: number): { time: number; value: number; side: "above" | "below" | "on" }[] {
  return bars.map((bar) => ({
    time: bar.time,
    value: bar.close,
    side: bar.close > baseline ? "above" : bar.close < baseline ? "below" : "on",
  }));
}

export function columns(bars: readonly Bar[], source: "close" | "change" = "change"): LinePoint[] {
  return bars.map((bar, index) => ({
    time: bar.time,
    value: source === "close" ? bar.close : bar.close - (index === 0 ? bar.open : bars[index - 1].close),
  }));
}

export function highLow(bars: readonly Bar[]): { time: number; high: number; low: number }[] {
  return bars.map((bar) => ({ time: bar.time, high: bar.high, low: bar.low }));
}

/** Candle body is unchanged. Width is volume divided by the largest volume in the window. */
export function volumeCandles(bars: readonly Bar[]): { time: number; open: number; high: number; low: number; close: number; width: number }[] {
  const peak = bars.reduce((max, bar) => Math.max(max, bar.volume), 0);
  return bars.map((bar) => ({
    time: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    width: peak === 0 ? 0 : bar.volume / peak,
  }));
}
