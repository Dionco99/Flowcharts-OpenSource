// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { type Bar, assertBars, closedBars } from "./bars.ts";
import { Decimal, cmpDecimal, percentChange } from "./decimal.ts";
import { AlertsError } from "./errors.ts";
import { type StudyName, type StudyParams, isStudyName, runStudy, studyPlots } from "./studies.ts";
import { assertUtc, cmpTime } from "./time.ts";

export interface Headline {
  symbol: string;
  time: string;
  title: string;
}

export interface ScreenRow {
  symbol: string;
  bars: readonly Bar[];
  fundamentals?: Record<string, string | null | undefined>;
  headlines?: readonly Headline[];
}

export type ScreenFilter =
  | { type: "study-range"; name: StudyName; plot?: string; params?: StudyParams; min?: string; max?: string }
  | { type: "close-versus-study"; name: StudyName; plot?: string; params?: StudyParams; relation: "above" | "below" }
  | { type: "percent-change"; lookback: number; direction: "up" | "down"; min: string }
  | { type: "volume-versus-average"; length: number; min: string }
  | { type: "new-high" }
  | { type: "new-low" }
  | { type: "fundamental"; field: string; min?: string; max?: string }
  | { type: "headline"; phrase: string; since?: string };

export interface ScreenHit {
  symbol: string;
  metrics: Record<string, string>;
}

export interface HotlistRow {
  symbol: string;
  metric: string;
  rank: number;
}

/** Every filter must pass. The metric is the latest finite value at the cursor. */
export function screen(rows: readonly ScreenRow[], filters: readonly ScreenFilter[], cursor: string): ScreenHit[] {
  assertUtc(cursor);
  for (const filter of filters) assertFilter(filter);
  const hits: ScreenHit[] = [];
  for (const row of rows) {
    const symbol = readSymbol(row.symbol);
    const window = closedBars(assertBars(row.bars), cursor);
    const metrics: Record<string, string> = {};
    let ok = true;
    for (const filter of filters) {
      if (!applyFilter(filter, { ...row, symbol }, window, cursor, metrics)) {
        ok = false;
        break;
      }
    }
    if (ok && window.length > 0) hits.push({ symbol, metrics });
  }
  return hits;
}

export function hotlist(
  rows: readonly ScreenRow[],
  cursor: string,
  options: { by: "percent" | "volume"; lookback?: number; length?: number; limit?: number; side: "gainers" | "losers" | "active" },
): HotlistRow[] {
  assertUtc(cursor);
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AlertsError("invalid_argument", "limit must be a positive integer");
  }
  const scored: { symbol: string; metric: string }[] = [];
  for (const row of rows) {
    const symbol = readSymbol(row.symbol);
    const window = closedBars(assertBars(row.bars), cursor);
    if (options.by === "percent") {
      if (options.side === "active") {
        throw new AlertsError("invalid_argument", "percent hotlists are gainers or losers");
      }
      const lookback = options.lookback ?? 10;
      const change = changeOver(window, lookback);
      if (change === null) continue;
      scored.push({ symbol, metric: change });
    } else {
      if (options.side !== "active") {
        throw new AlertsError("invalid_argument", "volume hotlists are active");
      }
      const ratio = volumeRatio(window, options.length ?? 20);
      if (ratio === null) continue;
      scored.push({ symbol, metric: ratio });
    }
  }
  const ranked = scored.filter((row) => {
    const cmp = cmpDecimal(row.metric, "0");
    if (options.side === "gainers") return cmp > 0;
    if (options.side === "losers") return cmp < 0;
    return true;
  });
  const sign = options.side === "losers" ? 1 : -1;
  ranked.sort((a, b) => cmpDecimal(a.metric, b.metric) * sign || a.symbol.localeCompare(b.symbol));
  return ranked.slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));
}

function assertFilter(filter: ScreenFilter): void {
  if (filter.type === "study-range" || filter.type === "close-versus-study") {
    if (!isStudyName(filter.name)) throw new AlertsError("invalid_argument", "unknown study");
    const plot = filter.plot ?? (filter.name === "bollinger" ? "middle" : filter.name);
    if (!(studyPlots(filter.name) as readonly string[]).includes(plot)) {
      throw new AlertsError("invalid_argument", `study ${filter.name} has no plot ${plot}`);
    }
    if (filter.type === "study-range") {
      if (filter.min !== undefined) Decimal.parse(filter.min);
      if (filter.max !== undefined) Decimal.parse(filter.max);
    }
    return;
  }
  if (filter.type === "percent-change") {
    if (!Number.isInteger(filter.lookback) || filter.lookback < 1) {
      throw new AlertsError("invalid_argument", "lookback must be a positive integer");
    }
    Decimal.parse(filter.min);
    return;
  }
  if (filter.type === "volume-versus-average") {
    if (!Number.isInteger(filter.length) || filter.length < 1) {
      throw new AlertsError("invalid_argument", "length must be a positive integer");
    }
    Decimal.parse(filter.min);
    return;
  }
  if (filter.type === "new-high" || filter.type === "new-low") return;
  if (filter.type === "fundamental") {
    if (filter.field.trim() === "") throw new AlertsError("invalid_argument", "fundamental field is empty");
    if (filter.min !== undefined) Decimal.parse(filter.min);
    if (filter.max !== undefined) Decimal.parse(filter.max);
    return;
  }
  if (filter.type === "headline") {
    if (filter.phrase.trim() === "") throw new AlertsError("invalid_argument", "headline phrase is empty");
    if (filter.since !== undefined) assertUtc(filter.since, "since");
    return;
  }
  throw new AlertsError("invalid_argument", "unknown screener filter");
}

