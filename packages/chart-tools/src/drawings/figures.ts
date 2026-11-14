// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import { leastSquare } from "indicatorts";
import type { Bar } from "../bar.ts";
import type { Anchor, DeskDrawing } from "../chart/drawings.ts";

export interface Point {
  time: number;
  price: number;
}

export function trendAngle(start: Point, end: Point): { slopePerMs: number; degrees: number } {
  const dt = end.time - start.time;
  if (dt === 0) throw new Error("anchors need different times");
  const slopePerMs = (end.price - start.price) / dt;
  return { slopePerMs, degrees: (Math.atan2(end.price - start.price, dt) * 180) / Math.PI };
}

export function infoLine(bars: readonly Bar[], start: Point, end: Point): { change: number; percent: number | null; bars: number } {
  const from = Math.min(start.time, end.time);
  const to = Math.max(start.time, end.time);
  const inside = bars.filter((bar) => bar.time >= from && bar.time <= to);
  const change = end.price - start.price;
  return {
    change,
    percent: start.price === 0 ? null : (change / start.price) * 100,
    bars: inside.length,
  };
}

export function crossLines(point: Point): { horizontal: DeskDrawing; vertical: DeskDrawing } {
  return {
    horizontal: { id: "cross-h", name: "horizontalStraightLine", points: [{ time: point.time, price: point.price }] },
    vertical: { id: "cross-v", name: "verticalStraightLine", points: [{ time: point.time, price: point.price }] },
  };
}

export function regressionTrend(bars: readonly Bar[], from: number, to: number, multiplier = 2): { slope: number; intercept: number; deviation: number; priceAt: (time: number) => number; upperAt: (time: number) => number; lowerAt: (time: number) => number } {
  const selected = bars.filter((bar) => bar.time >= from && bar.time <= to);
  if (selected.length < 2) throw new Error("regression needs two bars");
  const fit = leastSquare(selected.map((_, index) => index), selected.map((bar) => bar.close));
  const residuals = selected.map((bar, index) => bar.close - (fit.m * index + fit.b));
  const mean = residuals.reduce((sum, value) => sum + value, 0) / residuals.length;
  const deviation = Math.sqrt(residuals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / residuals.length);
  const span = selected[selected.length - 1].time - selected[0].time;
  const indexAt = (time: number) => (span === 0 ? 0 : ((time - selected[0].time) / span) * (selected.length - 1));
  const priceAt = (time: number) => fit.m * indexAt(time) + fit.b;
  return {
    slope: fit.m,
    intercept: fit.b,
    deviation,
    priceAt,
    upperAt: (time) => priceAt(time) + multiplier * deviation,
    lowerAt: (time) => priceAt(time) - multiplier * deviation,
  };
}

export function linePrice(start: Point, end: Point, time: number): number {
  const dt = end.time - start.time;
  if (dt === 0) return start.price;
  return start.price + ((end.price - start.price) * (time - start.time)) / dt;
}

export function disjointChannel(baseStart: Point, baseEnd: Point, sideStart: Point, sideEnd: Point, time: number): { base: number; side: number } {
  return { base: linePrice(baseStart, baseEnd, time), side: linePrice(sideStart, sideEnd, time) };
}

export function flatChannel(start: Point, end: Point, flatPrice: number, time: number): { trend: number; flat: number } {
  return { trend: linePrice(start, end, time), flat: flatPrice };
}

export type PitchforkKind = "andrews" | "schiff" | "modifiedSchiff";

export function pitchfork(kind: PitchforkKind, handle: Point, left: Point, right: Point, time: number): { median: number; upper: number; lower: number; insideUpper: number; insideLower: number } {
  const mid = { time: (left.time + right.time) / 2, price: (left.price + right.price) / 2 };
  const origin = kind === "andrews"
    ? handle
    : kind === "schiff"
      ? { time: (handle.time + left.time) / 2, price: (handle.price + left.price) / 2 }
      : { time: handle.time, price: (handle.price + left.price) / 2 };
  const dt = mid.time - origin.time;
  if (dt === 0) throw new Error("pitchfork median needs time between the origin and the midpoint");
  const slope = (mid.price - origin.price) / dt;
  const at = (point: Point) => point.price + slope * (time - point.time);
  const median = at(origin);
  const upper = at(left);
  const lower = at(right);
  return { median, upper, lower, insideUpper: (median + upper) / 2, insideLower: (median + lower) / 2 };
}

export function fibonacciExtension(start: Point, end: Point, from: Point, ratios: readonly number[]): { ratio: number; price: number }[] {
  const swing = end.price - start.price;
  return ratios.map((ratio) => ({ ratio, price: from.price + swing * ratio }));
}

