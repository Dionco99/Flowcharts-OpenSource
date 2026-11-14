// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceError } from "./errors.js";
import {
  addCivilDays,
  civilDayNumber,
  civilToUtc,
  clockMinutes,
  minutesToClock,
  utcToCivil,
  type Civil,
} from "./time.js";
import type { SymbolSpec } from "./types.js";

export type PeriodUnit = "m" | "h" | "D";

export interface ParsedPeriod {
  source: string;
  span: number;
  unit: PeriodUnit;
}

const PERIOD = /^([1-9]\d{0,4})(m|h|D)$/;
const DAY_ORIGIN = civilDayNumber(1970, 1, 4);

export function parsePeriod(source: string): ParsedPeriod {
  if (typeof source !== "string") {
    throw new WorkspaceError("invalid_period", "period must be a string");
  }
  const match = PERIOD.exec(source);
  if (!match) {
    throw new WorkspaceError(
      "invalid_period",
      "period must look like 7m, 2h, or 3D",
    );
  }
  return { source, span: Number(match[1]), unit: match[2] as PeriodUnit };
}

export interface Bucket {
  open: number;
  close: number;
}

function sessionOpenAtOrBefore(ms: number, timeZone: string, anchor: number): number {
  const civil = utcToCivil(ms, timeZone);
  const clock = minutesToClock(anchor);
  let date: Pick<Civil, "year" | "month" | "day"> = {
    year: civil.year,
    month: civil.month,
    day: civil.day,
  };
  if (civil.hour * 60 + civil.minute < anchor) {
    date = addCivilDays(date, -1);
  }
  return civilToUtc(
    { ...date, hour: clock.hour, minute: clock.minute, second: 0 },
    timeZone,
  );
}

function nextSessionOpen(sessionOpen: number, timeZone: string, anchor: number): number {
  const civil = utcToCivil(sessionOpen, timeZone);
  const clock = minutesToClock(anchor);
  const next = addCivilDays(civil, 1);
  return civilToUtc(
    { ...next, hour: clock.hour, minute: clock.minute, second: 0 },
    timeZone,
  );
}

function floorMod(value: number, span: number): number {
  return ((value % span) + span) % span;
}

/**
 * Bucket that contains `ms`.
 *
 * Minutes and hours step in real time from the market-open clock and restart
 * at the next market open, so 7m and 2h line up on that clock every session
 * day. A bucket that would pass the next market open is clipped to it.
 * Days cover `span` session days from a fixed Sunday origin. The close is the
 * market-open clock `span` session days later, which still exists across a
 * daylight-saving change. A minute or hour close is one real-time span after
 * its open, so a skipped clock hour is not the close.
 */
export function bucketOf(ms: number, period: ParsedPeriod, spec: SymbolSpec): Bucket {
  const anchor = clockMinutes(spec.market.open.time);
  const timeZone = spec.timezone;
  if (period.unit === "D") {
    const session = sessionOpenAtOrBefore(ms, timeZone, anchor);
    const sessionCivil = utcToCivil(session, timeZone);
    const index =
      civilDayNumber(sessionCivil.year, sessionCivil.month, sessionCivil.day) -
      DAY_ORIGIN;
    const startIndex = index - floorMod(index, period.span);
    const clock = minutesToClock(anchor);
    const openDate = addCivilDays(
      { year: 1970, month: 1, day: 4 },
      startIndex,
    );
    const closeDate = addCivilDays(openDate, period.span);
    return {
      open: civilToUtc(
        { ...openDate, hour: clock.hour, minute: clock.minute, second: 0 },
        timeZone,
      ),
      close: civilToUtc(
        { ...closeDate, hour: clock.hour, minute: clock.minute, second: 0 },
        timeZone,
      ),
    };
  }
  const start = sessionOpenAtOrBefore(ms, timeZone, anchor);
  const next = nextSessionOpen(start, timeZone, anchor);
  const duration = period.unit === "m" ? period.span * 60_000 : period.span * 3_600_000;
  const steps = Math.floor((ms - start) / duration);
  const open = start + steps * duration;
  return { open, close: Math.min(open + duration, next) };
}
