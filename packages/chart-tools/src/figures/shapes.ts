// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Anchor } from "./lines.js";

function between(value: number, a: number, b: number): boolean {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return value >= low && value <= high;
}

/** Inclusive rectangle bounded by two corners. */
export function inRectangle(point: Anchor, a: Anchor, b: Anchor): boolean {
  return between(point.time, a.time, b.time) && between(point.price, a.price, b.price);
}

/** Inclusive ellipse bounded by two corners. */
export function inEllipse(point: Anchor, a: Anchor, b: Anchor): boolean {
  const centerTime = (a.time + b.time) / 2;
  const centerPrice = (a.price + b.price) / 2;
  const radiusTime = Math.abs(a.time - b.time) / 2;
  const radiusPrice = Math.abs(a.price - b.price) / 2;
  if (radiusTime === 0 && radiusPrice === 0) {
    return point.time === centerTime && point.price === centerPrice;
  }
  if (radiusTime === 0) {
    return point.time === centerTime && Math.abs(point.price - centerPrice) <= radiusPrice;
  }
  if (radiusPrice === 0) {
    return point.price === centerPrice && Math.abs(point.time - centerTime) <= radiusTime;
  }
  const x = (point.time - centerTime) / radiusTime;
  const y = (point.price - centerPrice) / radiusPrice;
  return x * x + y * y <= 1 + 1e-9;
}

/** Inclusive triangle of three anchors. A flat triangle contains nothing. */
export function inTriangle(point: Anchor, a: Anchor, b: Anchor, c: Anchor): boolean {
  const area =
    (b.price - c.price) * (a.time - c.time) + (c.time - b.time) * (a.price - c.price);
  if (area === 0) {
    return false;
  }
  const weightA =
    ((b.price - c.price) * (point.time - c.time) + (c.time - b.time) * (point.price - c.price)) / area;
  const weightB =
    ((c.price - a.price) * (point.time - c.time) + (a.time - c.time) * (point.price - c.price)) / area;
  const weightC = 1 - weightA - weightB;
  const epsilon = 1e-9;
  return weightA >= -epsilon && weightB >= -epsilon && weightC >= -epsilon;
}

function distanceToSegment(point: Anchor, start: Anchor, end: Anchor): number {
  const spanTime = end.time - start.time;
  const spanPrice = end.price - start.price;
  const lengthSquared = spanTime * spanTime + spanPrice * spanPrice;
  if (lengthSquared === 0) {
    const dt = point.time - start.time;
    const dp = point.price - start.price;
    return Math.hypot(dt, dp);
  }
  const raw =
    ((point.time - start.time) * spanTime + (point.price - start.price) * spanPrice) / lengthSquared;
  const t = Math.min(1, Math.max(0, raw));
  const nearTime = start.time + t * spanTime;
  const nearPrice = start.price + t * spanPrice;
  return Math.hypot(point.time - nearTime, point.price - nearPrice);
}

/**
 * Freehand path. Distance is Euclidean in the caller's time and price units.
 * A path of one anchor matches that point. An empty path matches nothing.
 */
export function brushHits(anchors: readonly Anchor[], point: Anchor, tolerance: number): boolean {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error("tolerance must be a non-negative finite number");
  }
  if (anchors.length === 0) {
    return false;
  }
  if (anchors.length === 1) {
    return Math.hypot(point.time - anchors[0]!.time, point.price - anchors[0]!.price) <= tolerance;
  }
  for (let i = 0; i < anchors.length - 1; i += 1) {
    if (distanceToSegment(point, anchors[i]!, anchors[i + 1]!) <= tolerance) {
      return true;
    }
  }
  return false;
}
