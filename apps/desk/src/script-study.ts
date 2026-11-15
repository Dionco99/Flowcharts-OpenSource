// SPDX-License-Identifier: Apache-2.0

import { aggregate, type Minute, type Timeframe } from "@flowchart/bars";
import { run, ScriptError, type Bar as ScriptBar } from "flowchart-script";

export type ScriptPlot = {
  label: string;
  last: number | null;
};

export type ScriptIntent = {
  /** Bar open, UTC milliseconds. */
  time: number;
  side: "long" | "short" | "flat";
  lots: number;
};

export type ScriptReport = {
  name: string;
  bars: number;
  plots: ScriptPlot[];
  position: "long" | "short" | "flat";
  lots: number;
  alerts: number;
  lastAlert: string | null;
  orders: number;
  intents: ScriptIntent[];
  error: string | null;
};

function lastValue(values: ReadonlyArray<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value !== null) return value;
  }
  return null;
}

/** Closed bars only. A forming bar, or one whose close is after the cursor, stays out. */
export function closedScriptBars(minutes: readonly Minute[], timeframe: Timeframe, cursor: number): ScriptBar[] {
  return aggregate(minutes, timeframe, cursor)
    .filter((bar) => !bar.partial && bar.ct <= cursor)
    .map((bar) => ({
      open: Number(bar.o),
      high: Number(bar.h),
      low: Number(bar.l),
      close: Number(bar.c),
      volume: 0,
      time: new Date(bar.t).toISOString(),
    }));
}

function intentsOf(orders: { time?: string; side: "long" | "short" | "flat"; lots: number }[]): ScriptIntent[] {
  const intents: ScriptIntent[] = [];
  for (const order of orders) {
    if (!order.time) continue;
    const time = Date.parse(order.time);
    if (!Number.isFinite(time)) continue;
    intents.push({ time, side: order.side, lots: order.lots });
  }
  return intents;
}

/**
 * Run a Flowchart Script over the sealed window.
 * The result's orders are intents. This function does not call a broker.
 */
export function scriptOnClosedBars(
  source: string,
  minutes: readonly Minute[],
  timeframe: Timeframe,
  cursor: number,
): ScriptReport {
  const bars = closedScriptBars(minutes, timeframe, cursor);
  try {
    const result = run(source, bars);
    return {
      name: result.name,
      bars: bars.length,
      plots: result.plots.map((plot) => ({ label: plot.label, last: lastValue(plot.values) })),
      position: result.position.side,
      lots: result.position.lots,
      alerts: result.alerts.length,
      lastAlert: result.alerts.at(-1)?.message ?? null,
      orders: result.orders.length,
      intents: intentsOf(result.orders),
      error: null,
    };
  } catch (error) {
    const message = error instanceof ScriptError ? error.message : "Script did not run.";
    return {
      name: "script",
      bars: bars.length,
      plots: [],
      position: "flat",
      lots: 0,
      alerts: 0,
      lastAlert: null,
      orders: 0,
      intents: [],
      error: message,
    };
  }
}
