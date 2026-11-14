// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { ema, macd, sma } from "indicatorts";
import { describe, expect, it } from "vitest";

import { closedBars, type Bar } from "../src/bar.js";
import { runStudy } from "../src/studies/studies.js";

function bar(close: number, index: number, extra: Partial<Bar> = {}): Bar {
  const openTime = extra.openTime ?? index * 60_000;
  const open = extra.open ?? close;
  return {
    openTime,
    closeTime: extra.closeTime ?? openTime + 60_000,
    open,
    high: extra.high ?? Math.max(open, close),
    low: extra.low ?? Math.min(open, close),
    close,
    volume: extra.volume ?? 10,
  };
}

describe("moving averages, oscillators, volatility, and volume", () => {
  const closes = [1, 2, 3, 4, 5, 6, 5, 4, 6, 7];
  const bars = closes.map((close, index) =>
    bar(close, index, { high: close + 1, low: close - 1, volume: 10 + index }),
  );
  const cursor = bars[bars.length - 1]!.closeTime;

  it("runs the shipped averages on the window and leaves weighted warmup empty", () => {
    const simple = runStudy("sma", bars, cursor, { period: 2 });
    expect(simple.plots.average).toEqual(sma(closes, { period: 2 }));
    expect(simple.plots.average?.at(-1)).toBe(6.5);

    const exponential = runStudy("ema", bars, cursor, { period: 3 });
    expect(exponential.plots.average).toEqual(ema(closes, { period: 3 }));

    for (const id of ["wma", "rma", "vwma"] as const) {
      const result = runStudy(id, bars, cursor, { period: 3 });
      expect(result.plots.average).toHaveLength(bars.length);
    }
    const weighted = runStudy("wma", bars, cursor, { period: 3 });
    expect(weighted.plots.average?.slice(0, 2)).toEqual([null, null]);
    expect(weighted.plots.average?.[2]).toBeCloseTo((1 + 4 + 9) / 6);
  });

  it("runs RSI, MACD with a histogram, and stochastic", () => {
    const strength = runStudy("rsi", bars, cursor, { period: 3 });
    expect(strength.plots.rsi).toHaveLength(bars.length);
    expect(strength.plots.rsi?.every((value) => value !== null && value >= 0 && value <= 100)).toBe(true);

    const convergence = runStudy("macd", bars, cursor, { fast: 3, slow: 6, signal: 3 });
    const direct = macd(closes, { fast: 3, slow: 6, signal: 3 });
    expect(convergence.plots.macd).toEqual(direct.macdLine);
    expect(convergence.plots.signal).toEqual(direct.signalLine);
    expect(convergence.plots.histogram?.[4]).toBeCloseTo(direct.macdLine[4]! - direct.signalLine[4]!);

    const oscillator = runStudy("stochastic", bars, cursor, { kPeriod: 3, dPeriod: 3 });
    expect(oscillator.plots.k).toHaveLength(bars.length);
    expect(oscillator.plots.d).toHaveLength(bars.length);
  });

  it("runs Bollinger bands, Keltner channels, and average true range", () => {
    const bands = runStudy("bollinger", bars, cursor, { period: 3 });
    expect(bands.plots.middle?.[2]).toBeCloseTo(2);
    expect(bands.plots.upper?.[2]).toBeGreaterThan(bands.plots.middle?.[2] ?? 0);
    expect(bands.plots.lower?.[2]).toBeLessThan(bands.plots.middle?.[2] ?? 0);

    const channel = runStudy("keltner", bars, cursor, { period: 3 });
    expect(channel.plots.upper?.[4]).toBeGreaterThan(channel.plots.middle?.[4] ?? 0);
    expect(channel.plots.lower?.[4]).toBeLessThan(channel.plots.middle?.[4] ?? 0);

    const range = runStudy("atr", bars, cursor, { period: 3 });
    expect(range.plots.trueRange?.[0]).toBe(2);
    expect(range.plots.atr).toHaveLength(bars.length);
  });

  it("runs on-balance volume, VWAP, and accumulation/distribution", () => {
    const volumeBars = [
      bar(1, 0, { high: 2, low: 0, volume: 10 }),
      bar(2, 1, { high: 3, low: 1, volume: 5 }),
      bar(2, 2, { high: 3, low: 1, volume: 7 }),
      bar(1, 3, { high: 2, low: 0, volume: 4 }),
    ];
    const end = volumeBars[3]!.closeTime;
    expect(runStudy("obv", volumeBars, end).plots.obv).toEqual([0, 5, 5, 1]);
    const typical = runStudy("vwap", volumeBars, end, { period: 2 });
    expect(typical.plots.vwap).toHaveLength(4);
    expect(typical.plots.vwap?.[1]).toBeCloseTo((1 * 10 + 2 * 5) / 15);
    const accumulated = runStudy("accumulation", volumeBars, end);
    expect(accumulated.plots.accumulation).toHaveLength(4);
    expect(accumulated.plots.accumulation?.[0]).toBeCloseTo(0);
  });
});

describe("session levels", () => {
  it("tracks the session extremes and the previous session day", () => {
    const openMinute = 17 * 60;
    const offsetMinutes = -240;
    const first = Date.UTC(2024, 5, 2, 21, 0, 0);
    const later = Date.UTC(2024, 5, 2, 22, 0, 0);
    const nextSession = Date.UTC(2024, 5, 3, 21, 0, 0);
    const bars = [
      bar(5, 0, { openTime: first, closeTime: first + 60_000, high: 5, low: 1 }),
      bar(6, 1, { openTime: later, closeTime: later + 60_000, high: 7, low: 2 }),
      bar(3, 2, { openTime: nextSession, closeTime: nextSession + 60_000, high: 3, low: 0 }),
    ];
    const levels = runStudy("sessionLevels", bars, nextSession + 60_000, { openMinute, offsetMinutes });
    expect(levels.plots.sessionHigh).toEqual([5, 7, 3]);
    expect(levels.plots.sessionLow).toEqual([1, 1, 0]);
    expect(levels.plots.previousHigh).toEqual([null, null, 7]);
    expect(levels.plots.previousLow).toEqual([null, null, 1]);
  });
});

describe("closed bars only", () => {
  it("drops a bar whose close is still after the cursor", () => {
    const bars = [bar(1, 0), bar(3, 1), bar(100, 2)];
    const cursor = bars[1]!.closeTime;
    expect(closedBars(bars, cursor)).toHaveLength(2);
    const average = runStudy("sma", bars, cursor, { period: 2 });
    expect(average.plots.average).toEqual([1, 2]);
    expect(runStudy("sma", bars, bars[2]!.closeTime, { period: 2 }).plots.average?.[2]).toBe(51.5);
  });
});
