// SPDX-License-Identifier: Apache-2.0

import { mulberry32 } from "./prng.ts";
import { histogram, summarize } from "./stats.ts";
import type { HistogramBin, Percentiles } from "./types.ts";

export type MonteCarloResult = {
  terminalR: Percentiles;
  maxDrawdownR: Percentiles;
  longestLosingStreak: Percentiles;
  riskOfRuin: number;
  medianTradesToRuin: number | null;
  histogram: HistogramBin[];
  /** Equity curves, including the starting equity. One entry per kept path. */
  chartPaths: number[][];
  profitable: number;
};

export type MonteCarloInput = {
  sample: readonly number[];
  horizon: number;
  paths: number;
  startingR: number;
  ruinAt: number;
  seed: number;
  chartPaths: number;
};

/**
 * Repeat one strategy: each trade is an independent draw from the sample,
 * with replacement. Stake is a constant 1R, so equity adds the R result.
 * Order is what creates drawdowns, ruin, and losing streaks.
 * An account that touches the ruin level stops. It does not trade back.
 */
export function monteCarlo(input: MonteCarloInput): MonteCarloResult {
  const { sample, horizon, paths, startingR, ruinAt, seed } = input;
  const keep = Math.max(0, Math.min(paths, input.chartPaths));
  const rng = mulberry32(seed);
  const n = sample.length;
  const terminalR = new Array<number>(paths);
  const maxDrawdown = new Array<number>(paths);
  const longestStreak = new Array<number>(paths);
  const ruinTrades: number[] = [];
  const chartPaths: number[][] = [];
  let profitable = 0;

  for (let path = 0; path < paths; path++) {
    let equity = startingR;
    let peak = startingR;
    let worst = 0;
    let streak = 0;
    let longest = 0;
    let ruined = startingR <= ruinAt;
    let ruinTrade = ruined ? 0 : -1;
    const curve = path < keep ? new Array<number>(horizon + 1) : null;
    if (curve) curve[0] = startingR;

    for (let trade = 1; trade <= horizon; trade++) {
      if (!ruined) {
        const r = sample[Math.floor(rng() * n)]!;
        equity += r;
        if (equity > peak) peak = equity;
        const drawdown = peak - equity;
        if (drawdown > worst) worst = drawdown;
        if (r < 0) {
          streak += 1;
          if (streak > longest) longest = streak;
        } else {
          streak = 0;
        }
        if (equity <= ruinAt) {
          ruined = true;
          ruinTrade = trade;
        }
      }
      if (curve) curve[trade] = equity;
    }

    const total = equity - startingR;
    terminalR[path] = total;
    maxDrawdown[path] = worst;
    longestStreak[path] = longest;
    if (total > 0) profitable += 1;
    if (ruined) ruinTrades.push(ruinTrade);
    if (curve) chartPaths.push(curve);
  }

  ruinTrades.sort((a, b) => a - b);
  const medianTradesToRuin =
    ruinTrades.length === 0 ? null : summarize(ruinTrades).p50;

  return {
    terminalR: summarize(terminalR),
    maxDrawdownR: summarize(maxDrawdown),
    longestLosingStreak: summarize(longestStreak),
    riskOfRuin: ruinTrades.length / paths,
    medianTradesToRuin,
    histogram: histogram(terminalR, 32),
    chartPaths,
    profitable,
  };
}
