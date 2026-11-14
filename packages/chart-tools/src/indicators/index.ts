// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import { closes, opens, type Bar, type Plots } from "../bar.ts";
import { getIndicatorStudy, listIndicatorStudies, runIndicatorStudy, type Study, type StudyParams } from "./studies.ts";
import { previousDayHighLow, sessionHighLow, type SessionOptions } from "./session.ts";
import {
  accelerator,
  alligator,
  anchoredVwap,
  aroonOscillator,
  averageDirectionalIndex,
  chaikinVolatility,
  elderImpulse,
  fractals,
  marketFacilitation,
  momentum,
  regressionChannel,
  relativeVolume,
  rollingBeta,
  rollingCorrelation,
  standardErrorBands,
  vwapBands,
  zigzag,
} from "./desk.ts";

const referenceStudies: Study[] = [
  {
    id: "sessionHighLow",
    title: "Session high and low",
    summary: "The highest high and lowest low since the current session opened. openMinute is the local session open, and offsetMinutes is minutes east of UTC.",
    run(bars, params) {
      const result = sessionHighLow(bars, sessionOptions(params));
      return { high: result.high, low: result.low };
    },
  },
  {
    id: "previousDayHighLow",
    title: "Previous day high and low",
    summary: "The high and low of the previous session day. The day boundary uses the same offset and open minute as the session study.",
    run(bars, params) {
      const result = previousDayHighLow(bars, sessionOptions(params));
      return { high: result.high, low: result.low };
    },
  },
];

function sessionOptions(params?: StudyParams): SessionOptions {
  const offset = params?.offsetMinutes;
  const open = params?.openMinute;
  return {
    offsetMinutes: typeof offset === "number" ? offset : undefined,
    openMinute: typeof open === "number" ? open : undefined,
  };
}

