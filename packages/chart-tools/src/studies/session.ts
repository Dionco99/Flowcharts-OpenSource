// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface SessionLevelPlots {
  sessionHigh: number[];
  sessionLow: number[];
  previousHigh: (number | null)[];
  previousLow: (number | null)[];
}

/**
 * Session start in epoch milliseconds.
 * `openMinute` is the minute of the session clock when the session opens.
 * `offsetMinutes` is minutes east of UTC. The clock is a fixed offset.
 */
export function sessionStart(time: number, openMinute: number, offsetMinutes: number): number {
  if (!Number.isInteger(openMinute) || openMinute < 0 || openMinute >= 24 * 60) {
    throw new Error("openMinute must be a whole minute from 0 through 1439");
  }
  if (!Number.isFinite(time) || !Number.isFinite(offsetMinutes)) {
    throw new Error("time and offsetMinutes must be finite");
  }
  const local = time + offsetMinutes * MINUTE;
  const midnight = Math.floor(local / DAY) * DAY;
  const minuteOfDay = Math.floor((local - midnight) / MINUTE);
  const localStart =
    minuteOfDay < openMinute ? midnight - DAY + openMinute * MINUTE : midnight + openMinute * MINUTE;
  return localStart - offsetMinutes * MINUTE;
}

/**
 * Running session high and low, and the previous observed session's high and low.
 * A bar belongs to the session that contains its open time.
 */
export function sessionLevels(
  bars: readonly Bar[],
  openMinute: number,
  offsetMinutes: number,
): SessionLevelPlots {
  const sessionHigh: number[] = [];
  const sessionLow: number[] = [];
  const previousHigh: (number | null)[] = [];
  const previousLow: (number | null)[] = [];
  let current: number | null = null;
  let high = 0;
  let low = 0;
  let priorHigh: number | null = null;
  let priorLow: number | null = null;

  for (const bar of bars) {
    const start = sessionStart(bar.openTime, openMinute, offsetMinutes);
    if (current === null || start !== current) {
      if (current !== null) {
        priorHigh = high;
        priorLow = low;
      }
      current = start;
      high = bar.high;
      low = bar.low;
    } else {
      high = Math.max(high, bar.high);
      low = Math.min(low, bar.low);
    }
    sessionHigh.push(high);
    sessionLow.push(low);
    previousHigh.push(priorHigh);
    previousLow.push(priorLow);
  }

  return { sessionHigh, sessionLow, previousHigh, previousLow };
}
