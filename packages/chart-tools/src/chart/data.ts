// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import type { KLineData } from "klinecharts";
import type { Bar } from "../bar.ts";

export function toKLineData(bars: readonly Bar[]): KLineData[] {
  return bars.map((bar) => ({
    timestamp: bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}

export function fromKLineData(rows: readonly KLineData[]): Bar[] {
  return rows.map((row) => ({
    time: row.timestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume ?? 0,
  }));
}
