// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import * as ind from "indicatorts";
import { cleanSeries, closes, highs, lows, opens, plotsFrom, volumes, type Bar, type Plots, type Series } from "../bar.ts";

export type StudyParams = Record<string, number | string | undefined>;

export interface Study {
  id: string;
  title: string;
  summary: string;
  run(bars: readonly Bar[], params?: StudyParams): Plots;
}

function pick(params: StudyParams | undefined, keys: readonly string[]): Config {
  const source = params ?? {};
  const config: Record<string, number | string> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      config[key] = value;
    }
  }
  if (keys.includes("seed") && (source.seed === "first" || source.seed === "sma")) {
    config.seed = source.seed;
  }
  if (keys.includes("method") && typeof source.method === "string") {
    config.method = source.method;
  }
  if (keys.includes("ma") && (source.ma === "sma" || source.ma === "ema")) {
    config.ma = source.ma;
  }
  return config;
}

function addHistogram(plots: Plots, left: string, right: string, name: string): Plots {
  const a = plots[left];
  const b = plots[right];
  if (!a || !b) {
    return plots;
  }
  const histogram: Series = a.map((value, index) => {
    const other = b[index];
    return value == null || other == null ? null : value - other;
  });
  return { ...plots, [name]: histogram };
}

type Config = any;