export function fibonacciChannel(start: Point, end: Point, widthPoint: Point, ratios: readonly number[], time: number): { ratio: number; price: number }[] {
  const base = linePrice(start, end, widthPoint.time);
  const offset = widthPoint.price - base;
  const level = linePrice(start, end, time);
  return ratios.map((ratio) => ({ ratio, price: level + offset * ratio }));
}

export function fibonacciTimezone(startTime: number, barMs: number, count: number): number[] {
  const widths = fibonacciNumbers(count);
  return widths.map((width) => startTime + width * barMs);
}

export function fibonacciNumbers(count: number): number[] {
  if (count < 1) return [];
  const out = [0, 1];
  while (out.length < count) out.push(out[out.length - 1] + out[out.length - 2]);
  return out.slice(0, count);
}

export function fibonacciFan(start: Point, end: Point, ratios: readonly number[], time: number): { ratio: number; price: number }[] {
  const dt = end.time - start.time;
  if (dt === 0) throw new Error("fan anchors need different times");
  const slope = (end.price - start.price) / dt;
  return ratios.map((ratio) => ({ ratio, price: start.price + slope * ratio * (time - start.time) }));
}

export function fibonacciRadii(start: Point, end: Point, ratios: readonly number[], timeUnit: number, priceUnit: number): { ratio: number; radius: number }[] {
  if (!(timeUnit > 0) || !(priceUnit > 0)) throw new Error("scale units must be positive");
  const distance = Math.hypot((end.time - start.time) / timeUnit, (end.price - start.price) / priceUnit);
  return ratios.map((ratio) => ({ ratio, radius: distance * ratio }));
}

export function gannFan(origin: Point, barMs: number, pricePerBar: number, time: number): { ratio: string; price: number }[] {
  const ratios = ["1/8", "1/4", "1/3", "1/2", "1/1", "2/1", "3/1", "4/1", "8/1"];
  const bars = (time - origin.time) / barMs;
  return ratios.map((ratio) => {
    const [rise, run] = ratio.split("/").map(Number);
    return { ratio, price: origin.price + (rise / run) * pricePerBar * bars };
  });
}

export function gannBox(corner: Point, opposite: Point, steps = 8): { times: number[]; prices: number[] } {
  const times = Array.from({ length: steps + 1 }, (_, index) => corner.time + ((opposite.time - corner.time) * index) / steps);
  const prices = Array.from({ length: steps + 1 }, (_, index) => corner.price + ((opposite.price - corner.price) * index) / steps);
  return { times, prices };
}

export function rectangleContains(corner: Point, opposite: Point, time: number, price: number): boolean {
  const timeOk = time >= Math.min(corner.time, opposite.time) && time <= Math.max(corner.time, opposite.time);
  const priceOk = price >= Math.min(corner.price, opposite.price) && price <= Math.max(corner.price, opposite.price);
  return timeOk && priceOk;
}

export function rotatedRectangleContains(start: Point, end: Point, halfWidth: number, time: number, price: number): boolean {
  const dt = end.time - start.time;
  const dp = end.price - start.price;
  const length = Math.hypot(dt, dp);
  if (length === 0) return false;
  const along = ((time - start.time) * dt + (price - start.price) * dp) / length;
  const across = ((time - start.time) * dp - (price - start.price) * dt) / length;
  return along >= 0 && along <= length && Math.abs(across) <= halfWidth;
}

export function ellipseContains(corner: Point, opposite: Point, time: number, price: number): boolean {
  const rx = Math.abs(opposite.time - corner.time) / 2;
  const ry = Math.abs(opposite.price - corner.price) / 2;
  if (rx === 0 || ry === 0) return false;
  const cx = (corner.time + opposite.time) / 2;
  const cy = (corner.price + opposite.price) / 2;
  return ((time - cx) / rx) ** 2 + ((price - cy) / ry) ** 2 <= 1;
}

export function triangleContains(a: Point, b: Point, c: Point, time: number, price: number): boolean {
  const area = signedArea(a, b, c);
  if (area === 0) return false;
  const ab = signedArea({ time, price }, a, b) / area;
  const bc = signedArea({ time, price }, b, c) / area;
  const ca = signedArea({ time, price }, c, a) / area;
  const epsilon = 1e-9;
  return ab >= -epsilon && bc >= -epsilon && ca >= -epsilon;
}

function signedArea(a: Point, b: Point, c: Point): number {
  return (a.time * (b.price - c.price) + b.time * (c.price - a.price) + c.time * (a.price - b.price)) / 2;
}

