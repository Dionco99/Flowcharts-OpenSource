// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import { ao, aroon, ema, macd, movingLinearRegressionUsingLeastSquare, mstd, rma, sma, smma, tr, vwap } from "indicatorts";
import { cleanSeries, closes, highs, lows, volumes, type Bar, type Series } from "../bar.ts";
import { sessionDay } from "./session.ts";

function finite(values: readonly number[]): Series {
  return cleanSeries(values);
}

function wilder(values: Series, period: number): Series {
  const out: Series = values.map(() => null);
  let seedAt = -1;
  for (let index = period - 1; index < values.length; index += 1) {
    let sum = 0;
    let ok = true;
    for (let back = 0; back < period; back += 1) {
      const value = values[index - period + 1 + back];
      if (value == null) {
        ok = false;
        break;
      }
      sum += value;
    }
    if (ok) {
      seedAt = index;
      out[index] = sum / period;
      break;
    }
  }
  if (seedAt < 0) return out;
  let previous = out[seedAt] as number;
  for (let index = seedAt + 1; index < values.length; index += 1) {
    const value = values[index];
    if (value == null) {
      out[index] = null;
      continue;
    }
    previous = (previous * (period - 1) + value) / period;
    out[index] = previous;
  }
  return out;
}

/** Wilder directional index. Plus DI, minus DI, and ADX. */
export function averageDirectionalIndex(bars: readonly Bar[], period = 14): { plus: Series; minus: Series; adx: Series } {
  const high = highs(bars);
  const low = lows(bars);
  const close = closes(bars);
  const trueRange = tr(high, low, close);
  const plusDm = [0];
  const minusDm = [0];
  for (let index = 1; index < bars.length; index += 1) {
    const up = high[index] - high[index - 1];
    const down = low[index - 1] - low[index];
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
  }
  const smoothRange = finite(rma(trueRange, { period, seed: "sma" }));
  const smoothPlus = finite(rma(plusDm, { period, seed: "sma" }));
  const smoothMinus = finite(rma(minusDm, { period, seed: "sma" }));
  const plus: Series = [];
  const minus: Series = [];
  const dx: Series = [];
  for (let index = 0; index < bars.length; index += 1) {
    const range = smoothRange[index];
    const up = smoothPlus[index];
    const down = smoothMinus[index];
    if (range == null || up == null || down == null || range === 0) {
      plus.push(null);
      minus.push(null);
      dx.push(null);
      continue;
    }
    const plusDi = (100 * up) / range;
    const minusDi = (100 * down) / range;
    plus.push(plusDi);
    minus.push(minusDi);
    const total = plusDi + minusDi;
    dx.push(total === 0 ? null : (100 * Math.abs(plusDi - minusDi)) / total);
  }
  return { plus, minus, adx: wilder(dx, period) };
}

export function aroonOscillator(bars: readonly Bar[], period = 25): Series {
  const result = aroon(highs(bars), lows(bars), { period });
  return result.up.map((up, index) => {
    const down = result.down[index];
    return Number.isFinite(up) && Number.isFinite(down) ? up - down : null;
  });
}

/** Confirmed swing prices. A pivot is written only after price reverses by `threshold`. */
export function zigzag(bars: readonly Bar[], threshold: number): Series {
  if (!(threshold > 0)) throw new Error("threshold must be positive");
  const out: Series = bars.map(() => null);
  if (bars.length === 0) return out;
  let trend = 0;
  let high = bars[0].close;
  let highIndex = 0;
  let low = bars[0].close;
  let lowIndex = 0;
  let last = bars[0].close;
  for (let index = 1; index < bars.length; index += 1) {
    const price = bars[index].close;
    if (trend >= 0 && price >= high) {
      high = price;
      highIndex = index;
    }
    if (trend <= 0 && price <= low) {
      low = price;
      lowIndex = index;
    }
    if (trend >= 0 && high - price >= threshold && high > last) {
      out[highIndex] = high;
      last = high;
      trend = -1;
      low = price;
      lowIndex = index;
    } else if (trend <= 0 && price - low >= threshold && low < last) {
      out[lowIndex] = low;
      last = low;
      trend = 1;
      high = price;
      highIndex = index;
    }
  }
  return out;
}

