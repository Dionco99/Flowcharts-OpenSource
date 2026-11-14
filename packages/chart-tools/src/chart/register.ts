// SPDX-License-Identifier: Apache-2.0

import {
  getSupportedIndicators,
  getSupportedOverlays,
  registerIndicator,
  registerOverlay,
  type IndicatorTemplate,
  type KLineData,
} from "klinecharts";
import type { Bar, SessionDef, SymbolSpec, Timeframe } from "@flowchart/bars";
import { utcMinuteOfDay } from "@flowchart/bars";
import type { IndicatorPackage } from "../study";

type StudyExtra = { timeframe: Timeframe; cursor: number };
type ShadeExtra = { sessions: SessionDef[] };

function barOf(data: KLineData, precision: number): Bar {
  const ct = typeof data.ct === "number" ? data.ct : data.timestamp;
  const text = (value: number) => value.toFixed(precision);
  return {
    t: data.timestamp,
    ct,
    o: text(data.open),
    h: text(data.high),
    l: text(data.low),
    c: text(data.close),
    partial: Boolean(data.partial),
  };
}

let installed = false;

export function installChartExtensions(studies: IndicatorPackage[], spec: SymbolSpec): void {
  if (installed) return;
  installed = true;

  if (!getSupportedOverlays().includes("range")) {
    registerOverlay({
      name: "range",
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates }) => {
        if (coordinates.length < 2) return [];
        const x = Math.min(coordinates[0].x, coordinates[1].x);
        const y = Math.min(coordinates[0].y, coordinates[1].y);
        return [
          {
            type: "rect",
            attrs: {
              x,
              y,
              width: Math.abs(coordinates[1].x - coordinates[0].x),
              height: Math.abs(coordinates[1].y - coordinates[0].y),
            },
            styles: {
              style: "stroke_fill",
              color: "rgba(224, 161, 90, 0.16)",
              borderColor: "rgba(228, 168, 92, 0.95)",
              borderSize: 1,
            },
          },
        ];
      },
    });
  }

  if (!getSupportedOverlays().includes("eventMark")) {
    registerOverlay({
      name: "eventMark",
      totalStep: 2,
      lock: true,
      createPointFigures: ({ coordinates, overlay, bounding }) => {
        const x = coordinates[0]?.x;
        if (typeof x !== "number") return [];
        return [
          {
            type: "line",
            ignoreEvent: true,
            attrs: { coordinates: [{ x, y: 18 }, { x, y: bounding.height }] },
            styles: { color: "rgba(228, 168, 92, 0.35)", size: 1, style: "dashed", dashedValue: [2, 3] },
          },
          {
            type: "text",
            ignoreEvent: true,
            attrs: { x, y: 3, text: String(overlay.extendData ?? ""), align: "center", baseline: "top" },
            styles: { color: "#e4a85c", size: 10, weight: "600" },
          },
        ];
      },
    });
  }

  if (!getSupportedOverlays().includes("flagMark")) {
    registerOverlay({
      name: "flagMark",
      totalStep: 2,
      lock: true,
      createPointFigures: ({ coordinates, overlay }) => {
        const x = coordinates[0]?.x;
        const y = coordinates[0]?.y;
        if (typeof x !== "number" || typeof y !== "number") return [];
        return [
          {
            type: "polygon",
            ignoreEvent: true,
            attrs: {
              coordinates: [
                { x, y: y - 11 },
                { x: x - 5, y },
                { x: x + 5, y },
              ],
            },
            styles: { color: "#e4a85c" },
          },
          {
            type: "text",
            ignoreEvent: true,
            attrs: { x: x + 7, y: y - 12, text: String(overlay.extendData ?? "ambiguous"), align: "left", baseline: "bottom" },
            styles: { color: "#e4a85c", size: 10 },
          },
        ];
      },
    });
  }

  if (!getSupportedIndicators().includes("sessionShade")) {
    registerIndicator({
      name: "sessionShade",
      shortName: "",
      series: "normal",
      zLevel: -20,
      figures: [],
      calc: (dataList) => dataList.map(() => ({})),
      createTooltipDataSource: () => ({ name: "", calcParamsText: "", features: [], legends: [] }),
      draw: ({ ctx, chart, indicator, bounding, xAxis }) => {
        const sessions = [...((indicator.extendData as ShadeExtra | undefined)?.sessions ?? [])].reverse();
        const list = chart.getDataList();
        const range = chart.getVisibleRange();
        const space = chart.getBarSpace().bar;
        const from = Math.max(0, Math.min(list.length - 1, range.realFrom));
        const to = Math.max(from, Math.min(list.length, range.realTo));
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        for (const session of sessions) {
          let run = -1;
          const paint = (i0: number, i1: number) => {
            const x1 = xAxis.convertToPixel(i0) - space / 2;
            const x2 = xAxis.convertToPixel(i1) + space / 2;
            ctx.fillStyle = session.color;
            ctx.fillRect(x1, 0, Math.max(1, x2 - x1), bounding.height);
          };
          for (let i = from; i < to; i++) {
            const minute = utcMinuteOfDay(list[i].timestamp);
            const inside = minute >= session.openMinute && minute < session.closeMinute;
            if (inside && run < 0) run = i;
            if (!inside && run >= 0) {
              paint(run, i - 1);
              run = -1;
            }
          }
          if (run >= 0) paint(run, to - 1);
        }
        ctx.restore();
        return false;
      },
    });
  }

  for (const study of studies) {
    if (getSupportedIndicators().includes(study.id)) continue;
    const template: IndicatorTemplate<Record<string, number>> = {
      name: study.id,
      shortName: study.name,
      series: "price",
      precision: spec.pricePrecision,
      zLevel: 0,
      calcParams: study.params.map((param) => param.default),
      figures: study.series.map((series) => ({
        key: series.key,
        title: `${series.title}: `,
        type: "line",
        styles: () => ({
          color: series.color,
          size: 1.25,
          style: series.dashed ? "dashed" : "solid",
          dashedValue: [4, 3],
        }),
      })),
      calc: (dataList, indicator) => {
        const extra = indicator.extendData as StudyExtra | undefined;
        const params: Record<string, number> = {};
        study.params.forEach((param, index) => {
          const raw = indicator.calcParams[index];
          params[param.key] = typeof raw === "number" ? raw : param.default;
        });
        const bars = dataList.map((row) => barOf(row, spec.pricePrecision));
        const cursor = extra?.cursor ?? bars[bars.length - 1]?.ct ?? 0;
        const values = study.compute(
          {
            spec,
            timeframe: extra?.timeframe ?? "1m",
            bars,
            cursor,
          },
          params,
        );
        return dataList.map((_, index) => {
          const row: Record<string, number> = {};
          for (const series of study.series) {
            const value = values[series.key]?.[index];
            if (typeof value === "number" && Number.isFinite(value)) row[series.key] = value;
          }
          return row;
        });
      },
    };
    registerIndicator(template);
  }
}