export function polylinePrice(points: readonly Point[], time: number): number | null {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const low = Math.min(start.time, end.time);
    const high = Math.max(start.time, end.time);
    if (time >= low && time <= high && start.time !== end.time) return linePrice(start, end, time);
  }
  return null;
}

/** Quadratic Bezier through three anchors. `t` is 0 at the first and 1 at the third. */
export function curvePoint(a: Point, b: Point, c: Point, t: number): Point {
  const weight = (1 - t) ** 2;
  const mix = 2 * (1 - t) * t;
  const end = t ** 2;
  return { time: weight * a.time + mix * b.time + end * c.time, price: weight * a.price + mix * b.price + end * c.price };
}

export function circumcircle(a: Point, b: Point, c: Point): { center: Point; radius: number } | null {
  const d = 2 * (a.time * (b.price - c.price) + b.time * (c.price - a.price) + c.time * (a.price - b.price));
  if (d === 0) return null;
  const a2 = a.time ** 2 + a.price ** 2;
  const b2 = b.time ** 2 + b.price ** 2;
  const c2 = c.time ** 2 + c.price ** 2;
  const time = (a2 * (b.price - c.price) + b2 * (c.price - a.price) + c2 * (a.price - b.price)) / d;
  const price = (a2 * (c.time - b.time) + b2 * (a.time - c.time) + c2 * (b.time - a.time)) / d;
  return { center: { time, price }, radius: Math.hypot(time - a.time, price - a.price) };
}

export function positionLevels(side: "buy" | "sell", entry: number, stop: number, target: number): { risk: number; reward: number; r: number | null } {
  const risk = side === "buy" ? entry - stop : stop - entry;
  const reward = side === "buy" ? target - entry : entry - target;
  return { risk: Math.abs(entry - stop), reward: Math.abs(target - entry), r: risk > 0 ? reward / risk : null };
}

export function ghostBars(bars: readonly Bar[], from: number, to: number, shiftMs: number): Bar[] {
  return bars.filter((bar) => bar.time >= from && bar.time <= to).map((bar) => ({ ...bar, time: bar.time + shiftMs }));
}

export interface Mark {
  id: string;
  kind: "arrow" | "flag";
  time: number;
  price: number;
  direction: "up" | "down";
  text?: string;
}

export function createMark(mark: Mark): Mark {
  if (!mark.id.trim()) throw new Error("a mark needs an id");
  if (mark.direction !== "up" && mark.direction !== "down") throw new Error("direction must be up or down");
  return { ...mark };
}

export interface ChartLabel {
  id: string;
  kind: "text" | "note" | "callout" | "price" | "comment" | "table";
  time: number;
  price: number;
  text: string;
  rows?: string[][];
}

export function createLabel(label: ChartLabel): ChartLabel {
  if (!label.id.trim()) throw new Error("a label needs an id");
  if (label.kind === "table") {
    if (label.rows == null || label.rows.length === 0) throw new Error("a table needs rows");
  } else if (!label.text.trim()) {
    throw new Error("a label needs text");
  }
  return { ...label, rows: label.rows?.map((row) => [...row]) };
}

/** Middle peak above both shoulders, and both shoulders above the neckline. */
export function headAndShoulders(left: number, head: number, right: number, neck: number): boolean {
  return head > left && head > right && left > neck && right > neck;
}

export function harmonicRatios(x: number, a: number, b: number, c: number, d: number): { abOfXa: number; bcOfAb: number; cdOfBc: number; adOfXa: number; cdOfXc: number | null } {
  const xa = a - x;
  const ab = b - a;
  const bc = c - b;
  const cd = d - c;
  const xc = c - x;
  if (xa === 0 || ab === 0 || bc === 0) throw new Error("harmonic legs must have price range");
  return {
    abOfXa: Math.abs(ab / xa),
    bcOfAb: Math.abs(bc / ab),
    cdOfBc: Math.abs(cd / bc),
    adOfXa: Math.abs((a - d) / xa),
    cdOfXc: xc === 0 ? null : Math.abs((d - c) / xc),
  };
}