function applyFilter(
  filter: ScreenFilter,
  row: ScreenRow,
  window: readonly Bar[],
  cursor: string,
  metrics: Record<string, string>,
): boolean {
  if (window.length === 0) return false;
  if (filter.type === "study-range") return studyInRange(filter, window, metrics);
  if (filter.type === "close-versus-study") return closeVersus(filter, window, metrics);
  if (filter.type === "percent-change") {
    const change = changeOver(window, filter.lookback);
    if (change === null) return false;
    metrics.percent = change;
    const cmp = cmpDecimal(change, filter.min);
    return filter.direction === "up" ? cmp >= 0 : cmpDecimal(change, Decimal.parse(filter.min).neg().toString()) <= 0;
  }
  if (filter.type === "volume-versus-average") {
    const ratio = volumeRatio(window, filter.length);
    if (ratio === null) return false;
    metrics.volumeRatio = ratio;
    return cmpDecimal(ratio, filter.min) >= 0;
  }
  if (filter.type === "new-high") {
    const latest = window[window.length - 1].high;
    const extreme = window.reduce((best, bar) => (cmpDecimal(bar.high, best) > 0 ? bar.high : best), window[0].high);
    metrics.high = latest;
    return cmpDecimal(latest, extreme) === 0;
  }
  if (filter.type === "new-low") {
    const latest = window[window.length - 1].low;
    const extreme = window.reduce((best, bar) => (cmpDecimal(bar.low, best) < 0 ? bar.low : best), window[0].low);
    metrics.low = latest;
    return cmpDecimal(latest, extreme) === 0;
  }
  if (filter.type === "fundamental") return fundamental(filter, row, metrics);
  return headline(filter, row, cursor, metrics);
}

function studyInRange(
  filter: Extract<ScreenFilter, { type: "study-range" }>,
  window: readonly Bar[],
  metrics: Record<string, string>,
): boolean {
  const value = latestPlot(filter.name, filter.plot, filter.params, window);
  if (value === null) return false;
  metrics[filter.plot ?? filter.name] = value;
  if (filter.min !== undefined && cmpDecimal(value, filter.min) < 0) return false;
  if (filter.max !== undefined && cmpDecimal(value, filter.max) > 0) return false;
  return true;
}

function closeVersus(
  filter: Extract<ScreenFilter, { type: "close-versus-study" }>,
  window: readonly Bar[],
  metrics: Record<string, string>,
): boolean {
  const value = latestPlot(filter.name, filter.plot, filter.params, window);
  if (value === null) return false;
  const close = window[window.length - 1].close;
  metrics.close = close;
  metrics[filter.plot ?? filter.name] = value;
  const cmp = cmpDecimal(close, value);
  return filter.relation === "above" ? cmp > 0 : cmp < 0;
}

function latestPlot(
  name: StudyName,
  plot: string | undefined,
  params: StudyParams | undefined,
  window: readonly Bar[],
): string | null {
  const key = plot ?? (name === "bollinger" ? "middle" : name);
  const series = runStudy(name, window, params)[key];
  if (!series) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (series[i] !== null) return series[i];
  }
  return null;
}

function changeOver(window: readonly Bar[], lookback: number): string | null {
  if (window.length <= lookback) return null;
  const last = window[window.length - 1].close;
  const past = window[window.length - 1 - lookback].close;
  return percentChange(last, past);
}

function volumeRatio(window: readonly Bar[], length: number): string | null {
  if (window.length <= length) return null;
  const latest = Decimal.parse(window[window.length - 1].volume);
  let sum = Decimal.zero();
  for (let i = window.length - 1 - length; i < window.length - 1; i += 1) {
    sum = sum.add(Decimal.parse(window[i].volume));
  }
  const avg = sum.div(Decimal.int(BigInt(length)), 8);
  if (avg.isZero()) return null;
  return latest.div(avg, 6).toString();
}

function fundamental(
  filter: Extract<ScreenFilter, { type: "fundamental" }>,
  row: ScreenRow,
  metrics: Record<string, string>,
): boolean {
  const raw = row.fundamentals?.[filter.field];
  if (raw === undefined || raw === null || raw === "") return false;
  const value = Decimal.parse(raw).toString();
  metrics[filter.field] = value;
  if (filter.min !== undefined && cmpDecimal(value, filter.min) < 0) return false;
  if (filter.max !== undefined && cmpDecimal(value, filter.max) > 0) return false;
  return true;
}

function headline(
  filter: Extract<ScreenFilter, { type: "headline" }>,
  row: ScreenRow,
  cursor: string,
  metrics: Record<string, string>,
): boolean {
  const phrase = filter.phrase.trim().toLowerCase();
  const match = (row.headlines ?? []).find((item) => {
    if (item.symbol.toUpperCase() !== row.symbol.toUpperCase()) return false;
    if (cmpTime(item.time, cursor) > 0) return false;
    if (filter.since !== undefined && cmpTime(item.time, filter.since) < 0) return false;
    return item.title.toLowerCase().includes(phrase);
  });
  if (!match) return false;
  metrics.headline = match.title;
  return true;
}

function readSymbol(symbol: string): string {
  const text = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,32}$/.test(text)) {
    throw new AlertsError("invalid_argument", "symbol must be 1 to 32 letters, digits, dots, or dashes");
  }
  return text;
}
