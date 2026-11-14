// SPDX-License-Identifier: Apache-2.0

import { mulberry32 } from "./prng.ts";

export type Preset = {
  id: string;
  label: string;
  detail: string;
  sample: readonly number[];
};

function shuffle(values: number[], seed: number): number[] {
  const rng = mulberry32(seed);
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = out[i]!;
    out[i] = out[j]!;
    out[j] = swap;
  }
  return out;
}

function mix(seed: number, parts: readonly (readonly [number, number])[]): number[] {
  const values: number[] = [];
  for (const [value, count] of parts) {
    for (let i = 0; i < count; i++) values.push(value);
  }
  return shuffle(values, seed);
}

/**
 * Synthetic R samples. They are not market data.
 * Positive and negative win at the same rate. The edge is the payoff.
 */
export const SAMPLE_POSITIVE: readonly number[] = mix(11, [
  [-1, 30],
  [1.5, 10],
  [2.5, 6],
  [4, 4],
]);

export const SAMPLE_FLAT: readonly number[] = mix(29, [
  [-1, 25],
  [1, 25],
]);

export const SAMPLE_NEGATIVE: readonly number[] = mix(47, [
  [-1, 30],
  [1, 20],
]);

export const PRESETS: readonly Preset[] = [
  {
    id: "positive",
    label: "Positive edge",
    detail:
      "Wins 40% of trades. Average win 2.30R, average loss 1.00R. Synthetic, not market data.",
    sample: SAMPLE_POSITIVE,
  },
  {
    id: "flat",
    label: "No edge",
    detail: "Wins half the trades. Wins and losses are both 1R. Synthetic, not market data.",
    sample: SAMPLE_FLAT,
  },
  {
    id: "negative",
    label: "Negative edge",
    detail:
      "Wins 40% of trades, the same rate as the positive edge, but the average win is only 1R. Synthetic, not market data.",
    sample: SAMPLE_NEGATIVE,
  },
];
