// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export { aggregateMinutes } from "./aggregate.js";
export { compareDecimal, pricePrecision } from "./decimal.js";
export { WorkspaceError } from "./errors.js";
export {
  HookRegistry,
  readSettings,
  runBacktest,
  runIndicator,
} from "./hooks.js";
export {
  CANDLE_PANE,
  registerWorkspaceIndicators,
  showCrosshair,
  syncChart,
  toKLineData,
  toKLinePeriod,
} from "./kline.js";
export { cloneLayout, parseLayout, stringifyLayout, validateLayout } from "./layout.js";
export { bucketOf, parsePeriod } from "./period.js";
export { crossStrategy, smaIndicator, starterLayout } from "./reference.js";
export { generateMinutes, marketIsOpen, sampleSpec } from "./sample.js";
export { syncCursors } from "./sync.js";
export { LayoutBook, browserStore, memoryStore } from "./templates.js";
export { formatUtc, parseUtc } from "./time.js";
export {
  deleteNode,
  effectiveLocked,
  effectiveVisible,
  findNode,
  groupNodes,
  renameNode,
  reorderNode,
  replaceStudySettings,
  replaceStudyStyles,
  replaceStrategySettings,
  setCandleType,
  setCrosshairSync,
  setLayoutName,
  setLocked,
  setPeriod,
  setPriceScale,
  setVisible,
  treeRows,
} from "./tree.js";
export type {
  BacktestResult,
  BacktestTrade,
  Bar,
  CandleType,
  CursorRecord,
  Drawing,
  IndicatorHook,
  Layout,
  MinuteBar,
  PlotStyle,
  PriceScale,
  SealedWindow,
  SettingField,
  SettingValue,
  StrategyHook,
  SymbolSpec,
  Tape,
  TreeKind,
  TreeNode,
} from "./types.js";
export { buildView, chartSeries, markersFor } from "./view.js";
export type { DeskView, PaneView } from "./view.js";
export { assertSealed, windowAt } from "./window.js";
