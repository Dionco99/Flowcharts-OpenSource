// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { MinuteBar, Side, SymbolSpec } from "./types.ts";

export function parseTime(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function decimalPlaces(step: number): number {
  const text = step.toString().toLowerCase();
  const exp = text.indexOf("e-");
  if (exp !== -1) {
    const mantissa = text.slice(0, exp).replace("-", "").replace(".", "");
    const extra = mantissa.length > 1 ? mantissa.length - 1 : 0;
    return Number(text.slice(exp + 2)) + extra;
  }
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function isOnTick(price: unknown, tickSize: number): price is number {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return false;
  const ticks = price / tickSize;
  return Math.abs(ticks - Math.round(ticks)) < 1e-4;
}

export function priceToTicks(price: number, tickSize: number): number {
  return Math.round(price / tickSize);
}

export function ticksToPrice(ticks: number, tickSize: number): number {
  return Number((ticks * tickSize).toFixed(decimalPlaces(tickSize)));
}

export function roundMoney(amount: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(amount * factor) / factor;
}

export function isValidLots(lots: unknown, lotStep: number): lots is number {
  if (typeof lots !== "number" || !Number.isFinite(lots) || lots <= 0) return false;
  const steps = lots / lotStep;
  return Math.abs(steps - Math.round(steps)) < 1e-4;
}

export function lotsToSteps(lots: number, lotStep: number): number {
  return Math.round(lots / lotStep);
}

export function stepsToLots(steps: number, lotStep: number): number {
  return Number((steps * lotStep).toFixed(decimalPlaces(lotStep)));
}

/** Half the spread, rounded to a tick against the trader. Bars are mid. */
export function applySpread(
  reference: number,
  side: Side,
  spread: number,
  tickSize: number,
): { referencePrice: number; price: number; spreadCost: number } {
  const refTicks = priceToTicks(reference, tickSize);
  const half = spread / 2 / tickSize;
  const execTicks =
    side === "buy" ? Math.ceil(refTicks + half - 1e-9) : Math.floor(refTicks - half + 1e-9);
  return {
    referencePrice: ticksToPrice(refTicks, tickSize),
    price: ticksToPrice(execTicks, tickSize),
    spreadCost: ticksToPrice(Math.abs(execTicks - refTicks), tickSize),
  };
}

/**
 * Quote-currency P&L for `closedSteps` of a position.
 * `entryTickSteps` is the ledger slice being closed (execution ticks × lot steps).
 */
export function pnlFromTickSteps(
  positionSide: "long" | "short",
  entryTickSteps: number,
  exitTicks: number,
  closedSteps: number,
  spec: SymbolSpec,
  moneyDecimals: number,
): number {
  const diff =
    positionSide === "long"
      ? exitTicks * closedSteps - entryTickSteps
      : entryTickSteps - exitTicks * closedSteps;
  const amount = diff * spec.tickSize * spec.lotStep * spec.lotSize;
  return roundMoney(amount, moneyDecimals);
}

export function averagePriceFromLedger(
  entryTickSteps: number,
  lotSteps: number,
  tickSize: number,
): number {
  if (lotSteps === 0) return 0;
  return roundMoney((entryTickSteps / lotSteps) * tickSize, 10);
}

export function barError(bar: MinuteBar, tickSize: number): string | null {
  if (bar === null || typeof bar !== "object") return "Bar is missing.";
  const openMs = parseTime(bar.openTime);
  const closeMs = parseTime(bar.closeTime);
  if (openMs === null || closeMs === null) return "Bar times are not valid timestamps.";
  if (openMs >= closeMs) return "Bar open time must be before its close time.";
  const prices: Array<[string, unknown]> = [
    ["open", bar.open],
    ["high", bar.high],
    ["low", bar.low],
    ["close", bar.close],
  ];
  for (const [label, price] of prices) {
    if (!isOnTick(price, tickSize)) {
      return `Bar ${label} is not a positive price on the tick grid.`;
    }
  }
  const open = priceToTicks(bar.open, tickSize);
  const high = priceToTicks(bar.high, tickSize);
  const low = priceToTicks(bar.low, tickSize);
  const close = priceToTicks(bar.close, tickSize);
  if (high < low || high < Math.max(open, close) || low > Math.min(open, close)) {
    return "Bar high and low do not contain the open and close.";
  }
  return null;
}

/**
 * Protective levels are mid prices. A gap open already through one level
 * fills that level at the open. If the open is between them and the minute
 * trades through both, the fill is the stop and `ambiguous` is set.
 * That minute is not awarded as a target.
 */
export function matchProtection(
  side: "long" | "short",
  stopLoss: number | null,
  takeProfit: number | null,
  bar: MinuteBar,
  tickSize: number,
): { referencePrice: number; reason: "stop_loss" | "take_profit"; ambiguous: boolean } | null {
  if (stopLoss === null && takeProfit === null) return null;
  const open = priceToTicks(bar.open, tickSize);
  const high = priceToTicks(bar.high, tickSize);
  const low = priceToTicks(bar.low, tickSize);
  const sl = stopLoss === null ? null : priceToTicks(stopLoss, tickSize);
  const tp = takeProfit === null ? null : priceToTicks(takeProfit, tickSize);
  const hit = (
    ticks: number,
    reason: "stop_loss" | "take_profit",
    ambiguous: boolean,
  ) => ({
    referencePrice: ticksToPrice(ticks, tickSize),
    reason,
    ambiguous,
  });

  if (side === "long") {
    const gapStop = sl !== null && open <= sl;
    const gapTarget = tp !== null && open >= tp;
    const stopHit = sl !== null && low <= sl;
    const targetHit = tp !== null && high >= tp;
    if (gapStop && sl !== null) return hit(open, "stop_loss", false);
    if (gapTarget && tp !== null) return hit(open, "take_profit", false);
    if (stopHit && targetHit && sl !== null) return hit(sl, "stop_loss", true);
    if (stopHit && sl !== null) return hit(sl, "stop_loss", false);
    if (targetHit && tp !== null) return hit(tp, "take_profit", false);
    return null;
  }

  const gapStop = sl !== null && open >= sl;
  const gapTarget = tp !== null && open <= tp;
  const stopHit = sl !== null && high >= sl;
  const targetHit = tp !== null && low <= tp;
  if (gapStop && sl !== null) return hit(open, "stop_loss", false);
  if (gapTarget && tp !== null) return hit(open, "take_profit", false);
  if (stopHit && targetHit && sl !== null) return hit(sl, "stop_loss", true);
  if (stopHit && sl !== null) return hit(sl, "stop_loss", false);
  if (targetHit && tp !== null) return hit(tp, "take_profit", false);
  return null;
}

/** Resting limit or stop against a newly completed minute. Null if it does not trigger. */
export function matchRestingOrder(
  type: "limit" | "stop",
  side: Side,
  level: number,
  bar: MinuteBar,
  tickSize: number,
): { referencePrice: number } | null {
  const open = priceToTicks(bar.open, tickSize);
  const high = priceToTicks(bar.high, tickSize);
  const low = priceToTicks(bar.low, tickSize);
  const price = priceToTicks(level, tickSize);
  const at = (ticks: number) => ({ referencePrice: ticksToPrice(ticks, tickSize) });

  if (type === "limit" && side === "buy") {
    if (low > price) return null;
    return at(open <= price ? open : price);
  }
  if (type === "limit" && side === "sell") {
    if (high < price) return null;
    return at(open >= price ? open : price);
  }
  if (type === "stop" && side === "buy") {
    if (high < price) return null;
    return at(open >= price ? open : price);
  }
  if (low > price) return null;
  return at(open <= price ? open : price);
}

/**
 * A marketable order fills at the last completed close, not at that bar's wick.
 * Returns null when the order must rest for a later minute.
 */
export function marketableReference(
  type: "market" | "limit" | "stop",
  side: Side,
  level: number | null,
  close: number,
  tickSize: number,
): number | null {
  const closeTicks = priceToTicks(close, tickSize);
  if (type === "market") return ticksToPrice(closeTicks, tickSize);
  if (level === null) return null;
  const levelTicks = priceToTicks(level, tickSize);
  const crossed =
    type === "limit"
      ? side === "buy"
        ? levelTicks >= closeTicks
        : levelTicks <= closeTicks
      : side === "buy"
        ? levelTicks <= closeTicks
        : levelTicks >= closeTicks;
  return crossed ? ticksToPrice(closeTicks, tickSize) : null;
}

/** Levels are mid prices and must sit strictly on the profitable side of `reference`. */
export function protectionError(
  direction: "long" | "short",
  reference: number,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
  tickSize: number,
): string | null {
  const ref = priceToTicks(reference, tickSize);
  if (stopLoss != null) {
    if (!isOnTick(stopLoss, tickSize)) return "Stop loss is not a positive price on the tick grid.";
    const sl = priceToTicks(stopLoss, tickSize);
    if (direction === "long" && sl >= ref) return "A long stop loss must be below the reference price.";
    if (direction === "short" && sl <= ref) return "A short stop loss must be above the reference price.";
  }
  if (takeProfit != null) {
    if (!isOnTick(takeProfit, tickSize)) return "Take profit is not a positive price on the tick grid.";
    const tp = priceToTicks(takeProfit, tickSize);
    if (direction === "long" && tp <= ref) return "A long take profit must be above the reference price.";
    if (direction === "short" && tp >= ref) return "A short take profit must be below the reference price.";
  }
  return null;
}
