// SPDX-License-Identifier: Apache-2.0

import type { StreakChance } from "./types.ts";

const EULER = 0.5772156649015329;

/**
 * P(the longest losing streak in `trades` independent trades is at least `length`).
 * A loss has probability `lossProbability`. Anything else breaks the streak.
 * Exact, via the current-streak Markov chain.
 */
export function probabilityLongestAtLeast(
  lossProbability: number,
  trades: number,
  length: number,
): number {
  const q = lossProbability;
  const n = trades;
  const k = length;
  if (k <= 0) return 1;
  if (n <= 0) return 0;
  if (q <= 0) return 0;
  if (q >= 1) return k <= n ? 1 : 0;
  if (k > n) return 0;

  const win = 1 - q;
  let current = new Float64Array(k);
  let next = new Float64Array(k);
  current[0] = 1;

  for (let t = 0; t < n; t++) {
    let mass = 0;
    for (let s = 0; s < k; s++) mass += current[s]!;
    next[0] = mass * win;
    for (let s = 0; s < k - 1; s++) next[s + 1] = current[s]! * q;
    const swap = current;
    current = next;
    next = swap;
  }

  let safe = 0;
  for (let s = 0; s < k; s++) safe += current[s]!;
  const probability = 1 - safe;
  if (probability <= 0) return 0;
  if (probability >= 1) return 1;
  return probability;
}

/**
 * Window center for the streak chart. Schilling's approximation,
 * used only to decide which lengths to compute exactly.
 */
export function approximateExpectedLongestStreak(lossProbability: number, trades: number): number {
  if (trades <= 0 || lossProbability <= 0) return 0;
  if (lossProbability >= 1) return trades;
  const ln = Math.log(1 / lossProbability);
  const estimate = Math.log(trades) / ln + EULER / ln - 0.5;
  if (!Number.isFinite(estimate)) return 0;
  return Math.min(trades, Math.max(0, estimate));
}

/**
 * Expected longest losing streak. Exact sum of the survival function
 * until the tail is negligible. Falls back to the approximation only
 * when that sum would run past 160 lengths and still have mass.
 */
export function expectedLongestLosingStreak(
  lossProbability: number,
  trades: number,
): { value: number; exact: boolean } {
  if (trades <= 0 || lossProbability <= 0) return { value: 0, exact: true };
  if (lossProbability >= 1) return { value: trades, exact: true };
  let sum = 0;
  for (let length = 1; length <= trades; length++) {
    const probability = probabilityLongestAtLeast(lossProbability, trades, length);
    sum += probability;
    if (probability < 1e-12) return { value: sum, exact: true };
    if (length >= 160 && probability > 1e-4) {
      return {
        value: approximateExpectedLongestStreak(lossProbability, trades),
        exact: false,
      };
    }
  }
  return { value: sum, exact: true };
}

/** Largest streak length whose probability is still at least `threshold`. */
export function typicalLosingStreak(
  lossProbability: number,
  trades: number,
  threshold = 0.5,
): number | null {
  if (trades <= 0 || lossProbability <= 0) return null;
  if (probabilityLongestAtLeast(lossProbability, trades, 1) < threshold) return null;
  let lo = 1;
  let hi = trades;
  let answer = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (probabilityLongestAtLeast(lossProbability, trades, mid) >= threshold) {
      answer = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
}

/** Exact streak probabilities around the lengths a chart can actually show. */
export function losingStreakChances(lossProbability: number, trades: number): StreakChance[] {
  if (trades <= 0 || lossProbability <= 0) return [];
  if (lossProbability >= 1) {
    const start = Math.max(1, trades - 15);
    const rows: StreakChance[] = [];
    for (let length = start; length <= trades; length++) {
      rows.push({ length, probability: 1 });
    }
    return rows;
  }

  const center = approximateExpectedLongestStreak(lossProbability, trades);
  const ln = Math.log(1 / lossProbability);
  const sd = Math.PI / (Math.sqrt(6) * ln);
  const radius = Math.max(8, Math.ceil((Number.isFinite(sd) ? sd : 4) * 3));
  let start = Math.max(1, Math.floor(center - radius));
  const end = Math.min(trades, Math.ceil(center + radius));
  if (center <= 20) start = 1;
  if (end < start) return [];

  const span = end - start + 1;
  const step = span > 40 ? Math.ceil(span / 40) : 1;
  const rows: StreakChance[] = [];
  for (let length = start; length <= end; length += step) {
    rows.push({
      length,
      probability: probabilityLongestAtLeast(lossProbability, trades, length),
    });
  }
  const last = rows[rows.length - 1];
  if (last && last.length !== end) {
    rows.push({
      length: end,
      probability: probabilityLongestAtLeast(lossProbability, trades, end),
    });
  }
  return rows;
}
