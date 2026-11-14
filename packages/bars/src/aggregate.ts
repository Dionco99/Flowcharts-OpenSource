// SPDX-License-Identifier: Apache-2.0

import { price } from "./price";
import { MINUTE, TF_MS } from "./time";
import type { Bar, Minute, Timeframe } from "./types";

/** Numeric view of a minute. The tape itself keeps decimal strings. */
export type NumericMinute = { t: number; o: number; h: number; l: number; c: number };

export type NumericBar = {
  t: number;
  ct: number;
  o: number;
  h: number;
  l: number;
  c: number;
  partial: boolean;
};

export function numericMinute(minute: Minute): NumericMinute {
  return { t: minute.t, o: Number(minute.o), h: Number(minute.h), l: Number(minute.l), c: Number(minute.c) };
}

function emit(bar: NumericBar, precision: number): Bar {
  return {
    t: bar.t,
    ct: bar.ct,
    o: price(bar.o, precision),
    h: price(bar.h, precision),
    l: price(bar.l, precision),
    c: price(bar.c, precision),
    partial: bar.partial,
  };
}

/**
 * Groups closed minutes into timeframe bars.
 * A bar is partial until the cursor reaches its end, and its range is only
 * the minutes that have already closed.
 */
export class BarBuilder {
  private cur: NumericBar | null = null;

  constructor(private readonly tfMs: number) {}

  closeIfDue(asOf: number): NumericBar | null {
    if (!this.cur) return null;
    if (asOf < this.cur.t + this.tfMs) return null;
    const bar = this.cur;
    bar.partial = false;
    bar.ct = bar.t + this.tfMs;
    this.cur = null;
    return bar;
  }

  add(minute: NumericMinute, closeTime: number): NumericBar | null {
    const start = Math.floor(minute.t / this.tfMs) * this.tfMs;
    if (!this.cur || this.cur.t !== start) {
      this.cur = { t: start, ct: closeTime, o: minute.o, h: minute.h, l: minute.l, c: minute.c, partial: true };
    } else {
      if (minute.h > this.cur.h) this.cur.h = minute.h;
      if (minute.l < this.cur.l) this.cur.l = minute.l;
      this.cur.c = minute.c;
      this.cur.ct = closeTime;
    }
    if (closeTime >= start + this.tfMs) {
      const bar = this.cur;
      bar.partial = false;
      bar.ct = start + this.tfMs;
      this.cur = null;
      return bar;
    }
    return null;
  }

  partial(): NumericBar | null {
    if (!this.cur) return null;
    this.cur.partial = true;
    return this.cur;
  }
}

export function aggregate(minutes: readonly Minute[], tf: Timeframe, cursor: number, precision = 5): Bar[] {
  const builder = new BarBuilder(TF_MS[tf]);
  const out: NumericBar[] = [];
  for (const minute of minutes) {
    const closeTime = minute.t + MINUTE;
    if (closeTime > cursor) break;
    const overdue = builder.closeIfDue(minute.t);
    if (overdue) out.push(overdue);
    const closed = builder.add(numericMinute(minute), closeTime);
    if (closed) out.push(closed);
  }
  const tail = builder.closeIfDue(cursor);
  if (tail) out.push(tail);
  const forming = builder.partial();
  if (forming) out.push(forming);
  return out.map((bar) => emit(bar, precision));
}