export function anchoredVwap(bars: readonly Bar[], anchorTime: number): Series {
  let priceVolume = 0;
  let volume = 0;
  return bars.map((bar) => {
    if (bar.time < anchorTime) return null;
    const typical = (bar.high + bar.low + bar.close) / 3;
    priceVolume += typical * bar.volume;
    volume += bar.volume;
    return volume === 0 ? null : priceVolume / volume;
  });
}

export function vwapBands(bars: readonly Bar[], period = 20, multiplier = 2): { middle: Series; upper: Series; lower: Series } {
  const typical = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
  const middle = finite(vwap(closes(bars), volumes(bars), { period }));
  const deviation = finite(mstd(typical, { period }));
  const upper = middle.map((value, index) => (value == null || deviation[index] == null ? null : value + multiplier * deviation[index]));
  const lower = middle.map((value, index) => (value == null || deviation[index] == null ? null : value - multiplier * deviation[index]));
  return { middle, upper, lower };
}

function residuals(fit: Series, values: readonly number[], index: number, period: number): number[] | null {
  const window: number[] = [];
  for (let back = 0; back < period; back += 1) {
    const at = index - period + 1 + back;
    const line = fit[at];
    if (line == null) return null;
    window.push(values[at] - line);
  }
  return window;
}

function populationStdev(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function regressionChannel(values: readonly number[], period = 20, multiplier = 2): { fit: Series; upper: Series; lower: Series } {
  return bandChannel(values, period, (deviation) => multiplier * deviation);
}

function bandChannel(values: readonly number[], period: number, widthOf: (deviation: number) => number): { fit: Series; upper: Series; lower: Series } {
  const x = values.map((_, index) => index);
  const fit = finite(movingLinearRegressionUsingLeastSquare(period, x, values as number[]));
  const upper: Series = [];
  const lower: Series = [];
  for (let index = 0; index < values.length; index += 1) {
    const line = fit[index];
    const window = line == null ? null : residuals(fit, values, index, period);
    if (line == null || window == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const width = widthOf(populationStdev(window));
    upper.push(line + width);
    lower.push(line - width);
  }
  return { fit, upper, lower };
}

export function standardErrorBands(values: readonly number[], period = 20, multiplier = 2): { fit: Series; upper: Series; lower: Series } {
  return bandChannel(values, period, (deviation) => (multiplier * deviation) / Math.sqrt(period));
}

export function alligator(bars: readonly Bar[]): { jaw: Series; teeth: Series; lips: Series } {
  const close = closes(bars);
  return {
    jaw: shift(finite(smma(close, { period: 13 })), 8),
    teeth: shift(finite(smma(close, { period: 8 })), 5),
    lips: shift(finite(smma(close, { period: 5 })), 3),
  };
}

function shift(values: Series, barsForward: number): Series {
  return values.map((_, index) => (index < barsForward ? null : values[index - barsForward]));
}

/** A fractal is confirmed only once `width` bars have printed on its right. */
export function fractals(bars: readonly Bar[], width = 2): { high: Series; low: Series } {
  const high: Series = bars.map(() => null);
  const low: Series = bars.map(() => null);
  for (let index = width; index < bars.length - width; index += 1) {
    let highPivot = true;
    let lowPivot = true;
    for (let side = 1; side <= width; side += 1) {
      if (bars[index].high <= bars[index - side].high || bars[index].high <= bars[index + side].high) highPivot = false;
      if (bars[index].low >= bars[index - side].low || bars[index].low >= bars[index + side].low) lowPivot = false;
    }
    if (highPivot) high[index] = bars[index].high;
    if (lowPivot) low[index] = bars[index].low;
  }
  return { high, low };
}

export function marketFacilitation(bars: readonly Bar[]): Series {
  return bars.map((bar) => (bar.volume === 0 ? null : (bar.high - bar.low) / bar.volume));
}

export function accelerator(bars: readonly Bar[]): Series {
  const oscillator = ao(highs(bars), lows(bars));
  const average = sma(oscillator, { period: 5 });
  return oscillator.map((value, index) => (Number.isFinite(value) && Number.isFinite(average[index]) ? value - average[index] : null));
}

export function chaikinVolatility(bars: readonly Bar[], emaPeriod = 10, rocPeriod = 10): Series {
  const ranges = bars.map((bar) => bar.high - bar.low);
  const smoothed = ema(ranges, { period: emaPeriod });
  return finite(rocOf(smoothed, rocPeriod));
}

function rocOf(values: number[], period: number): number[] {
  return values.map((value, index) => {
    const base = values[index - period];
    if (!Number.isFinite(value) || !Number.isFinite(base) || base === 0) return Number.NaN;
    return ((value - base) / base) * 100;
  });
}

/** 1 when the average and the MACD histogram are both rising, -1 when both are falling, otherwise 0. */
export function elderImpulse(bars: readonly Bar[], period = 13): Series {
  const average = ema(closes(bars), { period });
  const signal = macd(closes(bars));
  return bars.map((_, index) => {
    if (index === 0) return null;
    const averageNow = average[index];
    const averagePrev = average[index - 1];
    const histNow = signal.macdLine[index] - signal.signalLine[index];
    const histPrev = signal.macdLine[index - 1] - signal.signalLine[index - 1];
    if (![averageNow, averagePrev, histNow, histPrev].every(Number.isFinite)) return null;
    const averageUp = averageNow > averagePrev;
    const averageDown = averageNow < averagePrev;
    const histUp = histNow > histPrev;
    const histDown = histNow < histPrev;
    if (averageUp && histUp) return 1;
    if (averageDown && histDown) return -1;
    return 0;
  });
}

export function momentum(values: readonly number[], period = 10): Series {
  return values.map((value, index) => (index < period ? null : value - values[index - period]));
}

export function rollingCorrelation(left: readonly number[], right: readonly number[], period = 20): Series {
  return rollPair(left, right, period, (xs, ys) => {
    const cov = covariance(xs, ys);
    const leftDev = populationStdev(xs);
    const rightDev = populationStdev(ys);
    if (leftDev === 0 || rightDev === 0) return null;
    return cov / (leftDev * rightDev);
  });
}

export function rollingBeta(left: readonly number[], right: readonly number[], period = 20): Series {
  return rollPair(left, right, period, (xs, ys) => {
    const variance = populationStdev(ys) ** 2;
    if (variance === 0) return null;
    return covariance(xs, ys) / variance;
  });
}

function rollPair(left: readonly number[], right: readonly number[], period: number, reduce: (left: number[], right: number[]) => number | null): Series {
  if (left.length !== right.length) throw new Error("series must be the same length");
  const out: Series = [];
  for (let index = 0; index < left.length; index += 1) {
    if (index < period - 1) {
      out.push(null);
      continue;
    }
    out.push(reduce(left.slice(index - period + 1, index + 1), right.slice(index - period + 1, index + 1)));
  }
  return out;
}

function covariance(left: readonly number[], right: readonly number[]): number {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  return left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0) / left.length;
}

export function relativeVolume(bars: readonly Bar[], offsetMinutes = 0): Series {
  const totals = new Map<number, { sum: number; count: number }>();
  return bars.map((bar) => {
    const minute = Math.floor(((bar.time + offsetMinutes * 60_000) % 86_400_000) / 60_000);
    const prior = totals.get(minute);
    const value = prior && prior.count > 0 && prior.sum / prior.count !== 0 ? bar.volume / (prior.sum / prior.count) : null;
    const next = prior ?? { sum: 0, count: 0 };
    next.sum += bar.volume;
    next.count += 1;
    totals.set(minute, next);
    return value;
  });
}

export function volumeProfile(trades: readonly { price: number; volume: number; side?: "buy" | "sell" }[], binSize: number): { price: number; volume: number; buy: number; sell: number }[] {
  if (!(binSize > 0)) throw new Error("binSize must be positive");
  const bins = new Map<number, { price: number; volume: number; buy: number; sell: number }>();
  for (const trade of trades) {
    const price = Math.floor(trade.price / binSize) * binSize;
    const bin = bins.get(price) ?? { price, volume: 0, buy: 0, sell: 0 };
    bin.volume += trade.volume;
    if (trade.side === "buy") bin.buy += trade.volume;
    if (trade.side === "sell") bin.sell += trade.volume;
    bins.set(price, bin);
  }
  return [...bins.values()].sort((left, right) => left.price - right.price);
}

/** One count for each price bin a bar's high-low range covers. */
export function timeProfile(bars: readonly Bar[], binSize: number): { price: number; tpo: number }[] {
  if (!(binSize > 0)) throw new Error("binSize must be positive");
  const bins = new Map<number, number>();
  for (const bar of bars) {
    const first = Math.floor(bar.low / binSize) * binSize;
    const last = Math.floor(bar.high / binSize) * binSize;
    const steps = Math.round((last - first) / binSize);
    for (let step = 0; step <= steps; step += 1) {
      const price = Number((first + step * binSize).toPrecision(12));
      bins.set(price, (bins.get(price) ?? 0) + 1);
    }
  }
  return [...bins.entries()].sort((left, right) => left[0] - right[0]).map(([price, tpo]) => ({ price, tpo }));
}

export function cumulativeDelta(trades: readonly { volume: number; side: "buy" | "sell" }[]): number[] {
  let total = 0;
  return trades.map((trade) => {
    total += trade.side === "buy" ? trade.volume : -trade.volume;
    return total;
  });
}

export function footprint(bars: readonly Bar[], trades: readonly { time: number; price: number; volume: number; side: "buy" | "sell" }[], binSize: number, durationMs: number): { time: number; bins: { price: number; buy: number; sell: number }[] }[] {
  return bars.map((bar) => {
    const inside = trades.filter((trade) => trade.time >= bar.time && trade.time < bar.time + durationMs);
    const profile = volumeProfile(inside, binSize);
    return { time: bar.time, bins: profile.map((bin) => ({ price: bin.price, buy: bin.buy, sell: bin.sell })) };
  });
}

export function advanceDecline(netAdvances: readonly number[]): number[] {
  let total = 0;
  return netAdvances.map((value) => {
    total += value;
    return total;
  });
}

export function mcclellan(netAdvances: readonly number[]): { oscillator: Series; summation: Series } {
  const fast = finite(ema(netAdvances as number[], { period: 19 }));
  const slow = finite(ema(netAdvances as number[], { period: 39 }));
  const oscillator = fast.map((value, index) => (value == null || slow[index] == null ? null : value - slow[index]));
  const summation: Series = [];
  let total = 0;
  let started = false;
  for (const value of oscillator) {
    if (value == null) {
      summation.push(started ? total : null);
      continue;
    }
    total += value;
    started = true;
    summation.push(total);
  }
  return { oscillator, summation };
}

export function ivRank(history: readonly number[]): number | null {
  if (history.length < 2) return null;
  const current = history[history.length - 1];
  const prior = history.slice(0, -1);
  const low = Math.min(...prior);
  const high = Math.max(...prior);
  if (high === low) return null;
  return ((current - low) / (high - low)) * 100;
}

export function blackScholes(input: { spot: number; strike: number; rate: number; volatility: number; years: number; dividend?: number }): { call: number; put: number; delta: number; gamma: number; theta: number; vega: number; rho: number } {
  const { spot, strike, rate, volatility, years } = input;
  const dividend = input.dividend ?? 0;
  if (!(spot > 0) || !(strike > 0) || !(volatility > 0) || !(years > 0)) {
    throw new Error("spot, strike, volatility, and years must be positive");
  }
  const volTime = volatility * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate - dividend + 0.5 * volatility * volatility) * years) / volTime;
  const d2 = d1 - volTime;
  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const discount = Math.exp(-rate * years);
  const growth = Math.exp(-dividend * years);
  const call = spot * growth * nd1 - strike * discount * nd2;
  const put = strike * discount * normCdf(-d2) - spot * growth * normCdf(-d1);
  const density = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const delta = growth * nd1;
  const gamma = (growth * density) / (spot * volTime);
  const vega = spot * growth * density * Math.sqrt(years) / 100;
  const theta = ((-spot * growth * density * volatility) / (2 * Math.sqrt(years)) - rate * strike * discount * nd2 + dividend * spot * growth * nd1) / 365;
  const rho = strike * years * discount * nd2 / 100;
  return { call, put, delta, gamma, theta, vega, rho };
}

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absolute = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absolute);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-absolute * absolute);
  return 0.5 * (1 + sign * y);
}

export function sessionDayOf(time: number, offsetMinutes = 0, openMinute = 0): number {
  return sessionDay(time, offsetMinutes, openMinute);
}
