// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import type { IndicatorTemplate, KLineData } from "klinecharts";
import { fromKLineData } from "./data.ts";
import { runStudy } from "../indicators/index.ts";

export interface IndicatorChartApi {
  registerIndicator(indicator: IndicatorTemplate): void;
}

function lineTemplate(studyId: string, figureKey: string, paramName: string, fallback: number): IndicatorTemplate {
  return {
    name: `flowchart_${studyId}`,
    shortName: studyId,
    series: "price",
    calcParams: [fallback],
    figures: [{ key: figureKey, title: studyId, type: "line" }],
    calc(dataList: KLineData[], indicator) {
      const period = Number(indicator.calcParams[0] ?? fallback);
      const plots = runStudy(studyId, fromKLineData(dataList), { [paramName]: period });
      const series = plots[figureKey] ?? plots.value;
      return dataList.map((_, index) => ({ [figureKey]: series?.[index] ?? null }));
    },
  };
}

/** Chart templates whose calc calls indicatorts through the study registry. */
export function flowchartIndicatorTemplates(): IndicatorTemplate[] {
  return [
    lineTemplate("ema", "value", "period", 12),
    lineTemplate("sma", "value", "period", 20),
    lineTemplate("rsi", "value", "period", 14),
    {
      name: "flowchart_macd",
      shortName: "macd",
      series: "normal",
      calcParams: [12, 26, 9],
      figures: [
        { key: "macdLine", title: "MACD", type: "line" },
        { key: "signalLine", title: "Signal", type: "line" },
        { key: "histogram", title: "Histogram", type: "bar" },
      ],
      calc(dataList, indicator) {
        const [fast, slow, signal] = indicator.calcParams;
        const plots = runStudy("macd", fromKLineData(dataList), {
          fast: Number(fast ?? 12),
          slow: Number(slow ?? 26),
          signal: Number(signal ?? 9),
        });
        return dataList.map((_, index) => ({
          macdLine: plots.macdLine[index],
          signalLine: plots.signalLine[index],
          histogram: plots.histogram[index],
        }));
      },
    },
    {
      name: "flowchart_bb",
      shortName: "bb",
      series: "price",
      calcParams: [20],
      figures: [
        { key: "upper", title: "Upper", type: "line" },
        { key: "middle", title: "Middle", type: "line" },
        { key: "lower", title: "Lower", type: "line" },
      ],
      calc(dataList, indicator) {
        const period = Number(indicator.calcParams[0] ?? 20);
        const plots = runStudy("bb", fromKLineData(dataList), { period });
        return dataList.map((_, index) => ({
          upper: plots.upper[index],
          middle: plots.middle[index],
          lower: plots.lower[index],
        }));
      },
    },
  ];
}

export function registerFlowchartIndicators(api: IndicatorChartApi): void {
  for (const template of flowchartIndicatorTemplates()) {
    api.registerIndicator(template);
  }
}
