// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { AlertDraft } from "./log.ts";
import type { ScreenFilter } from "./screener.ts";
import { generateTape } from "./fixture.ts";
import type { Tape } from "./bars.ts";
import type { SymbolInfo } from "./watchlist.ts";

export interface DemoScenario {
  eurusd: Tape;
  gbpusd: Tape;
  alerts: AlertDraft[];
  filters: ScreenFilter[];
  catalog: SymbolInfo[];
}

/** Two generated symbols and the rules the desk page arms. No market-data file. */
export function demoScenario(): DemoScenario {
  const eurusd = generateTape({
    symbol: "EURUSD",
    seed: 20240602,
    count: 40,
    start: "2024-06-03T13:00:00Z",
    startPrice: "1.10000",
    tickSize: "0.00001",
    driftTicks: 4,
    noiseTicks: 0,
    baseVolume: "100",
    lastVolume: "500",
  });
  const gbpusd = generateTape({
    symbol: "GBPUSD",
    seed: 20240603,
    count: 40,
    start: "2024-06-03T13:00:00Z",
    startPrice: "1.27000",
    tickSize: "0.00001",
    driftTicks: -4,
    noiseTicks: 0,
    baseVolume: "80",
  });
  const crossLevel = eurusd.bars[10].close;
  const touch = eurusd.bars[20].high;
  const delivery = {
    webhook: { url: "https://example.com/flowchart/alerts" },
    email: { to: "desk@example.com" },
    push: { token: "demo-device" },
  };
  const armedAt = eurusd.bars[0].openTime;
  return {
    eurusd,
    gbpusd,
    alerts: [
      {
        id: "alert-price",
        symbol: "EURUSD",
        name: "Price cross",
        armedAt,
        delivery,
        rule: {
          type: "cross",
          left: { kind: "price", source: "close" },
          right: { kind: "level", value: crossLevel },
          direction: "up",
        },
      },
      {
        id: "alert-indicator",
        symbol: "EURUSD",
        name: "RSI above 70",
        armedAt,
        delivery,
        rule: {
          type: "compare",
          left: { kind: "indicator", name: "rsi", params: { length: 14 } },
          op: "gt",
          right: { kind: "level", value: "70" },
        },
      },
      {
        id: "alert-drawing",
        symbol: "EURUSD",
        name: "Level touch",
        armedAt,
        delivery,
        rule: { type: "drawing", drawing: { kind: "horizontal", price: touch } },
      },
    ],
    filters: [
      { type: "percent-change", lookback: 10, direction: "up", min: "0.03" },
      { type: "volume-versus-average", length: 5, min: "2" },
    ],
    catalog: [
      { symbol: "EURUSD", name: "Euro / US Dollar", venue: "FX" },
      { symbol: "GBPUSD", name: "Pound / US Dollar", venue: "FX" },
      { symbol: "USDJPY", name: "US Dollar / Yen", venue: "FX" },
    ],
  };
}
