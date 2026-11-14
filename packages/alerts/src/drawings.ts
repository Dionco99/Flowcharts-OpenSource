// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "./bars.ts";
import { cmpDecimal, decimalToNumber } from "./decimal.ts";
import { AlertsError } from "./errors.ts";
import { epochMs } from "./time.ts";

export interface Anchor {
  time: string;
  price: string;
}

export type Drawing =
  | { kind: "horizontal"; price: string }
  | { kind: "segment"; from: Anchor; to: Anchor }
  | { kind: "ray"; from: Anchor; to: Anchor }
  | { kind: "line"; from: Anchor; to: Anchor }
  | { kind: "rectangle"; from: Anchor; to: Anchor };

const KINDS = new Set(["horizontal", "segment", "ray", "line", "rectangle"]);

export function assertDrawing(value: Drawing): Drawing {
  if (!KINDS.has(value.kind)) {
    throw new AlertsError("invalid_drawing", "unknown drawing");
  }
  if (value.kind === "horizontal") {
    cmpDecimal(value.price, value.price);
    return value;
  }
  checkAnchor(value.from);
  checkAnchor(value.to);
  return value;
}

function checkAnchor(anchor: Anchor): void {
  epochMs(anchor.time);
  cmpDecimal(anchor.price, anchor.price);
}

/** The bar's high-low range meets the drawing while the bar is open. */
export function barTouches(bar: Bar, drawing: Drawing): boolean {
  assertDrawing(drawing);
  if (drawing.kind === "horizontal") {
    return cmpDecimal(bar.low, drawing.price) <= 0 && cmpDecimal(bar.high, drawing.price) >= 0;
  }
  if (drawing.kind === "rectangle") {
    const open = epochMs(bar.openTime);
    const close = epochMs(bar.closeTime);
    return clip(open, close, anchorTime(drawing.from), anchorTime(drawing.to)) !== null
      && intervalsOverlap(
        decimalToNumber(bar.low),
        decimalToNumber(bar.high),
        decimalToNumber(drawing.from.price),
        decimalToNumber(drawing.to.price),
      );
  }
  return lineTouches(bar, drawing);
}

function lineTouches(bar: Bar, drawing: Exclude<Drawing, { kind: "horizontal" | "rectangle" }>): boolean {
  const t0 = anchorTime(drawing.from);
  const t1 = anchorTime(drawing.to);
  const open = epochMs(bar.openTime);
  const close = epochMs(bar.closeTime);
  if (t0 === t1) return verticalTouches(bar, drawing, t0);
  const domain = timeDomain(drawing.kind, t0, t1);
  const overlap = clip(open, close, domain[0], domain[1]);
  if (!overlap) return false;
  const [start, end] = overlap;
  const p0 = priceAt(drawing.from, drawing.to, start);
  const p1 = priceAt(drawing.from, drawing.to, end);
  const low = decimalToNumber(bar.low);
  const high = decimalToNumber(bar.high);
  return Math.min(p0, p1) <= high + 1e-9 && Math.max(p0, p1) >= low - 1e-9;
}

function verticalTouches(
  bar: Bar,
  drawing: Exclude<Drawing, { kind: "horizontal" | "rectangle" }>,
  time: number,
): boolean {
  if (time < epochMs(bar.openTime) || time >= epochMs(bar.closeTime)) return false;
  const low = decimalToNumber(bar.low);
  const high = decimalToNumber(bar.high);
  const p0 = decimalToNumber(drawing.from.price);
  const p1 = decimalToNumber(drawing.to.price);
  if (drawing.kind === "line") return true;
  if (drawing.kind === "segment") return intervalsOverlap(low, high, p0, p1);
  const above = p1 >= p0 ? [p0, Number.POSITIVE_INFINITY] : [Number.NEGATIVE_INFINITY, p0];
  return intervalsOverlap(low, high, above[0], above[1]);
}

function timeDomain(kind: "segment" | "ray" | "line", t0: number, t1: number): [number, number] {
  if (kind === "line") return [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  if (kind === "segment") return [Math.min(t0, t1), Math.max(t0, t1)];
  return t1 >= t0 ? [t0, Number.POSITIVE_INFINITY] : [Number.NEGATIVE_INFINITY, t0];
}

function priceAt(from: Anchor, to: Anchor, time: number): number {
  const t0 = anchorTime(from);
  const t1 = anchorTime(to);
  const p0 = decimalToNumber(from.price);
  const p1 = decimalToNumber(to.price);
  const u = (time - t0) / (t1 - t0);
  return p0 + (p1 - p0) * u;
}

function anchorTime(anchor: Anchor): number {
  return epochMs(anchor.time);
}

/** Overlap of the bar interval [open, close) with a closed drawing interval. */
function clip(open: number, close: number, domain0: number, domain1: number): [number, number] | null {
  const start = Math.max(open, Math.min(domain0, domain1));
  const end = Math.min(close - 1, Math.max(domain0, domain1));
  if (start > end) return null;
  return [start, end];
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.min(a0, a1) <= Math.max(b0, b1) && Math.max(a0, a1) >= Math.min(b0, b1);
}
