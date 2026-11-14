// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { type Bar, type PriceSource, isPriceSource, priceOf, sealBars } from "./bars.ts";
import { type Drawing, assertDrawing, barTouches } from "./drawings.ts";
import { Decimal, cmpDecimal, percentChange } from "./decimal.ts";
import { AlertsError } from "./errors.ts";
import { type StudyName, type StudyParams, isStudyName, runStudy, studyPlots } from "./studies.ts";

export type SeriesRef =
  | { kind: "price"; source: PriceSource }
  | { kind: "indicator"; name: StudyName; plot?: string; params?: StudyParams }
  | { kind: "values"; values: Array<string | null> };

export interface Level {
  kind: "level";
  value: string;
}

export type Operand = SeriesRef | Level;

export type CompareOp = "gt" | "gte" | "lt" | "lte" | "eq";
export type CrossDirection = "up" | "down" | "any";

export type Rule =
  | { type: "compare"; left: SeriesRef; op: CompareOp; right: Operand }
  | { type: "cross"; left: SeriesRef; right: Operand; direction: CrossDirection }
  | { type: "channel"; value: SeriesRef; lower: Operand; upper: Operand; event: "enter" | "exit" }
  | { type: "percent"; source: SeriesRef; lookback: number; percent: string; direction: CrossDirection }
  | { type: "drawing"; drawing: Drawing };

export interface Evaluation {
  fired: boolean;
  index: number;
  closeTime: string;
  price: string;
  message: string;
}

const OPS = new Set<CompareOp>(["gt", "gte", "lt", "lte", "eq"]);
const DIRS = new Set<CrossDirection>(["up", "down", "any"]);

/** The rule on the latest sealed bar. It fires on the bar where it becomes true. */
export function evaluateRule(rule: Rule, bars: readonly Bar[], cursor: string): Evaluation {
  const window = sealBars(bars, cursor);
  assertRule(rule);
  if (window.length === 0) {
    return { fired: false, index: -1, closeTime: cursor, price: "", message: "" };
  }
  const index = window.length - 1;
  const fired = becomesTrue(rule, window, index);
  const bar = window[index];
  return {
    fired,
    index,
    closeTime: bar.closeTime,
    price: bar.close,
    message: fired ? describe(rule, bar) : "",
  };
}

export function assertRule(rule: Rule): void {
  if (rule.type === "compare") {
    assertSeries(rule.left);
    assertOperand(rule.right);
    if (!OPS.has(rule.op)) throw new AlertsError("invalid_rule", "unknown comparison");
    return;
  }
  if (rule.type === "cross") {
    assertSeries(rule.left);
    assertOperand(rule.right);
    if (!DIRS.has(rule.direction)) throw new AlertsError("invalid_rule", "unknown cross direction");
    return;
  }
  if (rule.type === "channel") {
    assertSeries(rule.value);
    assertOperand(rule.lower);
    assertOperand(rule.upper);
    if (rule.event !== "enter" && rule.event !== "exit") {
      throw new AlertsError("invalid_rule", "channel event must be enter or exit");
    }
    return;
  }
  if (rule.type === "percent") {
    assertSeries(rule.source);
    if (!Number.isInteger(rule.lookback) || rule.lookback < 1) {
      throw new AlertsError("invalid_rule", "lookback must be a positive integer");
    }
    const threshold = Decimal.parse(rule.percent);
    if (threshold.cmp(Decimal.zero()) < 0) {
      throw new AlertsError("invalid_rule", "percent must be zero or positive");
    }
    if (!DIRS.has(rule.direction)) throw new AlertsError("invalid_rule", "unknown percent direction");
    return;
  }
  if (rule.type === "drawing") {
    assertDrawing(rule.drawing);
    return;
  }
  throw new AlertsError("invalid_rule", "unknown rule");
}

