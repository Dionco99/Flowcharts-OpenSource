// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import { utils } from "klinecharts";
import type { Anchor } from "./drawings.ts";

/** Price on the infinite line through two anchors, using KLineChart's line helper. */
export function priceOnLine(start: Anchor, end: Anchor, time: number): number | null {
  if (start.time === end.time) {
    return null;
  }
  const price = utils.getLinearYFromCoordinates(
    { x: start.time, y: start.price },
    { x: end.time, y: end.price },
    { x: time, y: 0 },
  );
  return Number.isFinite(price) ? price : null;
}

export function priceOnSegment(start: Anchor, end: Anchor, time: number): number | null {
  const low = Math.min(start.time, end.time);
  const high = Math.max(start.time, end.time);
  if (time < low || time > high) {
    return null;
  }
  return priceOnLine(start, end, time);
}

/** Ray starts at `start` and passes through `end`. It does not extend behind `start`. */
export function priceOnRay(start: Anchor, end: Anchor, time: number): number | null {
  const forward = end.time >= start.time ? time >= start.time : time <= start.time;
  if (!forward) {
    return null;
  }
  return priceOnLine(start, end, time);
}
