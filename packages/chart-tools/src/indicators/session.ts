// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import { assertAscending, type Bar, type Series } from "../bar.ts";

export interface SessionOptions {
  /** Minutes east of UTC. */
  offsetMinutes?: number;
  /** Local minute of day when a session opens. 0 is local midnight. */
  openMinute?: number;
}

export function sessionDay(time: number, offsetMinutes: number, openMinute: number): number {
  const shifted = time + offsetMinutes * 60_000 - openMinute * 60_000;
  return Math.floor(shifted / 86_400_000);
}

function options(input?: SessionOptions): { offsetMinutes: number; openMinute: number } {
  const offsetMinutes = input?.offsetMinutes ?? 0;
  const openMinute = input?.openMinute ?? 0;
  if (!Number.isInteger(offsetMinutes) || offsetMinutes < -14 * 60 || offsetMinutes > 14 * 60) {
    throw new Error("offsetMinutes must be a whole number of minutes within 14 hours");
  }
  if (!Number.isInteger(openMinute) || openMinute < 0 || openMinute >= 24 * 60) {
    throw new Error("openMinute must be a whole minute from 0 through 1439");
  }
  return { offsetMinutes, openMinute };
}

/** Running high and low of the current session. The first bar starts a session. */
export function sessionHighLow(bars: readonly Bar[], input?: SessionOptions): { high: Series; low: Series } {
  assertAscending(bars);
  const { offsetMinutes, openMinute } = options(input);
  const high: Series = [];
  const low: Series = [];
  let day: number | null = null;
  let sessionHigh = 0;
  let sessionLow = 0;
  for (const bar of bars) {
    const nextDay = sessionDay(bar.time, offsetMinutes, openMinute);
    if (day !== nextDay) {
      day = nextDay;
      sessionHigh = bar.high;
      sessionLow = bar.low;
    } else {
      sessionHigh = Math.max(sessionHigh, bar.high);
      sessionLow = Math.min(sessionLow, bar.low);
    }
    high.push(sessionHigh);
    low.push(sessionLow);
  }
  return { high, low };
}

/** High and low of the previous session day. The first day is empty. */
export function previousDayHighLow(bars: readonly Bar[], input?: SessionOptions): { high: Series; low: Series } {
  assertAscending(bars);
  const { offsetMinutes, openMinute } = options(input);
  const days: number[] = bars.map((bar) => sessionDay(bar.time, offsetMinutes, openMinute));
  const extremes = new Map<number, { high: number; low: number }>();
  for (let index = 0; index < bars.length; index += 1) {
    const day = days[index];
    const bar = bars[index];
    const current = extremes.get(day);
    if (!current) {
      extremes.set(day, { high: bar.high, low: bar.low });
    } else {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
    }
  }
  const ordered = [...extremes.keys()].sort((left, right) => left - right);
  const priorDay = new Map<number, number>();
  for (let index = 1; index < ordered.length; index += 1) {
    priorDay.set(ordered[index], ordered[index - 1]);
  }
  const high: Series = [];
  const low: Series = [];
  for (const day of days) {
    const previous = priorDay.get(day);
    const prior = previous == null ? undefined : extremes.get(previous);
    high.push(prior ? prior.high : null);
    low.push(prior ? prior.low : null);
  }
  return { high, low };
}