export function matchHarmonics(x: number, a: number, b: number, c: number, d: number, tolerance = 0.03): string[] {
  const ratios = harmonicRatios(x, a, b, c, d);
  const near = (value: number, target: number) => Math.abs(value - target) <= tolerance;
  const between = (value: number, low: number, high: number) => value >= low - tolerance && value <= high + tolerance;
  const names: string[] = [];
  if (near(ratios.abOfXa, 0.618) && between(ratios.bcOfAb, 0.382, 0.886) && between(ratios.cdOfBc, 1.272, 1.618) && near(ratios.adOfXa, 0.786)) names.push("gartley");
  if (between(ratios.abOfXa, 0.382, 0.5) && between(ratios.bcOfAb, 0.382, 0.886) && between(ratios.cdOfBc, 1.618, 2.618) && near(ratios.adOfXa, 0.886)) names.push("bat");
  if (near(ratios.abOfXa, 0.786) && between(ratios.bcOfAb, 0.382, 0.886) && between(ratios.cdOfBc, 1.618, 2.618) && between(ratios.adOfXa, 1.27, 1.618)) names.push("butterfly");
  if (between(ratios.abOfXa, 0.382, 0.618) && between(ratios.bcOfAb, 0.382, 0.886) && between(ratios.cdOfBc, 2.24, 3.618) && near(ratios.adOfXa, 1.618)) names.push("crab");
  if (between(ratios.bcOfAb, 1.13, 1.414) && ratios.cdOfXc != null && near(ratios.cdOfXc, 0.786)) names.push("cypher");
  return names;
}

export function abcdMatch(a: number, b: number, c: number, d: number, tolerance = 0.03): boolean {
  const ab = b - a;
  const bc = c - b;
  const cd = d - c;
  if (ab === 0 || bc === 0) return false;
  const retrace = Math.abs(bc / ab);
  const extension = Math.abs(cd / ab);
  return Math.abs(retrace - 0.618) <= tolerance && Math.abs(extension - 1) <= tolerance;
}

export function threeDrivesMatch(prices: readonly number[], tolerance = 0.05): boolean {
  if (prices.length !== 6) return false;
  const leg = (from: number, to: number) => prices[to] - prices[from];
  const first = leg(0, 1);
  const second = leg(2, 3);
  const third = leg(4, 5);
  if (first === 0 || second === 0) return false;
  const extensions = [Math.abs(second / first), Math.abs(third / second)];
  const retrace = Math.abs(leg(1, 2) / first);
  return extensions.every((value) => value >= 1.272 - tolerance && value <= 1.618 + tolerance) && Math.abs(retrace - 0.618) <= tolerance;
}

export function checkImpulse(prices: readonly [number, number, number, number, number, number]): { ok: boolean; reasons: string[] } {
  const [start, one, two, three, four, five] = prices;
  const reasons: string[] = [];
  const up = one > start;
  const wave = (from: number, to: number) => Math.abs(to - from);
  if (up ? two < start : two > start) reasons.push("wave 2 passed the start of wave 1");
  if (up ? four <= one : four >= one) reasons.push("wave 4 entered wave 1");
  const lengths = [wave(start, one), wave(two, three), wave(four, five)];
  if (lengths[1] <= lengths[0] && lengths[1] <= lengths[2]) reasons.push("wave 3 is the shortest");
  if (up ? !(one > start && three > one && five > three) : !(one < start && three < one && five < three)) reasons.push("impulse points do not make higher highs and higher lows");
  return { ok: reasons.length === 0, reasons };
}

export function checkZigzag(a: number, b: number, c: number): boolean {
  const ab = b - a;
  if (ab === 0) return false;
  const retrace = (b - c) / ab;
  return retrace > 0 && retrace < 1;
}

export function checkContractingTriangle(prices: readonly number[]): boolean {
  if (prices.length < 5) return false;
  const highs = prices.filter((_, index) => index % 2 === 0);
  const lows = prices.filter((_, index) => index % 2 === 1);
  const falling = highs.every((value, index) => index === 0 || value < highs[index - 1]);
  const rising = lows.every((value, index) => index === 0 || value > lows[index - 1]);
  return falling && rising;
}

/** Y continues the direction of the first leg, and X corrects it. */
export function checkCombination(start: number, w: number, x: number, y: number): boolean {
  const wave = w - start;
  if (wave === 0) return false;
  const correction = x - w;
  const next = y - x;
  return Math.sign(correction) === -Math.sign(wave) && Math.sign(next) === Math.sign(wave) && next !== 0;
}

export function cycleTimes(start: number, periodMs: number, count: number): number[] {
  if (!(periodMs > 0) || count < 1) throw new Error("period and count must be positive");
  return Array.from({ length: count }, (_, index) => start + index * periodMs);
}

export function sineValue(start: Point, end: Point, amplitude: number, cycles: number, time: number): number {
  const dt = end.time - start.time;
  if (dt === 0) throw new Error("sine anchors need different times");
  const phase = ((time - start.time) / dt) * cycles * Math.PI * 2;
  const midline = start.price + ((end.price - start.price) * (time - start.time)) / dt;
  return midline + amplitude * Math.sin(phase);
}

export type { Anchor };
