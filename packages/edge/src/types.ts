// SPDX-License-Identifier: Apache-2.0

export type SampleStats = {
  trades: number;
  /** Mean R per trade. */
  expectancy: number;
  /** Unbiased standard deviation of R. Divisor n − 1. */
  stdev: number;
  /** Standard deviation of the empirical distribution. Divisor n. */
  empiricalStdev: number;
  /**
   * Variance of the empirical distribution, divisor n.
   * Repetitions draw from this distribution, so projected dispersion uses it.
   */
  empiricalVariance: number;
  /** Standard error of the mean expectancy, from the unbiased standard deviation. */
  standardError: number;
  winRate: number;
  lossRate: number;
  scratchRate: number;
  /** Mean of winning trades. Null when the sample has no win. */
  avgWin: number | null;
  /** Mean of losing trades, negative. Null when the sample has no loss. */
  avgLoss: number | null;
  /** Average win divided by the absolute average loss. */
  payoffRatio: number | null;
  /** Gross profit divided by gross loss. Null when the sample has no loss. */
  profitFactor: number | null;
  /**
   * Van Tharp system quality number: expectancy / stdev × √n.
   * Null when the sample has no variance.
   */
  sqn: number | null;
};

export type Percentiles = {
  min: number;
  max: number;
  mean: number;
  p05: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
};

export type HistogramBin = {
  start: number;
  end: number;
  count: number;
  probability: number;
};

export type StreakChance = {
  length: number;
  /** P(longest losing streak ≥ length) for independent trades at the sample loss rate. */
  probability: number;
};

export type HorizonRow = {
  trades: number;
  /** Expectancy × trades. Linearity of expectation. */
  expectedR: number;
  /** Normal approximation of P(total R > 0) if trades are drawn from the sample. */
  probabilityProfit: number;
  /** Longest losing streak that still occurs in at least half of repetitions. */
  typicalLosingStreak: number | null;
};

export type ReadingRole = "result" | "caution" | "streak" | "risk" | "thesis";

export type ReadingBlock = {
  role: ReadingRole;
  text: string;
};

export type AnalyzeOptions = {
  /** How many trades each repetition runs. */
  horizon: number;
  /** How many independent repetitions to draw. */
  paths: number;
  /** Account size in R, at a constant 1R risk per trade. */
  startingR: number;
  /** Equity at or below this level counts as ruin. */
  ruinAt: number;
  /** Seed for the repetition draw. Same seed, same report. */
  seed: number;
  /** Equity curves to keep for a chart. Defaults to 12. */
  chartPaths?: number;
  /** Extra rows for the scaling table. The selected horizon is always included. */
  horizons?: readonly number[];
};

export type EdgeReport = {
  stats: SampleStats;
  horizon: number;
  paths: number;
  startingR: number;
  ruinAt: number;
  seed: number;
  /** Sample expectancy × horizon. */
  expectedR: number;
  /** Empirical σ × √horizon. Dispersion of the total if each trade is an independent draw. */
  stdevR: number;
  /** Normal approximation of the share of repetitions that finish with total R > 0. */
  probabilityProfitNormal: number;
  /** Share of repetitions whose total R is above 0. */
  probabilityProfit: number;
  /** Total R of each repetition. */
  terminalR: Percentiles;
  /** Worst peak-to-trough giveback of each repetition, in R. */
  maxDrawdownR: Percentiles;
  /** Longest run of losing trades in each repetition. */
  longestLosingStreak: Percentiles;
  /** Share of repetitions that touched the ruin level inside the horizon. */
  riskOfRuin: number;
  /** Median trade index of first ruin, among ruined repetitions. Null if none ruined. */
  medianTradesToRuin: number | null;
  histogram: HistogramBin[];
  /** Equity after each trade, including the starting point. */
  chartPaths: number[][];
  /** startingR + t × expectancy, one point per trade including the start. */
  expectedEquity: number[];
  streaks: StreakChance[];
  streakExpectation: {
    value: number;
    /** False when `value` is an approximation rather than the summed distribution. */
    exact: boolean;
  };
  /** Largest k with P(longest losing streak ≥ k) ≥ 0.5. Null if a single loss is already unlikely. */
  typicalStreak: number | null;
  /** Largest k with P(longest losing streak ≥ k) ≥ 0.1. */
  uncommonStreak: number | null;
  /** The sample in the order it was recorded, walked as one account from 0R. */
  samplePath: {
    totalR: number;
    maxDrawdownR: number;
    longestLosingStreak: number;
  };
  /**
   * Upper bound on ever hitting ruin if the edge is repeated without a stopping
   * point. Null when it cannot be computed. 1 when a non-positive edge makes
   * a lower barrier certain. 0 when the sample cannot fall.
   */
  eventualRuinUpperBound: number | null;
  horizons: HorizonRow[];
  reading: ReadingBlock[];
};
