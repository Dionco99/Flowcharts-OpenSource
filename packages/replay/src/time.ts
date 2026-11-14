// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { ReplayError } from "./errors";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function assertTimeZone(timeZone: string): string {
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw new ReplayError("bad_timezone", "Timezone must be an IANA name.");
  }
  try {
    formatter(timeZone);
  } catch {
    throw new ReplayError("bad_timezone", "Timezone must be an IANA name.");
  }
  return timeZone;
}

export function zonedParts(ms: number, timeZone: string): CalendarDate & { hour: number; minute: number; weekday: Weekday } {
  const parts = formatter(timeZone).formatToParts(new Date(ms));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(pick("hour"));
  if (hour === 24) hour = 0;
  const weekday = pick("weekday") as Weekday;
  return {
    year: Number(pick("year")),
    month: Number(pick("month")),
    day: Number(pick("day")),
    hour,
    minute: Number(pick("minute")),
    weekday,
  };
}

/** UTC milliseconds for a wall-clock time in `timeZone`. The local time must exist. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const shown = zonedParts(utc, timeZone);
    const shownUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, 0, 0);
    const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const delta = target - shownUtc;
    if (delta === 0) return utc;
    utc += delta;
  }
  return utc;
}

export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function weekdayOf(date: CalendarDate): Weekday {
  return WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] ?? "Sun";
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timeZone, created);
  return created;
}
