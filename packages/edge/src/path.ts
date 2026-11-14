// SPDX-License-Identifier: Apache-2.0

export type PathSummary = {
  totalR: number;
  maxDrawdownR: number;
  longestLosingStreak: number;
};

/**
 * Walk a recorded sequence from a flat start.
 * Drawdown is the worst peak-to-trough giveback, in R.
 * A losing trade is R < 0. A win or a scratch breaks the streak.
 */
export function summarizePath(trades: readonly number[]): PathSummary {
  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  let streak = 0;
  let longestLosingStreak = 0;
  for (const r of trades) {
    equity += r;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdownR) maxDrawdownR = drawdown;
    if (r < 0) {
      streak += 1;
      if (streak > longestLosingStreak) longestLosingStreak = streak;
    } else {
      streak = 0;
    }
  }
  return { totalR: equity, maxDrawdownR, longestLosingStreak };
}
