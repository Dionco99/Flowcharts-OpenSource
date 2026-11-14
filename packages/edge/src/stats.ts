// SPDX-License-Identifier: Apache-2.0

import type { HistogramBin, Percentiles, SampleStats } from "./types.ts";

export function sampleStats(sample: readonly number[]): SampleStats {
  const n = sample.length;
  if (n < 2) throw new Error("Need at least two trades.");
  for (const r of sample) {
    if (!Number.isFinite(r)) throw new Error("Every R value has to be a finite number.");
  }

  let sum = 0;
  let wins = 0;
  let losses = 0;
  let winSum = 0;
  let lossSum = 0;
  for (const r of sample) {
    sum += r;
    if (r > 0) {
      wins += 1;
      winSum += r;
    } else if (r < 0) {
      losses += 1;
      lossSum += r;
    }
  }

  const expectancy = sum / n;
  let sumSq = 0;
  for (const r of sample) {
    const delta = r - expectancy;
    sumSq += delta * delta;
  }

  // Two divisors, on purpose.
  // n − 1 estimates the standard deviation of a larger population. The
  // standard error of the expectancy uses that, because the sample may not
  // be the true edge.
  // n is the variance of the distribution the Monte Carlo actually draws
  // from: the sample, treated as the whole distribution.
  const empiricalVariance = sumSq / n;
  const stdev = Math.sqrt(sumSq / (n - 1));
  const empiricalStdev = Math.sqrt(empiricalVariance);
  const avgWin = wins > 0 ? winSum / wins : null;
  const avgLoss = losses > 0 ? lossSum / losses : null;
  const payoffRatio =
    avgWin !== null && avgLoss !== null && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;
  const profitFactor = lossSum < 0 ? winSum / Math.abs(lossSum) : null;
  const sqn = stdev > 0 ? (expectancy / stdev) * Math.sqrt(n) : null;

  return {
    trades: n,
    expectancy,
    stdev,
    empiricalStdev,
    empiricalVariance,
    standardError: stdev / Math.sqrt(n),
    winRate: wins / n,
    lossRate: losses / n,
    scratchRate: (n - wins - losses) / n,
    avgWin,
    avgLoss,
    payoffRatio,
    profitFactor,
    sqn,
  };
}

/**
 * Standard normal CDF. Abramowitz and Stegun 26.2.17.
 * Accurate to about 7.5e-8, which is enough for a chance-of-profit label.
 */
export function normalCdf(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const negative = z < 0;
  const x = Math.abs(z);
  if (x > 8) return negative ? 0 : 1;
  const t = 1 / (1 + 0.2316419 * x);
  const density = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const poly = (((((1.330274429 * t - 1.821255978) * t + 1.781477937) * t - 0.356563782) * t + 0.31938153) * t);
  const cdf = 1 - density * poly;
  return negative ? 1 - cdf : cdf;
}

/**
 * Normal approximation of P(total R > 0) after `trades` independent draws.
 * Uses the empirical standard deviation, divisor n, matching the Monte Carlo.
 */
export function probabilityProfitNormal(
  expectancy: number,
  empiricalStdev: number,
  trades: number,
): number {
  if (trades <= 0) return 0;
  if (empiricalStdev === 0) return expectancy > 0 ? 1 : 0;
  const z = (expectancy / empiricalStdev) * Math.sqrt(trades);
  return normalCdf(z);
}

/** Hyndman–Fan type 7 percentile. `sorted` is ascending and non-empty. p is in [0, 1]. */
export function percentile(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) throw new Error("Cannot take a percentile of an empty sample.");
  if (p <= 0) return sorted[0]!;
  if (p >= 1) return sorted[n - 1]!;
  const rank = 1 + (n - 1) * p;
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const fraction = rank - lo;
  const left = sorted[lo - 1]!;
  const right = sorted[hi - 1]!;
  return left + (right - left) * fraction;
}

export function summarize(values: readonly number[]): Percentiles {
  if (values.length === 0) throw new Error("Cannot summarize an empty sample.");
  const sorted = values.slice().sort((a, b) => a - b);
  let sum = 0;
  for (const value of values) sum += value;
  return {
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: sum / values.length,
    p05: percentile(sorted, 0.05),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

export function histogram(values: readonly number[], binCount: number): HistogramBin[] {
  if (values.length === 0) return [];
  const bins = Math.max(1, Math.floor(binCount));
  let min = values[0]!;
  let max = values[0]!;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) {
    return [{ start: min, end: max, count: values.length, probability: 1 }];
  }
  const width = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  for (const value of values) {
    let index = Math.floor((value - min) / width);
    if (index >= bins) index = bins - 1;
    if (index < 0) index = 0;
    counts[index]! += 1;
  }
  return counts.map((count, index) => ({
    start: min + index * width,
    end: min + (index + 1) * width,
    count,
    probability: count / values.length,
  }));
}
