// SPDX-License-Identifier: Apache-2.0

import { FlowchartError } from "./errors.js";

/** UTC timestamp `YYYY-MM-DDTHH:MM:SSZ`. These strings sort in time order. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export interface SessionClock {
  readonly id: string;
  readonly name: string;
  /** `HH:MM` in the symbol timezone. The close minute is outside the window. */
  readonly open: string;
  readonly close: string;
}

/**
 * The symbol fields an indicator is allowed to read.
 * `packages/bars` owns the tape. Prices stay decimal strings.
 */
export interface SymbolView {
  readonly symbol: string;
  readonly tickSize: string;
  readonly lotSize: number;
  readonly timezone: string;
  readonly sessions: readonly SessionClock[];
}

/** One bar whose close is at or before the cursor. Prices are decimal strings. */
export interface Bar {
  readonly openTime: string;
  readonly closeTime: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: number;
}

export interface Window {
  readonly spec: SymbolView;
  readonly timeframe: Timeframe;
  readonly cursor: string;
  readonly bars: readonly Bar[];
}

export function isTimestamp(value: string): boolean {
  return TIMESTAMP.test(value);
}

export function isDecimal(value: string): boolean {
  return DECIMAL.test(value);
}

/** Reject a window that contains a bar closing after the cursor. */
export function assertSealed(window: Window): void {
  if (!isTimestamp(window.cursor)) {
    throw new FlowchartError("invalid_argument", "Cursor must be a UTC timestamp.");
  }
  if (!TIMEFRAMES.includes(window.timeframe)) {
    throw new FlowchartError("invalid_argument", `Unknown timeframe ${String(window.timeframe)}.`);
  }
  for (const bar of window.bars) {
    assertBar(bar);
    if (bar.closeTime > window.cursor) {
      throw new FlowchartError("window_leak", "Window contains a bar that closes after the cursor.");
    }
  }
}

function assertBar(bar: Bar): void {
  if (!isTimestamp(bar.openTime) || !isTimestamp(bar.closeTime) || bar.closeTime <= bar.openTime) {
    throw new FlowchartError("invalid_argument", "Bar timestamps must be UTC and the close must follow the open.");
  }
  for (const price of [bar.open, bar.high, bar.low, bar.close]) {
    if (!isDecimal(price)) {
      throw new FlowchartError("invalid_argument", "Bar prices must be decimal strings.");
    }
  }
  if (!Number.isInteger(bar.volume) || bar.volume < 0) {
    throw new FlowchartError("invalid_argument", "Bar volume must be a non-negative integer.");
  }
}

export function assertSymbolView(spec: SymbolView): void {
  if (spec.symbol.trim() === "") {
    throw new FlowchartError("invalid_argument", "Symbol id is required.");
  }
  if (!isDecimal(spec.tickSize) || spec.tickSize.startsWith("-") || spec.tickSize === "0") {
    throw new FlowchartError("invalid_argument", "Tick size must be a positive decimal string.");
  }
  if (!Number.isFinite(spec.lotSize) || spec.lotSize <= 0) {
    throw new FlowchartError("invalid_argument", "Lot size must be a positive finite number.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: spec.timezone }).format(0);
  } catch {
    throw new FlowchartError("invalid_argument", `Unknown timezone ${spec.timezone}.`);
  }
  const seen = new Set<string>();
  for (const session of spec.sessions) {
    if (!/^[a-z][a-z0-9]*$/.test(session.id)) {
      throw new FlowchartError("invalid_argument", `Session id ${session.id} must be lowercase.`);
    }
    if (seen.has(session.id)) {
      throw new FlowchartError("invalid_argument", `Duplicate session id ${session.id}.`);
    }
    seen.add(session.id);
    if (!CLOCK.test(session.open) || !CLOCK.test(session.close) || session.open === session.close) {
      throw new FlowchartError("invalid_argument", `Session ${session.id} needs an open and a different close.`);
    }
  }
}
