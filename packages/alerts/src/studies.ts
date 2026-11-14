// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { type Bar, type PriceSource, isPriceSource, priceOf } from "./bars.ts";
import { Decimal } from "./decimal.ts";
import { AlertsError } from "./errors.ts";

export const STUDY_NAMES = ["sma", "ema", "rsi", "atr", "bollinger", "highest", "lowest"] as const;
export type StudyName = (typeof STUDY_NAMES)[number];

export interface StudyParams {
  length?: number;
  source?: PriceSource;
  mult?: string;
}

const SCALE = 8;

export function isStudyName(value: string): value is StudyName {
  return (STUDY_NAMES as readonly string[]).includes(value);
}

export function studyPlots(name: StudyName): readonly string[] {
  if (name === "bollinger") return ["middle", "upper", "lower"];
  return [name];
}

export function runStudy(
  name: StudyName,
  bars: readonly Bar[],
  params: StudyParams = {},
): Record<string, (string | null)[]> {
  const length = readLength(params.length, name === "rsi" || name === "atr" ? 14 : 20);
  const source = readSource(params.source, name);
  if (name === "sma") return { sma: formatSeries(sma(readSourceSeries(bars, source), length)) };
  if (name === "ema") return { ema: formatSeries(ema(readSourceSeries(bars, source), length)) };
  if (name === "rsi") return { rsi: formatSeries(rsi(readSourceSeries(bars, "close"), length)) };
  if (name === "atr") return { atr: formatSeries(atr(bars, length)) };
  if (name === "highest") return { highest: formatSeries(rollingExtreme(readSourceSeries(bars, source), length, 1)) };
  if (name === "lowest") return { lowest: formatSeries(rollingExtreme(readSourceSeries(bars, source), length, -1)) };
  const mult = Decimal.parse(params.mult ?? "2");
  if (mult.cmp(Decimal.zero()) <= 0) {
    throw new AlertsError("invalid_argument", "bollinger mult must be positive");
  }
  const bands = bollinger(readSourceSeries(bars, source), length, mult);
  return {
    middle: formatSeries(bands.middle),
    upper: formatSeries(bands.upper),
    lower: formatSeries(bands.lower),
  };
}

function readLength(length: number | undefined, fallback: number): number {
  const value = length ?? fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new AlertsError("invalid_argument", "length must be a positive integer");
  }
  return value;
}

function readSource(source: PriceSource | undefined, name: StudyName): PriceSource {
  if (source === undefined) {
    if (name === "highest") return "high";
    if (name === "lowest") return "low";
    return "close";
  }
  if (!isPriceSource(source)) {
    throw new AlertsError("invalid_argument", "unknown price source");
  }
  return source;
}

function readSourceSeries(bars: readonly Bar[], source: PriceSource): Decimal[] {
  return bars.map((bar) => Decimal.parse(priceOf(bar, source)));
}

function formatSeries(values: Array<Decimal | null>): (string | null)[] {
  return values.map((value) => (value === null ? null : value.rescale(SCALE).toString()));
}

function sma(values: Decimal[], length: number): Array<Decimal | null> {
  const out: Array<Decimal | null> = [];
  let sum = Decimal.zero();
  for (let i = 0; i < values.length; i += 1) {
    sum = sum.add(values[i]);
    if (i >= length) sum = sum.sub(values[i - length]);
    out.push(i + 1 >= length ? sum.div(Decimal.int(BigInt(length)), SCALE) : null);
  }
  return out;
}

function ema(values: Decimal[], length: number): Array<Decimal | null> {
  const seed = sma(values, length);
  const weight = Decimal.int(2n).div(Decimal.int(BigInt(length + 1)), SCALE);
  const keep = Decimal.int(1n).sub(weight);
  const out: Array<Decimal | null> = seed.map(() => null);
  let prev: Decimal | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (seed[i] === null) continue;
    if (prev === null) {
      prev = seed[i];
      out[i] = prev;
      continue;
    }
    prev = values[i].mul(weight).add(prev.mul(keep)).rescale(SCALE);
    out[i] = prev;
  }
  return out;
}

