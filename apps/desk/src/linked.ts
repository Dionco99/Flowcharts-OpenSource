// SPDX-License-Identifier: Apache-2.0

import { AlertLog } from "../../../packages/alerts/src/index.ts";
import { analyzeEdge } from "../../../packages/edge/src/index.ts";
import { PluginHost } from "../../../packages/plugins/src/index.ts";
import { sessionVwapPlugin } from "../../../packages/plugins/examples/session-vwap/src/index.ts";
import { DEFAULT_SETTINGS, lotStepsThatFit, resolvePlan } from "../../../packages/risk/src/index.ts";
import { starterLayout } from "../../../packages/workspace/src/reference.ts";
import type { Minute } from "@flowchart/bars";

const host = new PluginHost();
host.register(sessionVwapPlugin);

export type LinkedReport = {
  workspace: string;
  plugin: string;
  risk: string;
  alerts: string;
  edge: string;
};

function utc(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

/** Browser packages. The journal store and the hosted port stay outside this call. */
export async function linkedReport(minutes: readonly Minute[], cursor: number, ask: string, rs: readonly number[]): Promise<LinkedReport> {
  const layout = starterLayout();
  const closed = minutes.filter((minute) => minute.t + 60_000 <= cursor).slice(-30);
  const bars = closed.map((minute) => ({
    openTime: utc(minute.t),
    closeTime: utc(minute.t + 60_000),
    open: minute.o,
    high: minute.h,
    low: minute.l,
    close: minute.c,
    volume: 1,
  }));
  let plugin = "Session VWAP · no closed bar";
  if (bars.length > 0) {
    const cursorText = utc(cursor);
    const result = host.runIndicator(
      "example.session-vwap",
      {
        spec: {
          symbol: "EURUSD",
          tickSize: "0.00001",
          lotSize: 100_000,
          timezone: "America/New_York",
          sessions: [{ id: "london", name: "London", open: "03:00", close: "12:00" }],
        },
        timeframe: "1m",
        cursor: cursorText,
        bars,
      },
      { session: "london" },
    );
    const values = result.plots.vwap ?? [];
    const last = [...values].reverse().find((value) => value !== null) ?? "—";
    plugin = `Session VWAP ${last}`;
  }

  const entry = Number(ask);
  const plan = resolvePlan(DEFAULT_SETTINGS, {
    id: "desk",
    side: "long",
    entry,
    stopLoss: entry - 0.001,
    openedAt: utc(cursor),
    session: "London",
    setup: "Replay",
    exit: "stop",
  });
  const lossPerLot = DEFAULT_SETTINGS.symbol.lotSize * (plan.stopDistance + DEFAULT_SETTINGS.spread) + DEFAULT_SETTINGS.commissionPerLot;
  const steps = lotStepsThatFit(DEFAULT_SETTINGS.accountSize * DEFAULT_SETTINGS.riskPerTrade, lossPerLot, DEFAULT_SETTINGS.symbol.lotStep);
  const lots = (steps * DEFAULT_SETTINGS.symbol.lotStep).toFixed(2);

  const log = new AlertLog();
  let alerts = "0 alerts";
  if (bars.length > 0) {
    log.arm({
      symbol: "EURUSD",
      name: "Close above zero",
      armedAt: bars[0].openTime,
      once: true,
      rule: { type: "compare", left: { kind: "price", source: "close" }, op: "gt", right: { kind: "level", value: "0.00001" } },
    });
    const fired = await log.advance(
      [{ symbol: "EURUSD", bars: bars.map((bar) => ({ ...bar, volume: "1" })) }],
      utc(cursor),
    );
    alerts = `${fired.length} local`;
  }

  let edge = "no closed R";
  if (rs.length >= 2) {
    const report = analyzeEdge(rs, { horizon: Math.min(rs.length, 20), paths: 20, startingR: 10, ruinAt: 0, seed: 20240602, chartPaths: 0 });
    edge = `${report.stats.trades} trades`;
  }

  return {
    workspace: `${layout.name} · ${layout.symbol} · ${layout.period}`,
    plugin,
    risk: `${lots} lots at 1%`,
    alerts,
    edge,
  };
}
