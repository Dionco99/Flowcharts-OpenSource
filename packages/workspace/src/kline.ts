// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type {
  Chart,
  IndicatorTemplate,
  KLineData,
  Period,
} from "klinecharts";
import { pricePrecision } from "./decimal.js";
import { parsePeriod, type ParsedPeriod } from "./period.js";
import { parseUtc } from "./time.js";
import type { Bar, IndicatorHook, PlotStyle } from "./types.js";
import { chartSeries, markersFor, type DeskView, type DrawingView, type PaneView, type StudyView } from "./view.js";

export const CANDLE_PANE = "candle_pane";

export interface IndicatorExtend {
  sealed: number;
  plots: Record<string, Array<number | null>>;
  paramsText: string;
}

export function toKLineData(bars: Bar[]): KLineData[] {
  return bars.map((bar) => ({
    timestamp: parseUtc(bar.openTime),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume),
  }));
}

export function toKLinePeriod(period: ParsedPeriod): Period {
  if (period.unit === "m") {
    return { type: "minute", span: period.span };
  }
  if (period.unit === "h") {
    return { type: "hour", span: period.span };
  }
  return { type: "day", span: period.span };
}

function lineStyle(style: PlotStyle | undefined): {
  color: string;
  size: number;
  style: "solid" | "dashed";
  dashedValue: number[];
} {
  const dashed = style?.lineStyle === "dotted" ? [1, 3] : [4, 4];
  return {
    color: style?.color ?? "#4C8DFF",
    size: style?.lineWidth ?? 1,
    style: style?.lineStyle === "solid" ? "solid" : "dashed",
    dashedValue: style?.lineStyle === "solid" ? [] : dashed,
  };
}

export function registerWorkspaceIndicators(
  register: (indicator: IndicatorTemplate<Record<string, number | null>, string, IndicatorExtend>) => void,
  hooks: IndicatorHook[],
): void {
  for (const hook of hooks) {
    register({
      name: hook.id,
      shortName: hook.name,
      series: hook.overlay ? "price" : "normal",
      precision: 5,
      figures: hook.plots.map((plot) => ({
        key: plot.key,
        title: `${plot.title}: `,
        type: "line",
      })),
      calc: (dataList, indicator) => {
        const extend = indicator.extendData;
        return dataList.map((_, index) => {
          const row: Record<string, number | null> = {};
          for (const figure of indicator.figures) {
            const value =
              extend && index < extend.sealed ? (extend.plots[figure.key]?.[index] ?? null) : null;
            row[figure.key] = value;
          }
          return row;
        });
      },
      shouldUpdate: (prev, current) => ({
        calc: JSON.stringify(prev.calcParams) !== JSON.stringify(current.calcParams),
        draw: true,
      }),
      createTooltipDataSource: ({ indicator, crosshair }) => {
        const extend = indicator.extendData as IndicatorExtend | undefined;
        const index = crosshair.dataIndex ?? -1;
        const legends = indicator.figures.map((figure, figureIndex) => {
          const raw = extend && index >= 0 && index < (extend.sealed ?? 0)
            ? extend.plots[figure.key]?.[index]
            : null;
          const color = indicator.styles?.lines?.[figureIndex]?.color ?? "#4C8DFF";
          const text = typeof raw === "number" ? raw.toFixed(indicator.precision) : "—";
          return {
            title: { text: figure.title ?? figure.key, color },
            value: { text, color },
          };
        });
        return {
          name: indicator.shortName,
          calcParamsText: extend?.paramsText ?? "",
          features: [],
          legends,
        };
      },
    });
  }
}

interface Holder {
  bars: KLineData[];
}

const holders = new WeakMap<Chart, Holder>();
const ready = new WeakSet<Chart>();
const dataKeys = new WeakMap<Chart, string>();

function studyPane(study: StudyView): string {
  return study.overlay ? CANDLE_PANE : `study:${study.id}`;
}

function applyStudy(chart: Chart, study: StudyView, sealed: number, precision: number): void {
  const extendData: IndicatorExtend = {
    sealed,
    plots: study.plots,
    paramsText: study.paramsText,
  };
  const styles = {
    lines: study.plotOrder.map((key) => lineStyle(study.styles[key])),
  };
  const existing = chart.getIndicators({ id: study.id });
  if (existing.length === 0) {
    chart.createIndicator(
      {
        name: study.hookId,
        id: study.id,
        paneId: studyPane(study),
        precision,
        calcParams: [study.revision],
        extendData,
        visible: study.visible,
        zLevel: study.z,
        styles,
      },
      study.overlay,
    );
    return;
  }
  chart.overrideIndicator({
    name: study.hookId,
    id: study.id,
    calcParams: [study.revision],
    extendData,
    visible: study.visible,
    zLevel: study.z,
    styles,
    precision,
  });
}

