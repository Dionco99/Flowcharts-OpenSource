// SPDX-License-Identifier: Apache-2.0

import type { Timeframe } from "./types";

export const MINUTE = 60_000;

export const TF_MS: Record<Timeframe, number> = {
  "1m": MINUTE,
  "5m": 5 * MINUTE,
  "15m": 15 * MINUTE,
  "1h": 60 * MINUTE,
  "4h": 4 * 60 * MINUTE,
};

export const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h"];

export function periodOf(tf: Timeframe): { type: "minute" | "hour"; span: number } {
  if (tf === "1h") return { type: "hour", span: 1 };
  if (tf === "4h") return { type: "hour", span: 4 };
  return { type: "minute", span: TF_MS[tf] / MINUTE };
}

export function utcMinuteOfDay(t: number): number {
  const date = new Date(t);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/** Start of the FX day that contains t, using the spec's UTC roll. */
export function fxDayStart(t: number, rollMinute: number): number {
  const date = new Date(t);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const roll = midnight + rollMinute * MINUTE;
  return t >= roll ? roll : roll - 86_400_000;
}
