// SPDX-License-Identifier: Apache-2.0

import { RiskError } from "./errors.js";
import {
  assertSettings,
  currencyPnl,
  decimalPlaces,
  fills,
  lotStepsThatFit,
  resolvePlan,
  weekdayOf,
} from "./sizing.js";

function quantizeLots(steps: number, lotStep: number): number {
  const places = Math.min(8, Math.max(0, decimalPlaces(lotStep)));
  return Number((steps * lotStep).toFixed(places));
}
import { summarize } from "./stats.js";
import type { AccountReport, ClosedTrade, RiskSettings, SkippedTrade, TradePlan } from "./types.js";

/**
 * Size each plan from the balance at entry, settle it, and walk the balance forward.
 * Plans are ordered by open time. Stage 1 keeps a single net position, so the next
 * trade is sized only after the previous one has closed.
 */
export function simulate(settings: RiskSettings, plans: readonly TradePlan[]): AccountReport {
  assertSettings(settings);
  const skipped: SkippedTrade[] = [];
  const ordered: { plan: TradePlan; time: number }[] = [];
  for (const plan of plans) {
    const time = Date.parse(plan.openedAt);
    if (Number.isNaN(time)) {
      skipped.push({ id: plan.id, reason: "Open time must be an ISO timestamp." });
      continue;
    }
    ordered.push({ plan, time });
  }
  ordered.sort((a, b) => a.time - b.time || a.plan.id.localeCompare(b.plan.id));

  let balance = settings.accountSize;
  const trades: ClosedTrade[] = [];
  for (const { plan } of ordered) {
    try {
      const closed = settleTrade(settings, plan, balance);
      balance = closed.balanceAfter;
      trades.push(closed);
    } catch (error) {
      if (error instanceof RiskError) {
        skipped.push({ id: plan.id, reason: error.message });
        continue;
      }
      throw error;
    }
  }

  const { equity, stats } = summarize(trades, settings.accountSize);
  return {
    settings,
    startingBalance: settings.accountSize,
    balance,
    netPnl: balance - settings.accountSize,
    trades,
    skipped,
    equity,
    stats,
  };
}

/** Size and settle one trade against a known balance. Throws RiskError when it cannot. */
export function settleTrade(
  settings: RiskSettings,
  plan: TradePlan,
  balance: number,
): ClosedTrade {
  assertSettings(settings);
  if (!Number.isFinite(balance) || !(balance > 0)) {
    throw new RiskError("flat", "Balance is empty, so the next trade has no risk budget.");
  }
  const resolved = resolvePlan(settings, plan);
  const riskBudget = balance * settings.riskPerTrade;
  const { symbol } = settings;
  const lossPerLot =
    symbol.lotSize * (resolved.stopDistance + settings.spread) + settings.commissionPerLot;
  let steps = lotStepsThatFit(riskBudget, lossPerLot, symbol.lotStep);
  let lots = 0;
  let units = 0;
  let commission = 0;
  let riskCurrency = 0;
  while (steps > 0) {
    lots = quantizeLots(steps, symbol.lotStep);
    units = lots * symbol.lotSize;
    commission = lots * settings.commissionPerLot;
    riskCurrency = -currencyPnl(
      resolved.side,
      resolved.entry,
      resolved.stopLoss,
      settings.spread,
      units,
      commission,
    );
    if (riskCurrency > 0 && riskCurrency <= riskBudget + 1e-6) break;
    steps -= 1;
  }
  if (steps <= 0 || !(riskCurrency > 0)) {
    throw new RiskError("min_lot", "Risk budget is smaller than the minimum lot.");
  }
  const pnlCurrency = currencyPnl(
    resolved.side,
    resolved.entry,
    resolved.exitPrice,
    settings.spread,
    units,
    commission,
  );
  const fill = fills(resolved.side, resolved.entry, resolved.exitPrice, settings.spread);
  const move =
    resolved.side === "long"
      ? resolved.exitPrice - resolved.entry
      : resolved.entry - resolved.exitPrice;
  return {
    id: plan.id,
    side: resolved.side,
    entry: resolved.entry,
    stopLoss: resolved.stopLoss,
    takeProfit: resolved.takeProfit,
    openedAt: plan.openedAt,
    session: plan.session,
    setup: plan.setup,
    weekday: weekdayOf(plan.openedAt),
    exit: resolved.exit,
    exitPrice: resolved.exitPrice,
    fillEntry: fill.fillEntry,
    fillExit: fill.fillExit,
    lots,
    units,
    balanceBefore: balance,
    riskCurrency,
    commission,
    spreadCost: units * settings.spread,
    pnlCurrency,
    rMultiple: pnlCurrency / riskCurrency,
    plannedRR: Math.abs(resolved.takeProfit - resolved.entry) / resolved.stopDistance,
    achievedRR: move / resolved.stopDistance,
    balanceAfter: balance + pnlCurrency,
  };
}
