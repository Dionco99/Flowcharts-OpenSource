// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface ClockWindow {
  open: string;
  close: string;
}

export interface SymbolSpec {
  symbol: string;
  tickSize: string;
  lotSize: string;
  timezone: string;
  sessions: Record<string, ClockWindow>;
  market: {
    open: { weekday: Weekday; time: string };
    close: { weekday: Weekday; time: string };
  };
}

export interface MinuteBar {
  openTime: string;
  closeTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface Bar extends MinuteBar {}

export interface Tape {
  spec: SymbolSpec;
  bars: MinuteBar[];
}

export type SettingValue = string | number | boolean;

export type SettingField =
  | {
      key: string;
      label: string;
      type: "number" | "integer";
      default: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      key: string;
      label: string;
      type: "boolean";
      default: boolean;
    }
  | {
      key: string;
      label: string;
      type: "string";
      default: string;
    }
  | {
      key: string;
      label: string;
      type: "select";
      default: string;
      options: { value: string; label: string }[];
    }
  | {
      key: string;
      label: string;
      type: "color";
      default: string;
    };

export interface PlotStyle {
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
}

export interface PlotSpec {
  key: string;
  title: string;
  style: PlotStyle;
}

export interface IndicatorHook {
  id: string;
  name: string;
  overlay: boolean;
  settings: SettingField[];
  plots: PlotSpec[];
  calculate(input: {
    bars: Bar[];
    settings: Record<string, SettingValue>;
  }): { plots: Record<string, Array<number | null>> };
}

export interface BacktestTrade {
  time: string;
  side: "buy" | "sell";
  price: string;
  lots: string;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  summary: {
    tradeCount: number;
    net: string;
  };
}

export interface StrategyHook {
  id: string;
  name: string;
  settings: SettingField[];
  styles: { key: string; title: string; style: PlotStyle }[];
  backtest(input: {
    bars: Bar[];
    spec: SymbolSpec;
    settings: Record<string, SettingValue>;
  }): BacktestResult;
}

export const CANDLE_TYPES = [
  "candle_solid",
  "candle_stroke",
  "candle_up_stroke",
  "candle_down_stroke",
  "ohlc",
  "area",
] as const;
export type CandleType = (typeof CANDLE_TYPES)[number];

export const PRICE_SCALES = ["normal", "logarithm", "percentage"] as const;
export type PriceScale = (typeof PRICE_SCALES)[number];

export const TREE_KINDS = ["pane", "group", "study", "drawing", "strategy"] as const;
export type TreeKind = (typeof TREE_KINDS)[number];

export interface TreeNode {
  id: string;
  kind: TreeKind;
  name: string;
  visible: boolean;
  locked: boolean;
  parentId: string | null;
  index: number;
}

export interface StudyInstance {
  id: string;
  hookId: string;
  settings: Record<string, SettingValue>;
  styles: Record<string, PlotStyle>;
}

export interface Pane {
  id: string;
  studies: StudyInstance[];
}

export interface DrawingAnchor {
  time: string;
  price: string;
}

export interface Drawing {
  id: string;
  paneId: string;
  tool: "horizontal" | "segment";
  anchors: DrawingAnchor[];
}

export interface StrategyInstance {
  id: string;
  hookId: string;
  settings: Record<string, SettingValue>;
  styles: Record<string, PlotStyle>;
}

export interface Layout {
  format: "flowchart.layout";
  version: 1;
  name: string;
  symbol: string;
  candleType: CandleType;
  period: string;
  priceScale: PriceScale;
  timezone: string;
  crosshairSync: boolean;
  panes: Pane[];
  drawings: Drawing[];
  strategies: StrategyInstance[];
  tree: TreeNode[];
}

export interface CursorRecord {
  paneId: string;
  time: string | null;
}

export interface SealedWindow {
  spec: SymbolSpec;
  period: string;
  cursor: string;
  bars: Bar[];
  forming: Bar | null;
}