function drawingPoints(drawing: DrawingView): { timestamp: number; value: number }[] {
  return drawing.drawing.anchors.map((anchor) => ({
    timestamp: parseUtc(anchor.time),
    value: Number(anchor.price),
  }));
}

function applyDrawing(chart: Chart, drawing: DrawingView): void {
  const name = drawing.drawing.tool === "horizontal" ? "horizontalStraightLine" : "segment";
  const points = drawingPoints(drawing);
  const existing = chart.getOverlays({ id: drawing.drawing.id });
  if (existing.length === 0) {
    chart.createOverlay({
      name,
      id: drawing.drawing.id,
      paneId: CANDLE_PANE,
      points,
      lock: drawing.locked,
      visible: drawing.visible,
      zLevel: drawing.z,
    });
    return;
  }
  chart.overrideOverlay({
    id: drawing.drawing.id,
    points,
    lock: drawing.locked,
    visible: drawing.visible,
    zLevel: drawing.z,
  });
}

export function syncChart(chart: Chart, view: DeskView, pane: PaneView): void {
  const series = chartSeries(view.window);
  const holder = holders.get(chart) ?? { bars: [] };
  holder.bars = toKLineData(series);
  holders.set(chart, holder);
  const period = parsePeriod(view.layout.period);
  const key = `${period.source}:${view.window.cursor}:${series.length}:${series.at(-1)?.closeTime ?? ""}`;
  const precision = pricePrecision(view.window.spec.tickSize);
  if (!ready.has(chart)) {
    chart.setSymbol({
      ticker: view.layout.symbol,
      pricePrecision: precision,
      volumePrecision: 0,
    });
    chart.setPeriod(toKLinePeriod(period));
    chart.setDataLoader({
      getBars: ({ callback }) => {
        callback(holder.bars, false);
      },
    });
    ready.add(chart);
  } else if (dataKeys.get(chart) !== key) {
    chart.setPeriod(toKLinePeriod(period));
  }
  dataKeys.set(chart, key);
  chart.setTimezone(view.layout.timezone);
  chart.setStyles({ candle: { type: view.layout.candleType } });
  if (pane.visible) {
    chart.overrideYAxis({ name: view.layout.priceScale });
  }

  const studyIds = new Set(pane.studies.map((study) => study.id));
  for (const indicator of chart.getIndicators()) {
    if (!studyIds.has(indicator.id)) {
      chart.removeIndicator({ id: indicator.id });
    }
  }
  for (const study of pane.studies) {
    applyStudy(chart, { ...study, visible: study.visible && pane.visible }, view.window.bars.length, precision);
  }

  const drawingIds = new Set(pane.drawings.map((drawing) => drawing.drawing.id));
  for (const overlay of chart.getOverlays()) {
    if (overlay.groupId === "backtest") {
      continue;
    }
    if (!drawingIds.has(overlay.id)) {
      chart.removeOverlay({ id: overlay.id });
    }
  }
  for (const drawing of pane.drawings) {
    applyDrawing(chart, {
      ...drawing,
      visible: drawing.visible && pane.visible,
    });
  }

  chart.removeOverlay({ groupId: "backtest" });
  if (pane.id === view.panes[0]?.id) {
    for (const backtest of view.backtests) {
      for (const marker of markersFor(view, backtest.id)) {
        chart.createOverlay({
          name: "simpleAnnotation",
          id: marker.id,
          groupId: "backtest",
          paneId: CANDLE_PANE,
          lock: true,
          visible: true,
          points: [{ timestamp: parseUtc(marker.time), value: Number(marker.price) }],
          extendData: marker.side === "buy" ? "Buy" : "Sell",
          styles: { line: { color: marker.color } },
        });
      }
    }
  }
}

export function showCrosshair(chart: Chart, time: string, price: number): void {
  const converted = chart.convertToPixel({ timestamp: parseUtc(time), value: price });
  const pixel = Array.isArray(converted) ? converted[0] : converted;
  if (!pixel || typeof pixel.x !== "number") {
    return;
  }
  chart.executeAction("onCrosshairChange", {
    x: pixel.x,
    y: pixel.y,
    paneId: CANDLE_PANE,
  });
}