function assertSeries(ref: SeriesRef): void {
  if (ref.kind === "price") {
    if (!isPriceSource(ref.source)) throw new AlertsError("invalid_rule", "unknown price source");
    return;
  }
  if (ref.kind === "indicator") {
    if (!isStudyName(ref.name)) throw new AlertsError("invalid_rule", "unknown indicator");
    const plot = ref.plot ?? ref.name;
    if (!(studyPlots(ref.name) as readonly string[]).includes(plot)) {
      throw new AlertsError("invalid_rule", `indicator ${ref.name} has no plot ${plot}`);
    }
    return;
  }
  if (ref.kind === "values") {
    if (!Array.isArray(ref.values)) throw new AlertsError("invalid_rule", "values must be a list");
    return;
  }
  throw new AlertsError("invalid_rule", "unknown series");
}

function assertOperand(ref: Operand): void {
  if (ref.kind === "level") {
    Decimal.parse(ref.value);
    return;
  }
  assertSeries(ref);
}

/** True when this sealed bar is the one where the rule becomes true. */
export function firedOnBar(rule: Rule, bars: readonly Bar[], index: number): boolean {
  assertRule(rule);
  if (index < 0 || index >= bars.length) {
    throw new AlertsError("invalid_argument", "bar index is outside the window");
  }
  return becomesTrue(rule, bars, index);
}

function becomesTrue(rule: Rule, bars: readonly Bar[], index: number): boolean {
  if (rule.type === "cross" || rule.type === "channel") return active(rule, bars, index);
  return active(rule, bars, index) && (index === 0 || !active(rule, bars, index - 1));
}

function active(rule: Rule, bars: readonly Bar[], index: number): boolean {
  if (rule.type === "drawing") return barTouches(bars[index], rule.drawing);
  if (rule.type === "compare") return compareAt(rule, bars, index);
  if (rule.type === "cross") return crossAt(rule, bars, index);
  if (rule.type === "channel") return channelAt(rule, bars, index);
  return percentAt(rule, bars, index);
}

function compareAt(rule: Extract<Rule, { type: "compare" }>, bars: readonly Bar[], index: number): boolean {
  const cmp = cmpAt(rule.left, rule.right, bars, index);
  if (cmp === null) return false;
  if (rule.op === "gt") return cmp > 0;
  if (rule.op === "gte") return cmp >= 0;
  if (rule.op === "lt") return cmp < 0;
  if (rule.op === "lte") return cmp <= 0;
  return cmp === 0;
}

function crossAt(rule: Extract<Rule, { type: "cross" }>, bars: readonly Bar[], index: number): boolean {
  if (index === 0) return false;
  const prev = cmpAt(rule.left, rule.right, bars, index - 1);
  const curr = cmpAt(rule.left, rule.right, bars, index);
  if (prev === null || curr === null) return false;
  const up = prev <= 0 && curr > 0;
  const down = prev >= 0 && curr < 0;
  if (rule.direction === "up") return up;
  if (rule.direction === "down") return down;
  return up || down;
}

function channelAt(rule: Extract<Rule, { type: "channel" }>, bars: readonly Bar[], index: number): boolean {
  const insideNow = inside(rule, bars, index);
  if (insideNow === null) return false;
  if (index === 0) return rule.event === "enter" && insideNow;
  const insidePrev = inside(rule, bars, index - 1);
  if (insidePrev === null) return rule.event === "enter" && insideNow;
  if (rule.event === "enter") return insideNow && !insidePrev;
  return !insideNow && insidePrev;
}

function inside(rule: Extract<Rule, { type: "channel" }>, bars: readonly Bar[], index: number): boolean | null {
  const value = point(rule.value, bars, index);
  const lower = point(rule.lower, bars, index);
  const upper = point(rule.upper, bars, index);
  if (value === null || lower === null || upper === null) return null;
  if (cmpDecimal(lower, upper) > 0) {
    throw new AlertsError("invalid_rule", "channel lower is above upper");
  }
  return cmpDecimal(value, lower) >= 0 && cmpDecimal(value, upper) <= 0;
}

