// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Anchor } from "./lines.js";

/** Price at 1 is the first anchor. Price at 0 is the second anchor. */
export const RETRACEMENT_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** The first swing, projected from the third price. */
export const EXTENSION_RATIOS = [0, 0.618, 1, 1.618, 2.618] as const;

/** Fractions of the anchor slope. */
export const FAN_RATIOS = [0.382, 0.5, 0.618] as const;

export interface RatioPrice {
  ratio: number;
  price: number;
}

export function fibonacciRetracement(
  first: Anchor,
  second: Anchor,
  ratios: readonly number[] = RETRACEMENT_RATIOS,
): RatioPrice[] {
  return ratios.map((ratio) => ({
    ratio,
    price: second.price + (first.price - second.price) * ratio,
  }));
}

export function fibonacciExtension(
  start: Anchor,
  end: Anchor,
  projectFrom: Anchor,
  ratios: readonly number[] = EXTENSION_RATIOS,
): RatioPrice[] {
  const swing = end.price - start.price;
  return ratios.map((ratio) => ({
    ratio,
    price: projectFrom.price + swing * ratio,
  }));
}

export function fibonacciFan(
  first: Anchor,
  second: Anchor,
  time: number,
  ratios: readonly number[] = FAN_RATIOS,
): RatioPrice[] {
  const span = second.time - first.time;
  if (span === 0) {
    throw new Error("fibonacci fan needs two different times");
  }
  const slope = (second.price - first.price) / span;
  return ratios.map((ratio) => ({
    ratio,
    price: first.price + slope * ratio * (time - first.time),
  }));
}

/** Bar offsets 0, 1, 2, 3, 5, 8, ... used by the time zones. */
export function fibonacciZoneOffsets(count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("zone count must be a positive integer");
  }
  const offsets = [0, 1, 2];
  while (offsets.length < count) {
    const size = offsets.length;
    offsets.push(offsets[size - 1]! + offsets[size - 2]!);
  }
  return offsets.slice(0, count);
}

/** Vertical times spaced by fibonacci bar counts, starting at 0. */
export function fibonacciTimeZones(anchorTime: number, barMillis: number, zones = 10): number[] {
  if (!Number.isFinite(anchorTime)) {
    throw new Error("anchor time must be finite");
  }
  if (!Number.isFinite(barMillis) || barMillis <= 0) {
    throw new Error("bar length must be a positive finite number");
  }
  return fibonacciZoneOffsets(zones).map((offset) => anchorTime + offset * barMillis);
}
