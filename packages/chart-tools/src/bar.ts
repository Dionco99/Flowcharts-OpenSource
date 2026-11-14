// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

/** One OHLC bar. Times are milliseconds since the Unix epoch. */
export interface Bar {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Bars whose close is at or before the cursor. A later bar stays out of the window. */
export function closedBars(bars: readonly Bar[], cursor: number): Bar[] {
  if (!Number.isFinite(cursor)) {
    throw new Error("cursor must be a finite timestamp");
  }
  return bars.filter((bar) => bar.closeTime <= cursor);
}
