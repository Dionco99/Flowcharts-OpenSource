// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export interface Anchor {
  time: number;
  price: number;
}

export type LineKind = "segment" | "ray" | "extended";
export type HorizontalKind = "horizontal" | "horizontalRay" | "horizontalSegment";
export type VerticalKind = "vertical" | "verticalRay" | "verticalSegment";

function finiteAnchor(anchor: Anchor, label: string): void {
  if (!Number.isFinite(anchor.time) || !Number.isFinite(anchor.price)) {
    throw new Error(`${label} needs a finite time and price`);
  }
}

/** Price of a segment, ray, or extended line at `time`. Vertical lines have no price. */
export function linePrice(from: Anchor, to: Anchor, time: number, kind: LineKind): number | null {
  finiteAnchor(from, "line start");
  finiteAnchor(to, "line end");
  if (!Number.isFinite(time)) {
    throw new Error("time must be finite");
  }
  if (from.time === to.time) {
    return null;
  }
  if (!lineCoversTime(from, to, time, kind)) {
    return null;
  }
  const slope = (to.price - from.price) / (to.time - from.time);
  return from.price + slope * (time - from.time);
}

export function lineCoversTime(from: Anchor, to: Anchor, time: number, kind: LineKind): boolean {
  if (kind === "extended") {
    return true;
  }
  const direction = Math.sign(to.time - from.time);
  if (direction === 0) {
    return time === from.time;
  }
  if (kind === "ray") {
    return direction > 0 ? time >= from.time : time <= from.time;
  }
  const start = Math.min(from.time, to.time);
  const end = Math.max(from.time, to.time);
  return time >= start && time <= end;
}

/**
 * Horizontal price line, ray, or segment.
 * The price is the first anchor. A ray extends toward the second anchor's time.
 */
export function horizontalPrice(
  from: Anchor,
  to: Anchor | null,
  time: number,
  kind: HorizontalKind,
): number | null {
  finiteAnchor(from, "horizontal start");
  if (to !== null) {
    finiteAnchor(to, "horizontal end");
  }
  if (kind === "horizontal") {
    return from.price;
  }
  if (to === null) {
    throw new Error(`${kind} needs two anchors`);
  }
  if (kind === "horizontalSegment") {
    const start = Math.min(from.time, to.time);
    const end = Math.max(from.time, to.time);
    return time >= start && time <= end ? from.price : null;
  }
  const right = to.time >= from.time;
  const covers = right ? time >= from.time : time <= from.time;
  return covers ? from.price : null;
}

export interface VerticalCoverage {
  time: number;
  /** Inclusive price span. Null ends mean the line is unbounded on that side. */
  priceLow: number | null;
  priceHigh: number | null;
}

/** Time line, ray, or segment. A ray extends from the first price toward the second. */
export function verticalCoverage(from: Anchor, to: Anchor | null, kind: VerticalKind): VerticalCoverage {
  finiteAnchor(from, "vertical start");
  if (kind === "vertical") {
    return { time: from.time, priceLow: null, priceHigh: null };
  }
  if (to === null) {
    throw new Error(`${kind} needs two anchors`);
  }
  finiteAnchor(to, "vertical end");
  if (kind === "verticalSegment") {
    return {
      time: from.time,
      priceLow: Math.min(from.price, to.price),
      priceHigh: Math.max(from.price, to.price),
    };
  }
  if (to.price >= from.price) {
    return { time: from.time, priceLow: from.price, priceHigh: null };
  }
  return { time: from.time, priceLow: null, priceHigh: from.price };
}

export function verticalCoversPrice(coverage: VerticalCoverage, price: number): boolean {
  const aboveLow = coverage.priceLow === null || price >= coverage.priceLow;
  const belowHigh = coverage.priceHigh === null || price <= coverage.priceHigh;
  return aboveLow && belowHigh;
}