const studies: Study[] = [
  seriesStudy("ema", "Exponential moving average", "Average of closes that gives more weight to newer bars.", (values, config) => ind.ema(values, config), ["period", "seed"]),
  seriesStudy("sma", "Simple moving average", "Average of the last N closes, each weighted equally.", (values, config) => ind.sma(values, config), ["period"]),
  seriesStudy("wma", "Weighted moving average", "Average of closes with linearly rising weights toward the newest bar.", (values, config) => ind.wma(values, config), ["period"]),
  seriesStudy("rma", "Wilder moving average", "Smoothed average using Wilder's 1/N factor.", (values, config) => ind.rma(values, config), ["period", "seed"]),
  seriesStudy("smma", "Smoothed moving average", "Running average that blends the previous average with the new close.", (values, config) => ind.smma(values, config), ["period"]),
  seriesStudy("dema", "Double exponential moving average", "Moving average with the lag of a single exponential average reduced.", (values, config) => ind.dema(values, config), ["period"]),
  seriesStudy("tema", "Triple exponential moving average", "Moving average with the lag reduced a second time.", (values, config) => ind.tema(values, config), ["period"]),
  seriesStudy("trima", "Triangular moving average", "Double-smoothed average that emphasizes the middle of the window.", (values, config) => ind.trima(values, config), ["period"]),
  seriesStudy("hma", "Hull moving average", "Fast average that uses a weighted difference of two windows.", (values, config) => ind.hma(values, config), ["period"]),
  seriesStudy("kama", "Kaufman adaptive moving average", "Average that speeds up when price is trending and slows when it is noisy.", (values, config) => ind.kama(values, config), ["period", "fast", "slow"]),
  seriesStudy("t3", "Tillson T3", "Smoothed exponential average with a volume factor.", (values, config) => ind.t3(values, config), ["period", "volumeFactor"]),
  barStudy("vwma", "Volume weighted moving average", "Average of closes weighted by volume.", (bars, config) => ind.vwma(closes(bars), volumes(bars), config), ["period"]),
  seriesStudy("md", "McGinley dynamic", "Average that adjusts its speed with the ratio of price to the previous average.", (values, config) => ind.md(values, config), ["period"]),
  {
    id: "macd",
    title: "MACD",
    summary: "Difference of a fast and a slow exponential average, plus a signal average of that difference.",
    run(bars, params) {
      const result = plotsFrom(ind.macd(closes(bars), pick(params, ["fast", "slow", "signal", "seed"])));
      return addHistogram(result, "macdLine", "signalLine", "histogram");
    },
  },
  seriesStudy("apo", "Absolute price oscillator", "Fast exponential average minus a slow exponential average.", (values, config) => ind.apo(values, config), ["fast", "slow", "seed"]),
  {
    id: "ppo",
    title: "Percentage price oscillator",
    summary: "MACD difference expressed as a percent of the slow average, with a signal and a histogram.",
    run(bars, params) {
      return plotsFrom(ind.ppo(closes(bars), pick(params, ["fast", "slow", "signal", "seed"])));
    },
  },
  seriesStudy("dpo", "Detrended price oscillator", "Close minus a displaced moving average, so longer swings are removed.", (values, config) => ind.dpo(values, config), ["period"]),
  seriesStudy("cfo", "Chande forecast oscillator", "Percent gap between the close and a linear forecast of the close.", (values) => ind.cfo(values), []),
  seriesStudy("mcfo", "Moving Chande forecast oscillator", "Chande forecast oscillator smoothed over a window.", (values, config) => ind.mcfo(values, config), ["period"]),
  seriesStudy("trix", "TRIX", "One-bar rate of change of a triple exponential average.", (values, config) => ind.trix(values, config), ["period"]),
  seriesStudy("tsi", "True strength index", "Double-smoothed momentum scaled by double-smoothed absolute momentum.", (values, config) => ind.tsi(values, config), ["firstPeriod", "secondPeriod"]),
  {
    id: "kst",
    title: "Know sure thing",
    summary: "Weighted sum of four smoothed rates of change, with a signal average.",
    run(bars, params) {
      return plotsFrom(ind.kst(closes(bars), pick(params, ["rocPeriod1", "rocPeriod2", "rocPeriod3", "rocPeriod4", "smaPeriod1", "smaPeriod2", "smaPeriod3", "smaPeriod4", "signalPeriod"])));
    },
  },
  seriesStudy("stc", "Schaff trend cycle", "Stochastic of the MACD line, smoothed twice, on a 0 to 100 scale.", (values, config) => ind.stc(values, config), ["fast", "slow", "kPeriod", "dPeriod"]),
  seriesStudy("slope", "Linear regression slope", "Slope of the least-squares line through the last N closes.", (values, config) => ind.slope(values, config), ["period"]),
  seriesStudy("since", "Bars since change", "How many bars the close has stayed unchanged.", (values) => ind.since(values), []),
  barStudy("qstick", "Qstick", "Moving average of each bar's close minus its open.", (bars, config) => ind.qstick(opens(bars), closes(bars), config), ["period"]),
  {
    id: "aroon",
    title: "Aroon",
    summary: "How recently the window made its highest high and its lowest low, on a 0 to 100 scale.",
    run(bars, params) {
      return plotsFrom(ind.aroon(highs(bars), lows(bars), pick(params, ["period"])));
    },
  },
  {
    id: "vortex",
    title: "Vortex",
    summary: "Positive and negative trend movement divided by true range.",
    run(bars, params) {
      return plotsFrom(ind.vortex(highs(bars), lows(bars), closes(bars), pick(params, ["period"])));
    },
  },
  {
    id: "psar",
    title: "Parabolic stop and reverse",
    summary: "A trailing stop that accelerates while a trend continues and flips when price crosses it.",
    run(bars, params) {
      return plotsFrom(ind.psar(highs(bars), lows(bars), closes(bars), pick(params, ["step", "max"])));
    },
  },
  {
    id: "superTrend",
    title: "Supertrend",
    summary: "A band a multiple of average true range from the median price. The line follows one side until the close crosses it.",
    run(bars, params) {
      return plotsFrom(ind.superTrend(highs(bars), lows(bars), closes(bars), pick(params, ["period", "multiplier"])));
    },
  },
  {
    id: "mi",
    title: "Mass index",
    summary: "Sum of the ratio of a fast and a slow average of the high-low range. It rises when the range expands.",
    run(bars, params) {
      return plotsFrom(ind.mi(highs(bars), lows(bars), pick(params, ["emaPeriod", "miPeriod"])));
    },
  },
  {
    id: "bop",
    title: "Balance of power",
    summary: "Close minus open, divided by high minus low. Positive values mean the close finished near the high.",
    run(bars) {
      return plotsFrom(ind.bop(opens(bars), highs(bars), lows(bars), closes(bars)));
    },
  },
  {
    id: "cci",
    title: "Commodity channel index",
    summary: "Typical price compared with its average, scaled by the mean deviation.",
    run(bars, params) {
      return plotsFrom(ind.cci(highs(bars), lows(bars), closes(bars), pick(params, ["period"])));
    },
  },
  {
    id: "kdj",
    title: "KDJ",
    summary: "Stochastic K and D plus a J line that exaggerates their spread.",
    run(bars, params) {
      return plotsFrom(ind.kdj(highs(bars), lows(bars), closes(bars), pick(params, ["rPeriod", "kPeriod", "dPeriod"])));
    },
  },
  {
    id: "stochastic",
    title: "Stochastic of one series",
    summary: "Where the chosen series sits inside its own recent range, then smoothed.",
    run(bars, params) {
      return plotsFrom(ind.stochastic(closes(bars), pick(params, ["period", "dPeriod"])));
    },
  },
  {
    id: "slowStochastic",
    title: "Slow stochastic of one series",
    summary: "The single-series stochastic smoothed twice.",
    run(bars, params) {
      return plotsFrom(ind.slowStochastic(closes(bars), pick(params, ["period", "kPeriod", "dPeriod"])));
    },
  },
  {
    id: "stoch",
    title: "Stochastic oscillator",
    summary: "Where the close sits inside the recent high-low range, with a smoothed signal.",
    run(bars, params) {
      return plotsFrom(ind.stoch(highs(bars), lows(bars), closes(bars), pick(params, ["kPeriod", "dPeriod"])));
    },
  },
  seriesStudy("stochRsi", "Stochastic RSI", "Stochastic of the RSI, so the oscillator is judged against its own range.", (values, config) => ind.stochRsi(values, config), ["period"]),
  seriesStudy("rsi", "Relative strength index", "Wilder ratio of average gain to average loss, scaled from 0 to 100.", (values, config) => ind.rsi(values, config), ["period", "seed"]),
  seriesStudy("crsi", "Connors RSI", "Blend of RSI, the length of the current up or down streak, and a percent-rank of one-bar change.", (values, config) => ind.crsi(values, config), ["rsiPeriod", "streakRsiPeriod", "percentRankPeriod"]),
  seriesStudy("roc", "Rate of change", "Percent change in the close over N bars.", (values, config) => ind.roc(values, config), ["period"]),
  {
    id: "ao",
    title: "Awesome oscillator",
    summary: "Fast simple average of the median price minus a slow simple average of the median price.",
    run(bars, params) {
      return plotsFrom(ind.ao(highs(bars), lows(bars), pick(params, ["fast", "slow"])));
    },
  },
  {
    id: "uo",
    title: "Ultimate oscillator",
    summary: "Buying pressure divided by true range, averaged over three windows and combined.",
    run(bars, params) {
      return plotsFrom(ind.uo(highs(bars), lows(bars), closes(bars), pick(params, ["shortPeriod", "middlePeriod", "longPeriod"])));
    },
  },
  {
    id: "willr",
    title: "Williams percent range",
    summary: "Where the close sits in the recent high-low range, reported from 0 down to -100.",
    run(bars, params) {
      return plotsFrom(ind.willr(highs(bars), lows(bars), closes(bars), pick(params, ["period"])));
    },
  },
  seriesStudy("fisher", "Fisher transform", "A normalized close pushed through the Fisher transform so turning points stand out.", (values, config) => ind.fisher(values, config), ["period"]),
  {
    id: "ehlersFisher",
    title: "Ehlers Fisher transform",
    summary: "Fisher transform of the median price over a window.",
    run(bars, params) {
      return plotsFrom(ind.ehlersFisher(highs(bars), lows(bars), pick(params, ["period"])));
    },
  },
  {
    id: "elderRay",
    title: "Elder ray",
    summary: "High and low measured against an exponential average of the close.",
    run(bars, params) {
      return plotsFrom(ind.elderRay(highs(bars), lows(bars), closes(bars), pick(params, ["period"])));
    },
  },
  {
    id: "rvi",
    title: "Relative vigor index",
    summary: "Close-to-open movement compared with the high-low range, plus a signal average.",
    run(bars, params) {
      return plotsFrom(ind.rvi(opens(bars), highs(bars), lows(bars), closes(bars), pick(params, ["period", "signalPeriod"])));
    },
  },
  {
    id: "ibs",
    title: "Internal bar strength",
    summary: "Where the close sits between that bar's low and high.",
    run(bars) {
      return plotsFrom(ind.ibs(highs(bars), lows(bars), closes(bars)));
    },
  },
  seriesStudy("coppock", "Coppock curve", "Sum of a long and a short rate of change, then smoothed.", (values, config) => ind.coppockCurve(values, config), ["rocPeriod1", "rocPeriod2", "wmaPeriod"]),
  seriesStudy("specialK", "Pring special K", "Weighted sum of several smoothed rates of change across short and long horizons.", (values) => ind.specialK(values), []),
  {
    id: "tdSequential",
    title: "Sequential countdown",
    summary: "Counts consecutive closes that stay beyond the close several bars earlier, first as a setup and then as a countdown. The count is the indicatorts tdSequential implementation of the published rules.",
    run(bars, params) {
      return plotsFrom(ind.tdSequential(closes(bars), pick(params, ["lookback", "countdownLookback", "setupPeriod", "countdownPeriod"])));
    },
  },
  {
    id: "ichimoku",
    title: "Ichimoku cloud",
    summary: "Conversion line, base line, and the two leading spans as of each bar. The lagging span is the close shifted back inside this window; the library pads its tail with 0, and it is a display series, not a signal.",
    run(bars, params) {
      return plotsFrom(ind.ichimokuCloud(highs(bars), lows(bars), closes(bars), pick(params, ["short", "medium", "long", "close"])));
    },
  },
  {
    id: "pivotPoint",
    title: "Pivot points",
    summary: "Pivot, resistance, and support from the previous bar. method is standard, woodie, camarilla, or fibonacci.",
    run(bars, params) {
      return plotsFrom(ind.pivotPoint(opens(bars), highs(bars), lows(bars), closes(bars), pick(params, ["method"])));
    },
  },
  {
    id: "typprice",
    title: "Typical price",
    summary: "Average of the high, the low, and the close.",
    run(bars) {
      return plotsFrom(ind.typprice(highs(bars), lows(bars), closes(bars)));
    },
  },
  {
    id: "weightedClose",
    title: "Weighted close",
    summary: "Average that counts the close twice and the high and low once.",
    run(bars) {
      return plotsFrom(ind.weightedClose(highs(bars), lows(bars), closes(bars)));
    },
  },
  seriesStudy("mmax", "Moving maximum", "Highest value in the last N bars.", (values, config) => ind.mmax(values, config), ["period"]),
  seriesStudy("mmin", "Moving minimum", "Lowest value in the last N bars.", (values, config) => ind.mmin(values, config), ["period"]),
  seriesStudy("msum", "Moving sum", "Sum of the last N values.", (values, config) => ind.msum(values, config), ["period"]),
  seriesStudy("mstd", "Moving standard deviation", "Population standard deviation of the last N closes.", (values, config) => ind.mstd(values, config), ["period"]),
  seriesStudy("zScore", "Z score", "How many standard deviations the close is from its moving average.", (values, config) => ind.zScore(values, config), ["period"]),
  {
    id: "atr",
    title: "Average true range",
    summary: "Wilder average of true range. Also returns the true range itself.",
    run(bars, params) {
      return plotsFrom(ind.atr(highs(bars), lows(bars), closes(bars), pick(params, ["period", "seed"])));
    },
  },
  {
    id: "tr",
    title: "True range",
    summary: "The largest of the bar's range, the gap from the previous close to the high, and the gap from the previous close to the low.",
    run(bars) {
      return plotsFrom(ind.tr(highs(bars), lows(bars), closes(bars)));
    },
  },
  {
    id: "bb",
    title: "Bollinger bands",
    summary: "A simple average with bands two standard deviations above and below it.",
    run(bars, params) {
      return plotsFrom(ind.bb(closes(bars), pick(params, ["period"])));
    },
  },
  {
    id: "bbw",
    title: "Bollinger band width",
    summary: "Upper band minus lower band, divided by the middle band, plus a smoothed width.",
    run(bars, params) {
      const config = pick(params, ["period"]);
      const bands = ind.bb(closes(bars), config);
      return plotsFrom(ind.bbw(bands, config));
    },
  },
  seriesStudy("percentB", "Bollinger percent B", "Where the close sits between the lower and upper Bollinger bands.", (values, config) => ind.percentB(values, config), ["period"]),
  {
    id: "kc",
    title: "Keltner channel",
    summary: "An exponential average with bands a multiple of average true range away.",
    run(bars, params) {
      return plotsFrom(ind.kc(highs(bars), lows(bars), closes(bars), pick(params, ["period"])));
    },
  },
  seriesStudy("dc", "Donchian channel", "Highest and lowest close over the window, and the midpoint between them.", (values, config) => ind.dc(values, config), ["period"]),
  {
    id: "ab",
    title: "Acceleration bands",
    summary: "Bands around a simple average that widen when the high-low range is large.",
    run(bars, params) {
      return plotsFrom(ind.ab(highs(bars), lows(bars), closes(bars), pick(params, ["period", "multiplier"])));
    },
  },
  {
    id: "ce",
    title: "Chandelier exit",
    summary: "A long stop under the recent highest high and a short stop over the recent lowest low, each offset by a multiple of average true range.",
    run(bars, params) {
      return plotsFrom(ind.ce(highs(bars), lows(bars), closes(bars), pick(params, ["period"])));
    },
  },
  {
    id: "chop",
    title: "Choppiness index",
    summary: "Whether the window's true range is large relative to its high-low span. Higher values mean choppier movement.",
    run(bars, params) {
      return plotsFrom(ind.chop(highs(bars), lows(bars), closes(bars), pick(params, ["period"])));
    },
  },
  seriesStudy("hv", "Historical volatility", "Population standard deviation of one-bar returns.", (values, config) => ind.hv(values, config), ["period"]),
  seriesStudy("ahv", "Annualized historical volatility", "Historical volatility scaled by the square root of the trading-day count.", (values, config) => ind.ahv(values, config), ["period", "tradingDaysPerYear"]),
  seriesStudy("ui", "Ulcer index", "Root-mean-square of percent drawdowns from the window's highest close.", (values, config) => ind.ui(values, config), ["period"]),
  {
    id: "po",
    title: "Projection oscillator",
    summary: "Where the close sits between the projected high and projected low of a regression window.",
    run(bars, params) {
      return plotsFrom(ind.po(highs(bars), lows(bars), closes(bars), pick(params, ["period", "smooth"])));
    },
  },
  {
    id: "envelope",
    title: "Moving average envelope",
    summary: "Bands a fixed percent above and below a simple or exponential average.",
    run(bars, params) {
      return plotsFrom(ind.envelope(closes(bars), pick(params, ["period", "percentage", "ma"])));
    },
  },
  barStudy("obv", "On-balance volume", "Running total that adds volume on an up close and subtracts it on a down close.", (bars) => ind.obv(closes(bars), volumes(bars)), []),
  {
    id: "ad",
    title: "Accumulation/distribution",
    summary: "Running total of volume signed by where the close sits in the bar's range.",
    run(bars) {
      return plotsFrom(ind.ad(highs(bars), lows(bars), closes(bars), volumes(bars)));
    },
  },
  {
    id: "cmf",
    title: "Chaikin money flow",
    summary: "Sum of signed volume over the window, divided by volume.",
    run(bars, params) {
      return plotsFrom(ind.cmf(highs(bars), lows(bars), closes(bars), volumes(bars), pick(params, ["period"])));
    },
  },
  {
    id: "mfi",
    title: "Money flow index",
    summary: "RSI-style ratio of positive to negative typical-price volume.",
    run(bars, params) {
      return plotsFrom(ind.mfi(highs(bars), lows(bars), closes(bars), volumes(bars), pick(params, ["period"])));
    },
  },
  {
    id: "mfm",
    title: "Money flow multiplier",
    summary: "Where the close sits in the bar, from -1 at the low to +1 at the high.",
    run(bars) {
      return plotsFrom(ind.mfm(highs(bars), lows(bars), closes(bars)));
    },
  },
  {
    id: "mfv",
    title: "Money flow volume",
    summary: "Money flow multiplier times volume.",
    run(bars) {
      return plotsFrom(ind.mfv(highs(bars), lows(bars), closes(bars), volumes(bars)));
    },
  },
  {
    id: "emv",
    title: "Ease of movement",
    summary: "How far the median price moved relative to the volume in the bar's range.",
    run(bars, params) {
      return plotsFrom(ind.emv(highs(bars), lows(bars), volumes(bars), pick(params, ["period"])));
    },
  },
  barStudy("fi", "Force index", "Exponential average of the close-to-close change times volume.", (bars, config) => ind.fi(closes(bars), volumes(bars), config), ["period"]),
  {
    id: "kvo",
    title: "Klinger volume oscillator",
    summary: "Difference of a fast and a slow average of volume signed by the bar's trend, plus a signal.",
    run(bars, params) {
      return plotsFrom(ind.kvo(highs(bars), lows(bars), volumes(bars), pick(params, ["shortPeriod", "longPeriod", "signalPeriod"])));
    },
  },
  barStudy("nvi", "Negative volume index", "Cumulative line that changes only on bars where volume fell.", (bars, config) => ind.nvi(closes(bars), volumes(bars), config), ["start", "period"]),
  barStudy("vpt", "Volume price trend", "Running total of volume times the percent change in close.", (bars) => ind.vpt(closes(bars), volumes(bars)), []),
  barStudy("vwap", "Rolling volume weighted average price", "Sum of close times volume, divided by volume, over a rolling window.", (bars, config) => ind.vwap(closes(bars), volumes(bars), config), ["period"]),
  {
    id: "pvo",
    title: "Percentage volume oscillator",
    summary: "Fast volume average minus the slow volume average, as a percent of the slow average.",
    run(bars, params) {
      return plotsFrom(ind.pvo(volumes(bars), pick(params, ["fast", "slow", "signal", "seed"])));
    },
  },
  {
    id: "co",
    title: "Chaikin oscillator",
    summary: "Fast exponential average of accumulation/distribution minus a slow one.",
    run(bars, params) {
      return plotsFrom(ind.co(highs(bars), lows(bars), closes(bars), volumes(bars), pick(params, ["fast", "slow"])));
    },
  },
];

