// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { addDecimal, compareDecimal, maxDecimal, minDecimal } from "./decimal.js";
import { WorkspaceError } from "./errors.js";
import { bucketOf, parsePeriod, type ParsedPeriod } from "./period.js";
import { formatUtc, parseUtc } from "./time.js";
import type { Bar, MinuteBar, SymbolSpec } from "./types.js";

export interface AggregateResult {
  bars: Bar[];
  forming: Bar | null;
}

function reduceBucket(minutes: MinuteBar[], open: number, close: number): Bar {
  const first = minutes[0];
  const last = minutes[minutes.length - 1];
  if (!first || !last) {
    throw new WorkspaceError("invalid_bar", "bucket has no minutes");
  }
  let high = first.high;
  let low = first.low;
  let volume = "0";
  for (const minute of minutes) {
    high = maxDecimal(high, minute.high);
    low = minDecimal(low, minute.low);
    volume = addDecimal(volume, minute.volume);
  }
  return {
    openTime: formatUtc(open),
    closeTime: formatUtc(close),
    open: first.open,
    high,
    low,
    close: last.close,
    volume,
  };
}

/**
 * Build higher-timeframe bars from 1-minute bars.
 * A bucket stays out of `bars` until `cursor` reaches its close. Minutes already
 * in the file stay in `forming` until then. A missing minute does not hold the
 * bucket open past its close.
 */
export function aggregateMinutes(
  minutes: MinuteBar[],
  period: ParsedPeriod | string,
  cursor: string,
  spec: SymbolSpec,
): AggregateResult {
  const parsed = typeof period === "string" ? parsePeriod(period) : period;
  const cursorMs = parseUtc(cursor);
  const closed = new Map<number, { close: number; minutes: MinuteBar[] }>();
  const formingMinutes: MinuteBar[] = [];
  let formingBucket: { open: number; close: number } | null = null;

  for (const minute of minutes) {
    const openMs = parseUtc(minute.openTime);
    const closeMs = parseUtc(minute.closeTime);
    if (closeMs > cursorMs) {
      continue;
    }
    const bucket = bucketOf(openMs, parsed, spec);
    if (bucket.close <= cursorMs) {
      const group = closed.get(bucket.open) ?? { close: bucket.close, minutes: [] };
      group.minutes.push(minute);
      closed.set(bucket.open, group);
      continue;
    }
    if (!formingBucket) {
      formingBucket = bucket;
    }
    if (bucket.open === formingBucket.open) {
      formingMinutes.push(minute);
    }
  }

  const bars = [...closed.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([open, group]) => reduceBucket(group.minutes, open, group.close));

  let forming: Bar | null = null;
  if (formingBucket && formingMinutes.length > 0) {
    const built = reduceBucket(formingMinutes, formingBucket.open, formingBucket.close);
    if (parseUtc(built.closeTime) <= cursorMs) {
      throw new WorkspaceError("window_leak", "forming bar is already closed");
    }
    forming = built;
  }

  for (const bar of bars) {
    if (parseUtc(bar.closeTime) > cursorMs) {
      throw new WorkspaceError("window_leak", "closed bar ends after the cursor");
    }
    if (compareDecimal(bar.high, bar.low) < 0) {
      throw new WorkspaceError("invalid_bar", "high is below low");
    }
  }
  return { bars, forming };
}
