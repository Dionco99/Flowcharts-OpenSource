// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Anchor } from "./lines.js";

export type PriceAt = (time: number) => number;

export interface ParallelChannel {
  base: PriceAt;
  parallel: PriceAt;
  midline: PriceAt;
  offset: number;
}

export type PitchforkKind = "andrews" | "schiff" | "modifiedSchiff";

export interface Pitchfork {
  kind: PitchforkKind;
  origin: Anchor;
  median: PriceAt;
  upper: PriceAt;
  lower: PriceAt;
  upperMid: PriceAt;
  lowerMid: PriceAt;
}

function lineThrough(a: Anchor, b: Anchor): PriceAt {
  const span = b.time - a.time;
  if (span === 0) {
    throw new Error("a channel line needs two different times");
  }
  const slope = (b.price - a.price) / span;
  return (time: number) => a.price + slope * (time - a.time);
}

function midpoint(a: Anchor, b: Anchor): Anchor {
  return { time: (a.time + b.time) / 2, price: (a.price + b.price) / 2 };
}

/** Three anchors. The base joins the first two. The third sets the price offset. */
export function parallelChannel(start: Anchor, end: Anchor, width: Anchor): ParallelChannel {
  const base = lineThrough(start, end);
  const offset = width.price - base(width.time);
  return {
    base,
    parallel: (time) => base(time) + offset,
    midline: (time) => base(time) + offset / 2,
    offset,
  };
}

/**
 * Median line and the two outer parallels.
 * Andrews starts at the first anchor. Schiff starts at the midpoint of the
 * first and second. Modified Schiff keeps the first anchor's time and the
 * midpoint price of the first and second.
 */
export function pitchfork(first: Anchor, second: Anchor, third: Anchor, kind: PitchforkKind): Pitchfork {
  const far = midpoint(second, third);
  let origin: Anchor;
  if (kind === "andrews") {
    origin = { ...first };
  } else if (kind === "schiff") {
    origin = midpoint(first, second);
  } else if (kind === "modifiedSchiff") {
    origin = { time: first.time, price: (first.price + second.price) / 2 };
  } else {
    throw new Error(`unknown pitchfork: ${String(kind)}`);
  }
  const median = lineThrough(origin, far);
  const span = far.time - origin.time;
  const slope = (far.price - origin.price) / span;
  const upper = (time: number) => second.price + slope * (time - second.time);
  const lower = (time: number) => third.price + slope * (time - third.time);
  return {
    kind,
    origin,
    median,
    upper,
    lower,
    upperMid: (time) => (median(time) + upper(time)) / 2,
    lowerMid: (time) => (median(time) + lower(time)) / 2,
  };
}