function numberParam(params: StudyParams | undefined, key: string, fallback: number): number {
  const value = params?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const deskStudies: Study[] = [
  {
    id: "adx",
    title: "Average directional index",
    summary: "Wilder plus DI, minus DI, and ADX. True range and directional movement are smoothed with indicatorts rma.",
    run(bars, params) {
      const result = averageDirectionalIndex(bars, numberParam(params, "period", 14));
      return { plus: result.plus, minus: result.minus, adx: result.adx };
    },
  },
  {
    id: "aroonOscillator",
    title: "Aroon oscillator",
    summary: "Aroon up minus Aroon down from indicatorts.",
    run(bars, params) {
      return { value: aroonOscillator(bars, numberParam(params, "period", 25)) };
    },
  },
  {
    id: "zigzag",
    title: "Zigzag",
    summary: "Close pivots confirmed only after price reverses by the threshold. Swings that have not reversed stay empty.",
    run(bars, params) {
      return { value: zigzag(bars, numberParam(params, "threshold", 1)) };
    },
  },
  {
    id: "anchoredVwap",
    title: "Anchored VWAP",
    summary: "Cumulative typical-price VWAP starting at anchorTime. Bars before the anchor are empty.",
    run(bars, params) {
      const anchor = params?.anchorTime;
      const anchorTime = typeof anchor === "number" ? anchor : bars[0]?.time ?? 0;
      return { value: anchoredVwap(bars, anchorTime) };
    },
  },
  {
    id: "vwapBands",
    title: "VWAP bands",
    summary: "Rolling VWAP from indicatorts, with bands at a multiple of the typical-price standard deviation.",
    run(bars, params) {
      const result = vwapBands(bars, numberParam(params, "period", 20), numberParam(params, "multiplier", 2));
      return { middle: result.middle, upper: result.upper, lower: result.lower };
    },
  },
  {
    id: "regressionChannel",
    title: "Linear regression channel",
    summary: "Moving least-squares fit from indicatorts, with bands at a multiple of the residual standard deviation.",
    run(bars, params) {
      const result = regressionChannel(closes(bars), numberParam(params, "period", 20), numberParam(params, "multiplier", 2));
      return { fit: result.fit, upper: result.upper, lower: result.lower };
    },
  },
  {
    id: "standardErrorBands",
    title: "Standard error bands",
    summary: "Same least-squares fit, with bands at a multiple of the residual standard error.",
    run(bars, params) {
      const result = standardErrorBands(closes(bars), numberParam(params, "period", 20), numberParam(params, "multiplier", 2));
      return { fit: result.fit, upper: result.upper, lower: result.lower };
    },
  },
  {
    id: "alligator",
    title: "Alligator",
    summary: "Smoothed averages of close shifted forward: jaw 13 by 8, teeth 8 by 5, lips 5 by 3. The shift uses only bars already in the window.",
    run(bars) {
      const result = alligator(bars);
      return { jaw: result.jaw, teeth: result.teeth, lips: result.lips };
    },
  },
  {
    id: "fractals",
    title: "Fractals",
    summary: "A high or low fractal is written only after the given number of bars has printed on its right.",
    run(bars, params) {
      const result = fractals(bars, numberParam(params, "width", 2));
      return { high: result.high, low: result.low };
    },
  },
  {
    id: "marketFacilitation",
    title: "Market facilitation index",
    summary: "Bar range divided by volume. A zero-volume bar is empty.",
    run(bars) {
      return { value: marketFacilitation(bars) };
    },
  },
  {
    id: "accelerator",
    title: "Accelerator oscillator",
    summary: "Awesome oscillator from indicatorts minus its 5-bar simple average.",
    run(bars) {
      return { value: accelerator(bars) };
    },
  },
  {
    id: "chaikinVolatility",
    title: "Chaikin volatility",
    summary: "Rate of change of an exponential average of high-low range.",
    run(bars, params) {
      return { value: chaikinVolatility(bars, numberParam(params, "emaPeriod", 10), numberParam(params, "rocPeriod", 10)) };
    },
  },
  {
    id: "elderImpulse",
    title: "Elder impulse",
    summary: "1 when EMA and the MACD histogram are both rising, -1 when both are falling, otherwise 0.",
    run(bars, params) {
      return { value: elderImpulse(bars, numberParam(params, "period", 13)) };
    },
  },
  {
    id: "momentum",
    title: "Momentum",
    summary: "Close minus the close `period` bars earlier.",
    run(bars, params) {
      return { value: momentum(closes(bars), numberParam(params, "period", 10)) };
    },
  },
  {
    id: "correlation",
    title: "Correlation",
    summary: "Rolling correlation of close against open. Two outside series can be passed to rollingCorrelation.",
    run(bars, params) {
      return { value: rollingCorrelation(closes(bars), opens(bars), numberParam(params, "period", 20)) };
    },
  },
  {
    id: "beta",
    title: "Beta",
    summary: "Rolling beta of close against open. Two outside series can be passed to rollingBeta.",
    run(bars, params) {
      return { value: rollingBeta(closes(bars), opens(bars), numberParam(params, "period", 20)) };
    },
  },
  {
    id: "relativeVolume",
    title: "Relative volume",
    summary: "Volume divided by the average volume of earlier bars at the same minute of the session day. The first print of a minute is empty.",
    run(bars, params) {
      return { value: relativeVolume(bars, numberParam(params, "offsetMinutes", 0)) };
    },
  },
];

const referenceById = new Map([...referenceStudies, ...deskStudies].map((study) => [study.id, study]));

export function listStudies(): readonly Study[] {
  return [...listIndicatorStudies(), ...referenceStudies, ...deskStudies];
}

export function runStudy(id: string, bars: readonly Bar[], params?: StudyParams): Plots {
  const reference = referenceById.get(id);
  if (reference) {
    return reference.run(bars, params);
  }
  if (!getIndicatorStudy(id)) {
    throw new Error(`unknown study: ${id}`);
  }
  return runIndicatorStudy(id, bars, params);
}
