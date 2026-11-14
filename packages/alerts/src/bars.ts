// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { Decimal, cmpDecimal, isDecimal } from "./decimal.ts";
import { AlertsError } from "./errors.ts";
import { cmpTime, epochMs } from "./time.ts";

export interface Bar {
  openTime: string;
  closeTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface SymbolSpec {
  symbol: string;
  tickSize?: string;
  timezone?: string;
}

export interface Tape {
  format: "flowchart.tape";
  version: 1;
  spec: SymbolSpec;
  bars: Bar[];
}

const PRICE_SOURCES = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4", "volume"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export function isPriceSource(value: string): value is PriceSource {
  return (PRICE_SOURCES as readonly string[]).includes(value);
}

function decimalField(value: unknown, label: string): string {
  if (typeof value === "number") {
    throw new AlertsError("invalid_bar", `${label} must be a decimal string, not a JSON number`);
  }
  if (typeof value !== "string" || !isDecimal(value)) {
    throw new AlertsError("invalid_bar", `${label} must be a decimal string`);
  }
  return value;
}

export function assertBar(value: unknown, index: number): Bar {
  if (value === null || typeof value !== "object") {
    throw new AlertsError("invalid_bar", `bar ${index} is missing`);
  }
  const row = value as Record<string, unknown>;
  const openTime = row.openTime;
  const closeTime = row.closeTime;
  if (typeof openTime !== "string" || typeof closeTime !== "string") {
    throw new AlertsError("invalid_bar", `bar ${index} needs openTime and closeTime`);
  }
  if (!(epochMs(openTime) < epochMs(closeTime))) {
    throw new AlertsError("invalid_bar", `bar ${index} must close after it opens`);
  }
  const open = decimalField(row.open, `bar ${index} open`);
  const high = decimalField(row.high, `bar ${index} high`);
  const low = decimalField(row.low, `bar ${index} low`);
  const close = decimalField(row.close, `bar ${index} close`);
  const volume = decimalField(row.volume, `bar ${index} volume`);
  if (cmpDecimal(high, low) < 0 || cmpDecimal(high, open) < 0 || cmpDecimal(high, close) < 0) {
    throw new AlertsError("invalid_bar", `bar ${index} high is below another price`);
  }
  if (cmpDecimal(low, open) > 0 || cmpDecimal(low, close) > 0) {
    throw new AlertsError("invalid_bar", `bar ${index} low is above another price`);
  }
  if (cmpDecimal(volume, "0") < 0) {
    throw new AlertsError("invalid_bar", `bar ${index} volume is negative`);
  }
  return { openTime, closeTime, open, high, low, close, volume };
}

export function assertBars(bars: readonly unknown[]): Bar[] {
  const checked = bars.map((bar, index) => assertBar(bar, index));
  for (let i = 1; i < checked.length; i += 1) {
    if (cmpTime(checked[i].openTime, checked[i - 1].openTime) <= 0) {
      throw new AlertsError("invalid_bar", "bars must be oldest first, with unique open times");
    }
  }
  return checked;
}

/** Bars whose close is at or before the cursor. Later bars in the file stay out. */
export function closedBars(bars: readonly Bar[], cursor: string): Bar[] {
  const end = epochMs(cursor);
  const closed: Bar[] = [];
  for (const bar of bars) {
    if (epochMs(bar.closeTime) <= end) closed.push(bar);
  }
  return closed;
}

/**
 * A sealed window. Any bar that closes after the cursor is a leak.
 * The tape file may hold those bars; slice with `closedBars` first.
 */
export function sealBars(bars: readonly Bar[], cursor: string): Bar[] {
  const end = epochMs(cursor);
  for (const bar of bars) {
    if (epochMs(bar.closeTime) > end) {
      throw new AlertsError("window_leak", `bar ${bar.closeTime} closes after ${cursor}`);
    }
  }
  return bars.slice();
}

export function priceOf(bar: Bar, source: PriceSource): string {
  if (source === "hl2") return mean([bar.high, bar.low]);
  if (source === "hlc3") return mean([bar.high, bar.low, bar.close]);
  if (source === "ohlc4") return mean([bar.open, bar.high, bar.low, bar.close]);
  return bar[source];
}

function mean(values: string[]): string {
  let total = Decimal.parse(values[0]);
  for (let i = 1; i < values.length; i += 1) total = total.add(Decimal.parse(values[i]));
  return total.div(Decimal.int(BigInt(values.length)), 8).toString();
}
