// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { compareDecimal } from "./decimal.js";
import { WorkspaceError } from "./errors.js";
import { aggregateMinutes } from "./aggregate.js";
import { parsePeriod } from "./period.js";
import { parseUtc } from "./time.js";
import type { MinuteBar, SealedWindow, SymbolSpec, Tape } from "./types.js";
import { WEEKDAYS } from "./types.js";

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const VOLUME = /^(?:0|[1-9]\d*)$/;

function assertClock(value: string, label: string): void {
  if (!CLOCK.test(value)) {
    throw new WorkspaceError("invalid_argument", `${label} must be HH:MM`);
  }
}

export function assertSpec(spec: SymbolSpec): void {
  if (!spec || typeof spec.symbol !== "string" || spec.symbol.length === 0) {
    throw new WorkspaceError("invalid_argument", "symbol is required");
  }
  if (typeof spec.timezone !== "string" || spec.timezone.length === 0) {
    throw new WorkspaceError("invalid_argument", "timezone is required");
  }
  assertClock(spec.market?.open?.time ?? "", "market open");
  assertClock(spec.market?.close?.time ?? "", "market close");
  if (!WEEKDAYS.includes(spec.market.open.weekday) || !WEEKDAYS.includes(spec.market.close.weekday)) {
    throw new WorkspaceError("invalid_argument", "market weekday is invalid");
  }
  if (!spec.sessions || typeof spec.sessions !== "object") {
    throw new WorkspaceError("invalid_argument", "sessions are required");
  }
  for (const [name, session] of Object.entries(spec.sessions)) {
    assertClock(session.open, `${name} open`);
    assertClock(session.close, `${name} close`);
  }
}

export function assertMinutes(minutes: MinuteBar[]): void {
  let previous = -1;
  for (const bar of minutes) {
    const open = parseUtc(bar.openTime);
    const close = parseUtc(bar.closeTime);
    if (close !== open + 60_000) {
      throw new WorkspaceError("invalid_bar", "a minute must close one minute after it opens");
    }
    if (open <= previous) {
      throw new WorkspaceError("invalid_bar", "minutes must be oldest first and unique");
    }
    previous = open;
    if (!VOLUME.test(bar.volume)) {
      throw new WorkspaceError("invalid_bar", "volume must be a whole number string");
    }
    for (const field of ["open", "high", "low", "close"] as const) {
      if (typeof bar[field] !== "string") {
        throw new WorkspaceError("invalid_bar", `${field} must be a decimal string`);
      }
    }
    if (
      compareDecimal(bar.low, bar.open) > 0 ||
      compareDecimal(bar.low, bar.close) > 0 ||
      compareDecimal(bar.high, bar.open) < 0 ||
      compareDecimal(bar.high, bar.close) < 0 ||
      compareDecimal(bar.high, bar.low) < 0
    ) {
      throw new WorkspaceError("invalid_bar", "high and low must cover the open and close");
    }
  }
}

export function assertSealed(window: SealedWindow): void {
  const cursor = parseUtc(window.cursor);
  for (const bar of window.bars) {
    if (parseUtc(bar.closeTime) > cursor) {
      throw new WorkspaceError("window_leak", "a bar closes after the cursor");
    }
  }
  if (window.forming && parseUtc(window.forming.closeTime) <= cursor) {
    throw new WorkspaceError("window_leak", "forming bar is already closed");
  }
}

export function windowAt(tape: Tape, cursor: string, period: string): SealedWindow {
  assertSpec(tape.spec);
  assertMinutes(tape.bars);
  parsePeriod(period);
  parseUtc(cursor);
  const aggregated = aggregateMinutes(tape.bars, period, cursor, tape.spec);
  const sealed: SealedWindow = {
    spec: tape.spec,
    period,
    cursor,
    bars: aggregated.bars,
    forming: aggregated.forming,
  };
  assertSealed(sealed);
  return sealed;
}
