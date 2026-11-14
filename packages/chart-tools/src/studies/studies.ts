// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { ad, atr, bb, ema, kc, macd, obv, rma, rsi, sma, stoch, vwap, vwma, wma } from "indicatorts";

import { closedBars, type Bar } from "../bar.js";
import { sessionLevels } from "./session.js";

export type StudyId =
  | "sma"
  | "ema"
  | "wma"
  | "rma"
  | "vwma"
  | "rsi"
  | "macd"
  | "stochastic"
  | "bollinger"
  | "keltner"
  | "atr"
  | "obv"
  | "vwap"
  | "accumulation"
  | "sessionLevels";

export interface StudyParams {
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  kPeriod?: number;
  dPeriod?: number;
  /** `first` starts from the first value. `sma` starts from a simple average. */
  seed?: "first" | "sma";
  openMinute?: number;
  offsetMinutes?: number;
}

export type Plot = (number | null)[];

export interface StudyResult {
  id: StudyId;
  plots: Record<string, Plot>;
}

const PLOT_NAMES: Record<StudyId, readonly string[]> = {
  sma: ["average"],
  ema: ["average"],
  wma: ["average"],
  rma: ["average"],
  vwma: ["average"],
  rsi: ["rsi"],
  macd: ["macd", "signal", "histogram"],
  stochastic: ["k", "d"],
  bollinger: ["lower", "middle", "upper"],
  keltner: ["lower", "middle", "upper"],
  atr: ["trueRange", "atr"],
  obv: ["obv"],
  vwap: ["vwap"],
  accumulation: ["accumulation"],
  sessionLevels: ["sessionHigh", "sessionLow", "previousHigh", "previousLow"],
};

function emptyPlots(id: StudyId): Record<string, Plot> {
  const plots: Record<string, Plot> = {};
  for (const name of PLOT_NAMES[id]) {
    plots[name] = [];
  }
  return plots;
}

function asPlot(values: readonly number[]): Plot {
  return values.map((value) => (Number.isFinite(value) ? value : null));
}

function periodOf(params: StudyParams, fallback: number): number {
  const period = params.period ?? fallback;
  if (!Number.isInteger(period) || period < 1) {
    throw new Error("period must be a positive integer");
  }
  return period;
}

function positiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function column(bars: readonly Bar[], field: "high" | "low" | "close" | "volume"): number[] {
  return bars.map((bar) => bar[field]);
}

/**
 * Run a shipped study on the bars whose close is at or before `cursor`.
 * Formulas come from indicatorts. Session levels are computed here.
 * A non-finite library value is an empty slot.
 */
export function runStudy(
  id: StudyId,
  bars: readonly Bar[],
  cursor: number,
  params: StudyParams = {},
): StudyResult {
  if (!Object.hasOwn(PLOT_NAMES, id)) {
    throw new Error(`unknown study: ${String(id)}`);
  }
  const window = closedBars(bars, cursor);
  if (window.length === 0) {
    return { id, plots: emptyPlots(id) };
  }
  const close = column(window, "close");
  const high = column(window, "high");
  const low = column(window, "low");
  const volume = column(window, "volume");
  const plots = compute(id, window, close, high, low, volume, params);
  for (const [name, values] of Object.entries(plots)) {
    if (values.length !== window.length) {
      throw new Error(`${id}.${name} returned ${values.length} values for ${window.length} bars`);
    }
  }
  return { id, plots };
}

function compute(
  id: StudyId,
  window: readonly Bar[],
  close: number[],
  high: number[],
  low: number[],
  volume: number[],
  params: StudyParams,
): Record<string, Plot> {
  const seeded = params.seed === undefined ? {} : { seed: params.seed };
  switch (id) {
    case "sma":
      return { average: asPlot(sma(close, { period: periodOf(params, 20) })) };
    case "ema":
      return { average: asPlot(ema(close, { period: periodOf(params, 20), ...seeded })) };
    case "wma":
      return { average: asPlot(wma(close, { period: periodOf(params, 20) })) };
    case "rma":
      return { average: asPlot(rma(close, { period: periodOf(params, 14), ...seeded })) };
    case "vwma":
      return { average: asPlot(vwma(close, volume, { period: periodOf(params, 20) })) };
    case "rsi":
      return { rsi: asPlot(rsi(close, { period: periodOf(params, 14), ...seeded })) };
    case "macd": {
      const fast = positiveInt("fast", params.fast ?? 12);
      const slow = positiveInt("slow", params.slow ?? 26);
      const signal = positiveInt("signal", params.signal ?? 9);
      const result = macd(close, { fast, slow, signal, ...seeded });
      const histogram = result.macdLine.map((value, index) => value - result.signalLine[index]!);
      return {
        macd: asPlot(result.macdLine),
        signal: asPlot(result.signalLine),
        histogram: asPlot(histogram),
      };
    }
    case "stochastic": {
      const kPeriod = positiveInt("kPeriod", params.kPeriod ?? params.period ?? 14);
      const dPeriod = positiveInt("dPeriod", params.dPeriod ?? 3);
      const result = stoch(high, low, close, { kPeriod, dPeriod });
      return { k: asPlot(result.k), d: asPlot(result.d) };
    }
    case "bollinger": {
      const result = bb(close, { period: periodOf(params, 20) });
      return { lower: asPlot(result.lower), middle: asPlot(result.middle), upper: asPlot(result.upper) };
    }
    case "keltner": {
      const result = kc(high, low, close, { period: periodOf(params, 20) });
      return { lower: asPlot(result.lower), middle: asPlot(result.middle), upper: asPlot(result.upper) };
    }
    case "atr": {
      const result = atr(high, low, close, { period: periodOf(params, 14), ...seeded });
      return { trueRange: asPlot(result.trLine), atr: asPlot(result.atrLine) };
    }
    case "obv":
      return { obv: asPlot(obv(close, volume)) };
    case "vwap":
      return { vwap: asPlot(vwap(close, volume, { period: periodOf(params, 14) })) };
    case "accumulation":
      return { accumulation: asPlot(ad(high, low, close, volume)) };
    case "sessionLevels": {
      const levels = sessionLevels(window, params.openMinute ?? 0, params.offsetMinutes ?? 0);
      return {
        sessionHigh: levels.sessionHigh,
        sessionLow: levels.sessionLow,
        previousHigh: levels.previousHigh,
        previousLow: levels.previousLow,
      };
    }
    default: {
      const neverId: never = id;
      throw new Error(`unknown study: ${String(neverId)}`);
    }
  }
}
