// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { addDecimal, divDecimal, mulDecimal, scaleOf, subDecimal, toScaled } from "./decimal.js";
import { validateLayout } from "./layout.js";
import type {
  BacktestResult,
  IndicatorHook,
  Layout,
  StrategyHook,
} from "./types.js";

export function starterLayout(levelPrice = "1.08500", levelTime = "2024-06-03T21:00:00Z"): Layout {
  const smaStyle = smaIndicator.plots[0]?.style ?? {
    color: "#4C8DFF",
    lineWidth: 2,
    lineStyle: "solid" as const,
  };
  const buy = crossStrategy.styles[0]?.style ?? smaStyle;
  const sell = crossStrategy.styles[1]?.style ?? smaStyle;
  return validateLayout({
    format: "flowchart.layout",
    version: 1,
    name: "Desk",
    symbol: "EURUSD",
    candleType: "candle_solid",
    period: "2h",
    priceScale: "normal",
    timezone: "America/New_York",
    crosshairSync: true,
    panes: [
      {
        id: "price",
        studies: [
          {
            id: "sma",
            hookId: smaIndicator.id,
            settings: { period: 5 },
            styles: { sma: smaStyle },
          },
        ],
      },
      { id: "extra", studies: [] },
    ],
    drawings: [
      {
        id: "level",
        paneId: "price",
        tool: "horizontal",
        anchors: [{ time: levelTime, price: levelPrice }],
      },
    ],
    strategies: [
      {
        id: "cross",
        hookId: crossStrategy.id,
        settings: { period: 5, lots: 1 },
        styles: { buy, sell },
      },
    ],
    tree: [
      { id: "price", kind: "pane", name: "Price", visible: true, locked: false, parentId: null, index: 0 },
      { id: "extra", kind: "pane", name: "Extra", visible: true, locked: false, parentId: null, index: 1 },
      { id: "cross", kind: "strategy", name: "SMA cross", visible: true, locked: false, parentId: null, index: 2 },
      { id: "sma", kind: "study", name: "SMA", visible: true, locked: false, parentId: "price", index: 0 },
      { id: "level", kind: "drawing", name: "Level", visible: true, locked: false, parentId: "price", index: 1 },
    ],
  });
}

export const smaIndicator: IndicatorHook = {
  id: "flowchart.workspace.sma",
  name: "SMA",
  overlay: true,
  settings: [
    { key: "period", label: "Length", type: "integer", default: 20, min: 1, max: 500 },
  ],
  plots: [
    {
      key: "sma",
      title: "SMA",
      style: { color: "#4C8DFF", lineWidth: 2, lineStyle: "solid" },
    },
  ],
  calculate({ bars, settings }) {
    const period = settings.period;
    if (typeof period !== "number") {
      return { plots: { sma: bars.map(() => null) } };
    }
    const sma: Array<number | null> = [];
    for (let index = 0; index < bars.length; index += 1) {
      if (index + 1 < period) {
        sma.push(null);
        continue;
      }
      let sum = "0";
      for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
        sum = addDecimal(sum, bars[cursor]?.close ?? "0");
      }
      sma.push(Number(divDecimal(sum, period)));
    }
    return { plots: { sma } };
  },
};

export const crossStrategy: StrategyHook = {
  id: "flowchart.workspace.cross",
  name: "SMA cross",
  settings: [
    { key: "period", label: "Length", type: "integer", default: 5, min: 1, max: 500 },
    { key: "lots", label: "Lots", type: "integer", default: 1, min: 1, max: 100 },
  ],
  styles: [
    {
      key: "buy",
      title: "Buy",
      style: { color: "#3DDC97", lineWidth: 1, lineStyle: "solid" },
    },
    {
      key: "sell",
      title: "Sell",
      style: { color: "#FF5C7A", lineWidth: 1, lineStyle: "solid" },
    },
  ],
  backtest({ bars, spec, settings }): BacktestResult {
    const period = settings.period;
    const lots = settings.lots;
    const trades: BacktestResult["trades"] = [];
    if (typeof period !== "number" || typeof lots !== "number" || bars.length === 0) {
      return { trades, summary: { tradeCount: 0, net: "0" } };
    }
    const scale = bars[0] ? scaleOf(bars[0].close) : 0;
    let sum = 0n;
    let entry: string | null = null;
    let net = "0";
    const lotText = String(lots);
    for (let index = 0; index < bars.length; index += 1) {
      const close = bars[index]?.close ?? "0";
      sum += toScaled(close, scale);
      if (index >= period) {
        sum -= toScaled(bars[index - period]?.close ?? "0", scale);
      }
      if (index + 1 < period) {
        continue;
      }
      const above = toScaled(close, scale) * BigInt(period) > sum;
      if (entry === null && above) {
        trades.push({ time: bars[index]?.closeTime ?? "", side: "buy", price: close, lots: lotText });
        entry = close;
      } else if (entry !== null && !above) {
        trades.push({ time: bars[index]?.closeTime ?? "", side: "sell", price: close, lots: lotText });
        const gained = mulDecimal(mulDecimal(subDecimal(close, entry), lotText), spec.lotSize);
        net = addDecimal(net, gained);
        entry = null;
      }
    }
    return { trades, summary: { tradeCount: trades.length, net } };
  },
};
