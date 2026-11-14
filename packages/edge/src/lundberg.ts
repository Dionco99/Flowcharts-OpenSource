// SPDX-License-Identifier: Apache-2.0

/**
 * Positive Lundberg coefficient θ of the empirical R distribution:
 * the θ > 0 that solves the mean of exp(−θ R) = 1.
 * The root at 0 is the other solution and is ignored.
 * Exists when the mean is positive and some trades lose.
 */
export function adjustmentCoefficient(sample: readonly number[]): number | null {
  if (sample.length === 0) return null;

  const moment = (theta: number): { mean: number; slope: number } | null => {
    let mean = 0;
    let slope = 0;
    for (const r of sample) {
      const weight = Math.exp(-theta * r);
      if (!Number.isFinite(weight)) return null;
      mean += weight;
      slope += -r * weight;
    }
    return { mean: mean / sample.length, slope: slope / sample.length };
  };

  // M(0) = 1 and the mean is positive, so M dips below 1 and, when a loss
  // exists, climbs back through 1. Find that second crossing.
  let hi = 1e-4;
  let risingAbove: number | null = null;
  for (let step = 0; step < 100; step++) {
    const value = moment(hi);
    if (value === null) return null;
    if (value.slope > 0 && value.mean > 1) {
      risingAbove = hi;
      break;
    }
    hi *= 1.4;
    if (hi > 1e6) return null;
  }
  if (risingAbove === null) return null;

  let lo = risingAbove;
  let foundBelow = false;
  for (let step = 0; step < 100; step++) {
    const next = lo / 1.4;
    if (!(next > 0)) return null;
    const value = moment(next);
    if (value === null) return null;
    if (value.slope <= 0) break;
    lo = next;
    if (value.mean < 1) {
      foundBelow = true;
      break;
    }
  }
  if (!foundBelow) return null;

  let left = lo;
  let right = risingAbove;
  for (let i = 0; i < 80; i++) {
    const mid = (left + right) / 2;
    const value = moment(mid);
    if (value === null) return null;
    if (value.mean < 1) left = mid;
    else right = mid;
  }
  return (left + right) / 2;
}

/**
 * Upper bound on the probability of ever reaching `distance` R below the
 * start, if trading never stops.
 *
 * Returns 1 when the edge is not positive and the account can fall, 0 when
 * it cannot fall, and exp(−θ × distance) when θ is the Lundberg coefficient.
 * For a ±1 walk that bound is exact. With unequal steps it is an upper bound,
 * because a trade can jump past the barrier.
 */
export function eventualRuinUpperBound(
  sample: readonly number[],
  distance: number,
  expectancy: number,
): number | null {
  if (distance <= 0) return 1;
  const hasLoss = sample.some((r) => r < 0);
  const flat = sample.every((r) => r === sample[0]);
  if (expectancy < -1e-12) return 1;
  if (Math.abs(expectancy) <= 1e-12) return flat ? 0 : 1;
  if (!hasLoss) return 0;
  const theta = adjustmentCoefficient(sample);
  if (theta === null || !(theta > 0)) return null;
  const bound = Math.exp(-theta * distance);
  if (!Number.isFinite(bound)) return null;
  return Math.min(1, Math.max(0, bound));
}