function rsi(closes: Decimal[], length: number): Array<Decimal | null> {
  const out: Array<Decimal | null> = closes.map(() => null);
  if (closes.length <= length) return out;
  let gain = Decimal.zero();
  let loss = Decimal.zero();
  for (let i = 1; i <= length; i += 1) {
    const change = closes[i].sub(closes[i - 1]);
    if (change.cmp(Decimal.zero()) > 0) gain = gain.add(change);
    else loss = loss.add(change.neg());
  }
  let avgGain = gain.div(Decimal.int(BigInt(length)), SCALE);
  let avgLoss = loss.div(Decimal.int(BigInt(length)), SCALE);
  out[length] = rsiValue(avgGain, avgLoss);
  const period = Decimal.int(BigInt(length));
  const prevWeight = Decimal.int(BigInt(length - 1));
  for (let i = length + 1; i < closes.length; i += 1) {
    const change = closes[i].sub(closes[i - 1]);
    const up = change.cmp(Decimal.zero()) > 0 ? change : Decimal.zero();
    const down = change.cmp(Decimal.zero()) < 0 ? change.neg() : Decimal.zero();
    avgGain = avgGain.mul(prevWeight).add(up).div(period, SCALE);
    avgLoss = avgLoss.mul(prevWeight).add(down).div(period, SCALE);
    out[i] = rsiValue(avgGain, avgLoss);
  }
  return out;
}

function rsiValue(avgGain: Decimal, avgLoss: Decimal): Decimal {
  if (avgLoss.isZero()) return Decimal.int(100n);
  if (avgGain.isZero()) return Decimal.zero();
  const rs = avgGain.div(avgLoss, SCALE);
  const hundred = Decimal.int(100n);
  return hundred.sub(hundred.div(Decimal.int(1n).add(rs), SCALE));
}

function atr(bars: readonly Bar[], length: number): Array<Decimal | null> {
  const tr: Decimal[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const range = Decimal.parse(bars[i].high).sub(Decimal.parse(bars[i].low));
    if (i === 0) {
      tr.push(range);
      continue;
    }
    const prev = Decimal.parse(bars[i - 1].close);
    const up = Decimal.parse(bars[i].high).sub(prev);
    const down = prev.sub(Decimal.parse(bars[i].low));
    tr.push(maxDec(range, maxDec(up, down)));
  }
  const seeded = sma(tr, length);
  const out: Array<Decimal | null> = seeded.map(() => null);
  let prev: Decimal | null = null;
  const period = Decimal.int(BigInt(length));
  const prevWeight = Decimal.int(BigInt(length - 1));
  for (let i = 0; i < tr.length; i += 1) {
    if (seeded[i] === null) continue;
    if (prev === null) {
      prev = seeded[i];
      out[i] = prev;
      continue;
    }
    prev = prev.mul(prevWeight).add(tr[i]).div(period, SCALE);
    out[i] = prev;
  }
  return out;
}

function bollinger(
  values: Decimal[],
  length: number,
  mult: Decimal,
): { middle: Array<Decimal | null>; upper: Array<Decimal | null>; lower: Array<Decimal | null> } {
  const middle = sma(values, length);
  const upper: Array<Decimal | null> = [];
  const lower: Array<Decimal | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    const mid = middle[i];
    if (mid === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sumSq = Decimal.zero();
    for (let j = i - length + 1; j <= i; j += 1) {
      const diff = values[j].sub(mid);
      sumSq = sumSq.add(diff.mul(diff));
    }
    const variance = sumSq.div(Decimal.int(BigInt(length)), SCALE * 2);
    const sd = sqrtDecimal(variance);
    const band = sd.mul(mult);
    upper.push(mid.add(band).rescale(SCALE));
    lower.push(mid.sub(band).rescale(SCALE));
  }
  return { middle, upper, lower };
}

function rollingExtreme(values: Decimal[], length: number, sign: 1 | -1): Array<Decimal | null> {
  const out: Array<Decimal | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < length) {
      out.push(null);
      continue;
    }
    let best = values[i - length + 1];
    for (let j = i - length + 2; j <= i; j += 1) {
      if (values[j].cmp(best) * sign > 0) best = values[j];
    }
    out.push(best);
  }
  return out;
}

function maxDec(a: Decimal, b: Decimal): Decimal {
  return a.cmp(b) >= 0 ? a : b;
}

function sqrtDecimal(value: Decimal): Decimal {
  if (value.n < 0n) throw new AlertsError("invalid_argument", "square root of a negative");
  if (value.n === 0n) return Decimal.zero();
  const outScale = SCALE;
  const exp = outScale * 2 - value.scale;
  const radicand = exp >= 0 ? value.n * 10n ** BigInt(exp) : value.n / 10n ** BigInt(-exp);
  const root = isqrt(radicand);
  return Decimal.scaled(root, outScale);
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}
