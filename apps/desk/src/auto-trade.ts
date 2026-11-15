// SPDX-License-Identifier: Apache-2.0

import type { MarketWindow } from "@flowchart/bars";
import type { BrokerPort, StrategyRunner } from "@flowchart/orders";
import type { ScriptIntent } from "./script-study.ts";

/**
 * Opt-in replay ticket for Flowchart Script intents.
 * The port is the replay fill adapter. This module does not open a broker.
 */
export function replayScriptStrategy(enabled: boolean, intents: readonly ScriptIntent[]): StrategyRunner | null {
  if (!enabled) return null;
  const byTime = new Map<number, ScriptIntent[]>();
  for (const intent of intents) {
    const list = byTime.get(intent.time);
    if (list) list.push(intent);
    else byTime.set(intent.time, [intent]);
  }
  return {
    reset() {},
    onBar(window: MarketWindow, port: BrokerPort) {
      const bar = window.bars[window.bars.length - 1];
      if (!bar) return;
      const due = byTime.get(bar.t);
      if (!due) return;
      for (const intent of due) submitIntent(intent, port);
    },
  };
}

function submitIntent(intent: ScriptIntent, port: BrokerPort) {
  const open = Number(port.snapshot().position.lots);
  if (intent.side === "flat") {
    if (Math.abs(open) >= 0.005) port.close();
    return;
  }
  const side = intent.side === "long" ? "buy" : "sell";
  const same = (side === "buy" && open > 0.005) || (side === "sell" && open < -0.005);
  if (same) return;
  if ((side === "buy" && open < -0.005) || (side === "sell" && open > 0.005)) port.close();
  if (Math.abs(Number(port.snapshot().position.lots)) >= 0.005) return;
  const lots = Math.round(intent.lots * 100) / 100;
  if (!(lots >= 0.01)) return;
  port.place({ side, type: "market", lots: lots.toFixed(2) });
}
