// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

/** One OHLCV bar. `time` is the open time in epoch milliseconds. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A plot aligned to the bar window. Null is an empty warmup slot. */
export type Series = (number | null)[];

export type Plots = Record<string, Series>;

export function opens(bars: readonly Bar[]): number[] {
  return bars.map((bar) => bar.open);
}

export function highs(bars: readonly Bar[]): number[] {
  return bars.map((bar) => bar.high);
}

export function lows(bars: readonly Bar[]): number[] {
  return bars.map((bar) => bar.low);
}

export function closes(bars: readonly Bar[]): number[] {
  return bars.map((bar) => bar.close);
}

export function volumes(bars: readonly Bar[]): number[] {
  return bars.map((bar) => bar.volume);
}

export function cleanSeries(values: readonly number[]): Series {
  return values.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null));
}

export function plotsFrom(result: object): Plots {
  if (Array.isArray(result)) {
    return { value: cleanSeries(result as number[]) };
  }
  const plots: Plots = {};
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value)) {
      plots[key] = cleanSeries(value as number[]);
    }
  }
  return plots;
}

export function assertAscending(bars: readonly Bar[]): void {
  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index].time <= bars[index - 1].time) {
      throw new Error(`bars must be strictly ascending at index ${index}`);
    }
  }
}

export function barCloseTime(bar: Bar, durationMs: number): number {
  if (!(durationMs > 0)) {
    throw new Error("durationMs must be positive");
  }
  return bar.time + durationMs;
}