function seriesStudy(
  id: string,
  title: string,
  summary: string,
  fn: (values: number[], config?: Config) => unknown,
  keys: readonly string[],
): Study {
  return {
    id,
    title,
    summary,
    run(bars, params) {
      const config = pick(params, keys);
      const result = keys.length === 0 ? fn(closes(bars)) : fn(closes(bars), config);
      return plotsFrom(result as object);
    },
  };
}

function barStudy(
  id: string,
  title: string,
  summary: string,
  fn: (bars: readonly Bar[], config?: Config) => unknown,
  keys: readonly string[],
): Study {
  return {
    id,
    title,
    summary,
    run(bars, params) {
      const config = pick(params, keys);
      const result = keys.length === 0 ? fn(bars) : fn(bars, config);
      return plotsFrom(result as object);
    },
  };
}

const byId = new Map(studies.map((study) => [study.id, study]));

export function listIndicatorStudies(): readonly Study[] {
  return studies;
}

export function getIndicatorStudy(id: string): Study | undefined {
  return byId.get(id);
}

export function runIndicatorStudy(id: string, bars: readonly Bar[], params?: StudyParams): Plots {
  const study = byId.get(id);
  if (!study) {
    throw new Error(`unknown study: ${id}`);
  }
  const plots = study.run(bars, params);
  for (const series of Object.values(plots)) {
    if (series.length !== bars.length) {
      throw new Error(`${id} returned ${series.length} values for ${bars.length} bars`);
    }
  }
  return plots;
}

export function macdHistogram(macdLine: Series, signalLine: Series): Series {
  return cleanSeries(macdLine.map((value, index) => {
    const signal = signalLine[index];
    if (value == null || signal == null) {
      return Number.NaN;
    }
    return value - signal;
  }));
}
