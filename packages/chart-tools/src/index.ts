// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export { createDesk } from "./chart/desk";
export type { Desk, DeskHandlers, StudySelection } from "./chart/desk";
export type { Drawing, DrawingKind } from "./drawings";
export { loadStudies } from "./studies/load";
export type { IndicatorPackage } from "./study";

export { closedBars, type Bar } from "./bar.js";
export { candleView, CANDLE_LIBRARY_TYPE, type CandleStyle, type CandleView } from "./chart-types/candles.js";
export {
  areaSeries,
  baselineSeries,
  columnSeries,
  highLowSeries,
  lineSeries,
  stepSeries,
  type BaselinePoint,
  type ColumnPoint,
  type HighLowPoint,
  type LinePoint,
} from "./chart-types/series.js";
export { heikinAshi } from "./chart-types/heikin-ashi.js";
export {
  kagi,
  lineBreak,
  pointAndFigure,
  rangeBars,
  renko,
  type FigureColumn,
  type KagiPoint,
  type LineBreakBar,
  type RangeBar,
  type RangeBarResult,
} from "./chart-types/bricks.js";
export { PRICE_SCALE_AXIS, scalePrice, type PriceScale, type PriceScaleAxis } from "./chart-types/scales.js";
export {
  barCovering,
  countdownToClose,
  crosshair,
  lastPrice,
  type CrosshairReadout,
} from "./chart-types/readout.js";
export {
  horizontalPrice,
  lineCoversTime,
  linePrice,
  verticalCoverage,
  verticalCoversPrice,
  type Anchor,
  type HorizontalKind,
  type LineKind,
  type VerticalCoverage,
  type VerticalKind,
} from "./figures/lines.js";
export {
  EXTENSION_RATIOS,
  FAN_RATIOS,
  RETRACEMENT_RATIOS,
  fibonacciExtension,
  fibonacciFan,
  fibonacciRetracement,
  fibonacciTimeZones,
  fibonacciZoneOffsets,
  type RatioPrice,
} from "./figures/fibonacci.js";
export {
  parallelChannel,
  pitchfork,
  type ParallelChannel,
  type Pitchfork,
  type PitchforkKind,
  type PriceAt,
} from "./figures/channels.js";
export { brushHits, inEllipse, inRectangle, inTriangle } from "./figures/shapes.js";
export { chartLabel, type ChartLabel, type LabelKind } from "./figures/labels.js";
export { positionPlan, type PositionPlan } from "./figures/position.js";
export {
  applyAnchorEdit,
  drawingsAfterSeek,
  setLock,
  setMagnet,
  snapPrice,
  type EditableDrawing,
  type MagnetMode,
} from "./figures/edits.js";
export { sessionLevels, sessionStart, type SessionLevelPlots } from "./studies/session.js";
export { runStudy, type Plot, type StudyId, type StudyParams, type StudyResult } from "./studies/studies.js";
