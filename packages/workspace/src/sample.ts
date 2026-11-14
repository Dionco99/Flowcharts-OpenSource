// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { fromScaled, pricePrecision, toScaled } from "./decimal.js";
import { WEEKDAYS, type MinuteBar, type SymbolSpec } from "./types.js";
import {
  addCivilDays,
  civilDayNumber,
  civilToUtc,
  clockMinutes,
  formatUtc,
  minutesToClock,
  parseUtc,
  utcToCivil,
  weekdayIndex,
} from "./time.js";

export function sampleSpec(): SymbolSpec {
  return {
    symbol: "EURUSD",
    tickSize: "0.00001",
    lotSize: "100000",
    timezone: "America/New_York",
    sessions: {
      asia: { open: "17:00", close: "03:00" },
      london: { open: "03:00", close: "12:00" },
      newyork: { open: "08:00", close: "17:00" },
    },
    market: {
      open: { weekday: "Sun", time: "17:00" },
      close: { weekday: "Fri", time: "17:00" },
    },
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function latestWeekMark(ms: number, spec: SymbolSpec, which: "open" | "close"): number {
  const marker = spec.market[which];
  const want = WEEKDAYS.indexOf(marker.weekday);
  const anchor = clockMinutes(marker.time);
  const clock = minutesToClock(anchor);
  let date = utcToCivil(ms, spec.timezone);
  for (let step = 0; step < 8; step += 1) {
    const dayNumber = civilDayNumber(date.year, date.month, date.day);
    if (weekdayIndex(dayNumber) === want) {
      const instant = civilToUtc(
        { ...date, hour: clock.hour, minute: clock.minute, second: 0 },
        spec.timezone,
      );
      if (instant <= ms) {
        return instant;
      }
    }
    const previous = addCivilDays(date, -1);
    date = { ...date, ...previous };
  }
  return ms;
}

function nextWeekClose(weekOpen: number, spec: SymbolSpec): number {
  const marker = spec.market.close;
  const want = WEEKDAYS.indexOf(marker.weekday);
  const clock = minutesToClock(clockMinutes(marker.time));
  let date = utcToCivil(weekOpen, spec.timezone);
  for (let step = 0; step < 8; step += 1) {
    const dayNumber = civilDayNumber(date.year, date.month, date.day);
    const instant = civilToUtc(
      { year: date.year, month: date.month, day: date.day, hour: clock.hour, minute: clock.minute, second: 0 },
      spec.timezone,
    );
    if (weekdayIndex(dayNumber) === want && instant > weekOpen) {
      return instant;
    }
    const next = addCivilDays(date, 1);
    date = { ...date, ...next, hour: 0, minute: 0, second: 0 };
  }
  return weekOpen;
}

export function marketIsOpen(openMs: number, spec: SymbolSpec): boolean {
  const weekOpen = latestWeekMark(openMs, spec, "open");
  const weekClose = nextWeekClose(weekOpen, spec);
  return openMs >= weekOpen && openMs < weekClose;
}

export function generateMinutes(
  spec: SymbolSpec,
  startOpen: string,
  endOpen: string,
  seed: number,
): MinuteBar[] {
  const random = mulberry32(seed);
  const scale = pricePrecision(spec.tickSize);
  const tick = toScaled(spec.tickSize, scale);
  let price = toScaled("1.08500", scale);
  const start = parseUtc(startOpen);
  const end = parseUtc(endOpen);
  const bars: MinuteBar[] = [];
  for (let open = start; open < end; open += 60_000) {
    if (!marketIsOpen(open, spec)) {
      continue;
    }
    const drift = BigInt(Math.floor(random() * 9) - 4) * tick;
    const next = price + drift;
    const wick = BigInt(Math.floor(random() * 4)) * tick;
    const high = (next > price ? next : price) + wick;
    const low = (next < price ? next : price) - wick;
    const volume = String(1 + Math.floor(random() * 20));
    bars.push({
      openTime: formatUtc(open),
      closeTime: formatUtc(open + 60_000),
      open: fromScaled(price, scale),
      high: fromScaled(high, scale),
      low: fromScaled(low, scale),
      close: fromScaled(next, scale),
      volume,
    });
    price = next;
  }
  return bars;
}