function percentAt(rule: Extract<Rule, { type: "percent" }>, bars: readonly Bar[], index: number): boolean {
  if (index < rule.lookback) return false;
  const curr = point(rule.source, bars, index);
  const past = point(rule.source, bars, index - rule.lookback);
  if (curr === null || past === null) return false;
  const change = percentChange(curr, past);
  if (change === null) return false;
  const cmp = cmpDecimal(change, rule.percent);
  const down = cmpDecimal(change, `-${trimPercent(rule.percent)}`);
  if (rule.direction === "up") return cmp >= 0;
  if (rule.direction === "down") return down <= 0;
  return cmp >= 0 || down <= 0;
}

function trimPercent(value: string): string {
  return Decimal.parse(value).toString();
}

function cmpAt(left: SeriesRef, right: Operand, bars: readonly Bar[], index: number): -1 | 0 | 1 | null {
  const a = point(left, bars, index);
  const b = point(right, bars, index);
  if (a === null || b === null) return null;
  return cmpDecimal(a, b);
}

const seriesCache = new WeakMap<readonly Bar[], Map<string, (string | null)[]>>();

function point(ref: Operand, bars: readonly Bar[], index: number): string | null {
  if (ref.kind === "level") return ref.value;
  const series = seriesOf(ref, bars);
  if (series.length !== bars.length) {
    throw new AlertsError("invalid_rule", "series length does not match the sealed window");
  }
  return series[index] ?? null;
}

function seriesOf(ref: SeriesRef, bars: readonly Bar[]): (string | null)[] {
  if (ref.kind === "price") return bars.map((bar) => priceOf(bar, ref.source));
  if (ref.kind === "values") return ref.values;
  const plot = ref.plot ?? ref.name;
  const key = JSON.stringify({ name: ref.name, plot, params: ref.params ?? {} });
  let bucket = seriesCache.get(bars);
  if (!bucket) {
    bucket = new Map();
    seriesCache.set(bars, bucket);
  }
  const cached = bucket.get(key);
  if (cached) return cached;
  const plots = runStudy(ref.name, bars, ref.params);
  const series = plots[plot];
  if (!series) throw new AlertsError("invalid_rule", `indicator ${ref.name} has no plot ${plot}`);
  bucket.set(key, series);
  return series;
}

function describe(rule: Rule, bar: Bar): string {
  if (rule.type === "compare") return `${label(rule.left)} ${word(rule.op)} ${label(rule.right)}`;
  if (rule.type === "cross") {
    const dir = rule.direction === "down" ? "below" : rule.direction === "up" ? "above" : "through";
    return `${label(rule.left)} crossed ${dir} ${label(rule.right)}`;
  }
  if (rule.type === "channel") {
    return `${label(rule.value)} ${rule.event === "enter" ? "entered" : "left"} the channel`;
  }
  if (rule.type === "percent") {
    const dir = rule.direction === "down" ? "fell" : rule.direction === "up" ? "rose" : "moved";
    return `${label(rule.source)} ${dir} ${rule.percent}% over ${rule.lookback} bars`;
  }
  if (rule.drawing.kind === "horizontal") return `range touched the horizontal ${rule.drawing.price}`;
  return `range touched the ${rule.drawing.kind}`;
}

function label(ref: Operand): string {
  if (ref.kind === "level") return ref.value;
  if (ref.kind === "price") return ref.source;
  if (ref.kind === "values") return "series";
  return ref.plot ?? ref.name;
}

function word(op: CompareOp): string {
  if (op === "gt") return "rose above";
  if (op === "gte") return "reached";
  if (op === "lt") return "fell below";
  if (op === "lte") return "fell to";
  return "equaled";
}

export function ruleUsesIndicator(rule: Rule): boolean {
  const refs = operands(rule);
  return refs.some((ref) => ref.kind === "indicator" || ref.kind === "values");
}

function operands(rule: Rule): Operand[] {
  if (rule.type === "compare" || rule.type === "cross") return [rule.left, rule.right];
  if (rule.type === "channel") return [rule.value, rule.lower, rule.upper];
  if (rule.type === "percent") return [rule.source];
  return [];
}
