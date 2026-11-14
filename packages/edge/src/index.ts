// SPDX-License-Identifier: Apache-2.0

export { analyzeEdge } from "./report.ts";
export { adjustmentCoefficient, eventualRuinUpperBound } from "./lundberg.ts";
export { monteCarlo } from "./montecarlo.ts";
export { parseRSample } from "./parse.ts";
export { summarizePath } from "./path.ts";
export { PRESETS, SAMPLE_FLAT, SAMPLE_NEGATIVE, SAMPLE_POSITIVE } from "./samples.ts";
export type { Preset } from "./samples.ts";
export {
  histogram,
  normalCdf,
  percentile,
  probabilityProfitNormal,
  sampleStats,
  summarize,
} from "./stats.ts";
export {
  approximateExpectedLongestStreak,
  expectedLongestLosingStreak,
  losingStreakChances,
  probabilityLongestAtLeast,
  typicalLosingStreak,
} from "./streaks.ts";
export { formatCount, formatMagnitude, formatPercent, formatPlain, formatR } from "./format.ts";
export type {
  AnalyzeOptions,
  EdgeReport,
  HistogramBin,
  HorizonRow,
  Percentiles,
  ReadingBlock,
  ReadingRole,
  SampleStats,
  StreakChance,
} from "./types.ts";
