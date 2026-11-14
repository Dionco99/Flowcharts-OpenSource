// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.js";

/** Solid, hollow, and bar styles for one symbol. Names match the chart library. */
export type CandleStyle = "solid" | "hollow" | "bar";

export const CANDLE_LIBRARY_TYPE = {
  solid: "candle_solid",
  hollow: "candle_stroke",
  bar: "ohlc",
} as const;

export interface CandleView {
  style: CandleStyle;
  libraryType: (typeof CANDLE_LIBRARY_TYPE)[CandleStyle];
  bars: Bar[];
}

const STYLES = new Set<CandleStyle>(["solid", "hollow", "bar"]);

/** Copy the bars and attach a candle style. The OHLC values stay the same. */
export function candleView(bars: readonly Bar[], style: CandleStyle): CandleView {
  if (!STYLES.has(style)) {
    throw new Error(`unknown candle style: ${String(style)}`);
  }
  return {
    style,
    libraryType: CANDLE_LIBRARY_TYPE[style],
    bars: bars.map((bar) => ({ ...bar })),
  };
}
