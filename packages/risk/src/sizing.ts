// SPDX-License-Identifier: Apache-2.0

/**
 * Chart prices are the bid.
 * A long buys the ask, so the entry fill is the chart price plus the spread,
 * and the exit fill is the chart price. A short sells the bid and buys back
 * the ask, so the exit fill is the chart price plus the spread.
 * One R is the currency lost if that stop fills, including spread and commission.
 * Lot size is floored to the lot step so the trade never risks more than the budget.
 */

import { RiskError } from "./errors.js";
import type { ExitKind, RiskSettings, Side, SymbolSpec, TradePlan } from "./types.js";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function assertSettings(settings: RiskSettings): void {
  requireNumber("Account size", settings.accountSize, "invalid_settings", true);
  if (!(settings.riskPerTrade > 0) || settings.riskPerTrade > 1) {
    throw new RiskError(
      "invalid_settings",
      "Risk per trade must be greater than 0 and at most 1.",
    );
  }
  requireNumber("Default RR", settings.defaultRR, "invalid_settings", true);
  requireNumber("Commission", settings.commissionPerLot, "invalid_settings", false);
  requireNumber("Spread", settings.spread, "invalid_settings", false);
  assertSymbol(settings.symbol);
}

export function weekdayOf(openedAt: string): string {
  const time = Date.parse(openedAt);
  if (Number.isNaN(time)) {
    throw new RiskError("invalid_time", "Open time must be an ISO timestamp.");
  }
  return WEEKDAYS[new Date(time).getUTCDay()] ?? "Sunday";
}

export function lotStepsThatFit(
  riskBudget: number,
  lossPerLot: number,
  lotStep: number,
): number {
  const lossPerStep = lossPerLot * lotStep;
  if (!(riskBudget > 0) || !(lossPerStep > 0) || !Number.isFinite(lossPerStep)) {
    return 0;
  }
  // A hair of tolerance keeps a budget that lands on a step from flooring short.
  let steps = Math.floor((riskBudget + lossPerStep * 1e-9) / lossPerStep);
  if (steps * lossPerStep > riskBudget + 1e-6) {
    steps -= 1;
  }
  return steps > 0 ? steps : 0;
}

export function decimalPlaces(step: number): number {
  const text = step.toString().toLowerCase();
  if (text.includes("e-")) {
    const [base, exp] = text.split("e-");
    const basePlaces = base?.includes(".") ? (base.split(".")[1]?.length ?? 0) : 0;
    return basePlaces + Number(exp);
  }
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

export interface ResolvedPlan {
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  exit: ExitKind;
  exitPrice: number;
  stopDistance: number;
}

export function resolvePlan(settings: RiskSettings, plan: TradePlan): ResolvedPlan {
  if (plan.side !== "long" && plan.side !== "short") {
    throw new RiskError("invalid_side", "Side must be long or short.");
  }
  if (plan.exit !== "stop" && plan.exit !== "target" && plan.exit !== "manual") {
    throw new RiskError("invalid_exit", "Exit must be stop, target, or manual.");
  }
  requireNumber("Entry", plan.entry, "invalid_prices", true);
  requireNumber("Stop", plan.stopLoss, "invalid_prices", true);
  const stopDistance =
    plan.side === "long" ? plan.entry - plan.stopLoss : plan.stopLoss - plan.entry;
  if (!(stopDistance > 0)) {
    throw new RiskError(
      "invalid_prices",
      plan.side === "long"
        ? "Long stop belongs below the entry."
        : "Short stop belongs above the entry.",
    );
  }
  const takeProfit =
    plan.takeProfit === undefined
      ? plan.side === "long"
        ? plan.entry + settings.defaultRR * stopDistance
        : plan.entry - settings.defaultRR * stopDistance
      : plan.takeProfit;
  requireNumber("Target", takeProfit, "invalid_prices", true);
  const reward = plan.side === "long" ? takeProfit - plan.entry : plan.entry - takeProfit;
  if (!(reward > 0)) {
    throw new RiskError(
      "invalid_prices",
      plan.side === "long"
        ? "Long target belongs above the entry."
        : "Short target belongs below the entry.",
    );
  }
  let exitPrice: number;
  if (plan.exit === "stop") {
    exitPrice = plan.stopLoss;
  } else if (plan.exit === "target") {
    exitPrice = takeProfit;
  } else if (plan.exitPrice === undefined) {
    throw new RiskError("invalid_prices", "A manual exit needs an exit price.");
  } else {
    requireNumber("Exit", plan.exitPrice, "invalid_prices", true);
    exitPrice = plan.exitPrice;
  }
  return {
    side: plan.side,
    entry: plan.entry,
    stopLoss: plan.stopLoss,
    takeProfit,
    exit: plan.exit,
    exitPrice,
    stopDistance,
  };
}

export interface Fill {
  fillEntry: number;
  fillExit: number;
}

export function fills(side: Side, entry: number, exitPrice: number, spread: number): Fill {
  if (side === "long") {
    return { fillEntry: entry + spread, fillExit: exitPrice };
  }
  return { fillEntry: entry, fillExit: exitPrice + spread };
}

/** Currency P&L for a filled trade. Commission is the round-turn cost already scaled by lots. */
export function currencyPnl(
  side: Side,
  entry: number,
  exitPrice: number,
  spread: number,
  units: number,
  commission: number,
): number {
  const fill = fills(side, entry, exitPrice, spread);
  const perUnit = side === "long" ? fill.fillExit - fill.fillEntry : fill.fillEntry - fill.fillExit;
  return perUnit * units - commission;
}

function assertSymbol(symbol: SymbolSpec): void {
  requireNumber("Lot size", symbol.lotSize, "invalid_settings", true);
  requireNumber("Lot step", symbol.lotStep, "invalid_settings", true);
  requireNumber("Tick size", symbol.tickSize, "invalid_settings", true);
}

function requireNumber(label: string, value: number, code: string, positive: boolean): void {
  const ok = positive ? Number.isFinite(value) && value > 0 : Number.isFinite(value) && value >= 0;
  if (!ok) {
    throw new RiskError(
      code,
      positive
        ? `${label} must be a positive number.`
        : `${label} must be zero or a positive number.`,
    );
  }
}
