// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.js";

/**
 * Synthetic candles. The first open averages that bar's open and close.
 * Later opens average the previous synthetic open and close.
 */
export function heikinAshi(bars: readonly Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    const previous = out[i - 1];
    const open = previous === undefined ? (bar.open + bar.close) / 2 : (previous.open + previous.close) / 2;
    out.push({
      openTime: bar.openTime,
      closeTime: bar.closeTime,
      open,
      high: Math.max(bar.high, open, close),
      low: Math.min(bar.low, open, close),
      close,
      volume: bar.volume,
    });
  }
  return out;
}
