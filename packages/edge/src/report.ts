// SPDX-License-Identifier: Apache-2.0

/**
 * Edge report for a sample of R-multiples.
 *
 * Each trade risks the same 1R, so results add. A repetition draws the
 * sample independently, with replacement, for `horizon` trades. Expectancy
 * over that horizon is the sample mean times the horizon. Drawdowns, ruin,
 * and losing streaks come from the order of the draws.
 *
 * The repetitions treat the sample as the distribution of the next trade.
 * They do not widen the result for the chance that the sample edge is noise.
 * The standard error on the report is that second uncertainty.
 */

import { eventualRuinUpperBound } from "./lundberg.ts";
import { monteCarlo } from "./montecarlo.ts";
import { summarizePath } from "./path.ts";
import { buildReading } from "./reading.ts";
import { probabilityProfitNormal, sampleStats } from "./stats.ts";
import {
  losingStreakChances,
  expectedLongestLosingStreak,
  probabilityLongestAtLeast,
  typicalLosingStreak,
} from "./streaks.ts";
import type { AnalyzeOptions, EdgeReport, HorizonRow } from "./types.ts";

const DEFAULT_HORIZONS = [20, 50, 100, 200, 500];

function withTypical(
  rows: EdgeReport["streaks"],
  length: number | null,
  lossRate: number,
  horizon: number,
): EdgeReport["streaks"] {
  if (length === null || rows.some((row) => row.length === length)) return rows;
  return [...rows, { length, probability: probabilityLongestAtLeast(lossRate, horizon, length) }].sort(
    (a, b) => a.length - b.length,
  );
}

function horizonRows(expectancy: number, empiricalStdev: number, lossRate: number, selected: number, extra: readonly number[] | undefined): HorizonRow[] {
  const chosen = new Set<number>();
  for (const horizon of [...DEFAULT_HORIZONS, selected, ...(extra ?? [])]) {
    if (Number.isInteger(horizon) && horizon >= 1 && horizon <= 10000) chosen.add(horizon);
  }
  return [...chosen].sort((a, b) => a - b).map((trades) => ({
    trades,
    expectedR: expectancy * trades,
    probabilityProfit: probabilityProfitNormal(expectancy, empiricalStdev, trades),
    typicalLosingStreak: typicalLosingStreak(lossRate, trades, 0.5),
  }));
}

export function analyzeEdge(sample: readonly number[], options: AnalyzeOptions): EdgeReport {
  if (sample.length < 2) throw new Error("Need at least two trades.");
  const { horizon, paths, startingR, ruinAt, seed } = options;
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new Error("Horizon has to be a positive whole number of trades.");
  }
  if (!Number.isInteger(paths) || paths < 1) {
    throw new Error("Repetitions have to be a positive whole number.");
  }
  if (!Number.isFinite(startingR) || !Number.isFinite(ruinAt)) {
    throw new Error("Starting capital and ruin have to be finite R values.");
  }
  if (!Number.isInteger(seed)) throw new Error("Seed has to be a whole number.");

  const stats = sampleStats(sample);
  const chartPaths = Math.max(0, Math.min(paths, options.chartPaths ?? 12));
  const simulated = monteCarlo({
    sample,
    horizon,
    paths,
    startingR,
    ruinAt,
    seed,
    chartPaths,
  });

  const lossRate = stats.lossRate;
  const typicalLength = typicalLosingStreak(lossRate, horizon, 0.5);
  const uncommonLength = typicalLosingStreak(lossRate, horizon, 0.1);
  const typical =
    typicalLength === null
      ? null
      : {
          length: typicalLength,
          probability: probabilityLongestAtLeast(lossRate, horizon, typicalLength),
        };
  const uncommon =
    uncommonLength === null
      ? null
      : {
          length: uncommonLength,
          probability: probabilityLongestAtLeast(lossRate, horizon, uncommonLength),
        };

  const eventual = eventualRuinUpperBound(sample, startingR - ruinAt, stats.expectancy);
  const expectedEquity = Array.from(
    { length: horizon + 1 },
    (_, trade) => startingR + trade * stats.expectancy,
  );

  const reportBase = {
    stats,
    horizon,
    paths,
    startingR,
    ruinAt,
    seed,
    expectedR: stats.expectancy * horizon,
    stdevR: stats.empiricalStdev * Math.sqrt(horizon),
    probabilityProfitNormal: probabilityProfitNormal(stats.expectancy, stats.empiricalStdev, horizon),
    probabilityProfit: simulated.profitable / paths,
    terminalR: simulated.terminalR,
    maxDrawdownR: simulated.maxDrawdownR,
    longestLosingStreak: simulated.longestLosingStreak,
    riskOfRuin: simulated.riskOfRuin,
    medianTradesToRuin: simulated.medianTradesToRuin,
    histogram: simulated.histogram,
    chartPaths: simulated.chartPaths,
    expectedEquity,
    streaks: withTypical(
      losingStreakChances(lossRate, horizon),
      typicalLength,
      lossRate,
      horizon,
    ),
    streakExpectation: expectedLongestLosingStreak(lossRate, horizon),
    typicalStreak: typicalLength,
    uncommonStreak: uncommonLength,
    samplePath: summarizePath(sample),
    eventualRuinUpperBound: eventual,
    horizons: horizonRows(stats.expectancy, stats.empiricalStdev, lossRate, horizon, options.horizons),
  };

  const reading = buildReading({
    stats,
    horizon,
    paths,
    startingR,
    ruinAt,
    expectedR: reportBase.expectedR,
    probabilityProfit: reportBase.probabilityProfit,
    probabilityProfitNormal: reportBase.probabilityProfitNormal,
    terminalR: simulated.terminalR,
    maxDrawdownR: simulated.maxDrawdownR,
    riskOfRuin: simulated.riskOfRuin,
    medianTradesToRuin: simulated.medianTradesToRuin,
    typical,
    uncommon,
    eventualRuinUpperBound: eventual,
  });

  return { ...reportBase, reading };
}
