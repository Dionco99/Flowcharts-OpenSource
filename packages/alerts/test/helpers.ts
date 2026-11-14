// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { addMinutes, type Bar } from "../src/index.ts";

const START = "2024-06-03T13:00:00Z";

export function bars(
  rows: Array<{ close: string; high?: string; low?: string; open?: string; volume?: string }>,
  start = START,
): Bar[] {
  return rows.map((row, index) => {
    const close = row.close;
    return {
      openTime: addMinutes(start, index),
      closeTime: addMinutes(start, index + 1),
      open: row.open ?? close,
      high: row.high ?? close,
      low: row.low ?? close,
      close,
      volume: row.volume ?? "10",
    };
  });
}
