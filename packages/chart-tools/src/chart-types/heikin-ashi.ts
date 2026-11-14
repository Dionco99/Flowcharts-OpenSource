// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.ts";

export interface HeikinAshiBar extends Bar {
  sourceIndex: number;
}

/** Heikin-Ashi bars. The first open is the average of that bar's open and close. */
export function heikinAshi(bars: readonly Bar[]): HeikinAshiBar[] {
  const out: HeikinAshiBar[] = [];
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    const previous = out[index - 1];
    const open = previous ? (previous.open + previous.close) / 2 : (bar.open + bar.close) / 2;
    out.push({
      time: bar.time,
      open,
      close,
      high: Math.max(bar.high, open, close),
      low: Math.min(bar.low, open, close),
      volume: bar.volume,
      sourceIndex: index,
    });
  }
  return out;
}
