// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceError } from "./errors.js";

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

export interface Civil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) {
    return cached;
  }
  try {
    const created = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, created);
    return created;
  } catch {
    throw new WorkspaceError("invalid_argument", `unknown timezone ${timeZone}`);
  }
}

export function parseUtc(value: string): number {
  if (typeof value !== "string" || !ISO.test(value)) {
    throw new WorkspaceError(
      "invalid_argument",
      "timestamp must be YYYY-MM-DDTHH:MM:SSZ",
    );
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new WorkspaceError("invalid_argument", "timestamp is not a real instant");
  }
  return ms;
}

export function formatUtc(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new WorkspaceError("invalid_argument", "timestamp is not finite");
  }
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`;
}

export function utcToCivil(ms: number, timeZone: string): Civil {
  const parts: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }
  let year = Number(parts.year);
  let month = Number(parts.month);
  let day = Number(parts.day);
  let hour = Number(parts.hour);
  if (hour === 24) {
    hour = 0;
    const next = fromDayNumber(civilDayNumber(year, month, day) + 1);
    year = next.year;
    month = next.month;
    day = next.day;
  }
  return {
    year,
    month,
    day,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function civilToUtc(civil: Civil, timeZone: string): number {
  const wanted = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  );
  let utc = wanted;
  for (let pass = 0; pass < 4; pass += 1) {
    const got = utcToCivil(utc, timeZone);
    const gotMs = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
      got.second,
    );
    const diff = wanted - gotMs;
    if (diff === 0) {
      return utc;
    }
    utc += diff;
  }
  return utc;
}

export function civilDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function fromDayNumber(dayNumber: number): Pick<Civil, "year" | "month" | "day"> {
  const date = new Date(dayNumber * 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function addCivilDays(
  date: Pick<Civil, "year" | "month" | "day">,
  days: number,
): Pick<Civil, "year" | "month" | "day"> {
  return fromDayNumber(civilDayNumber(date.year, date.month, date.day) + days);
}

export function weekdayIndex(dayNumber: number): number {
  return new Date(dayNumber * 86_400_000).getUTCDay();
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function clockMinutes(value: string): number {
  const match = CLOCK.exec(value);
  if (!match) {
    throw new WorkspaceError("invalid_argument", `clock time must be HH:MM, got ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToClock(minutes: number): { hour: number; minute: number } {
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}
