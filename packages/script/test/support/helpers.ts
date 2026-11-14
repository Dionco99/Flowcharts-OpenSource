// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../../src/index.ts"

export function barsFromCloses(closes: readonly number[]): Bar[] {
  return closes.map((close, index) => ({
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 100 + index,
    time: `2024-06-03T00:${String(index).padStart(2, "0")}:00Z`,
  }))
}

/** Caret marker used by completion tests. The marker is not part of the source. */
export function caret(source: string): { text: string; offset: number } {
  const offset = source.indexOf("|")
  if (offset < 0) throw new Error("missing caret")
  return { text: source.slice(0, offset) + source.slice(offset + 1), offset }
}
