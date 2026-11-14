// SPDX-License-Identifier: Apache-2.0

import { roundLots, roundTick, type Position, type Side } from "./numeric";

export function flatPosition(): Position {
  return { lots: 0, avgPrice: 0 };
}

export function applyFill(
  pos: Position,
  side: Side,
  lots: number,
  price: number,
  lotSize: number,
): { position: Position; realized: number } {
  const qty = roundLots(lots);
  const dir = side === "buy" ? 1 : -1;
  const signed = dir * qty;
  if (pos.lots === 0 || Math.sign(pos.lots) === dir) {
    const nextLots = roundLots(pos.lots + signed);
    const avg = (Math.abs(pos.lots) * pos.avgPrice + qty * price) / Math.abs(nextLots);
    return { position: { lots: nextLots, avgPrice: avg }, realized: 0 };
  }
  const closing = Math.min(qty, Math.abs(pos.lots));
  const perUnit = pos.lots > 0 ? price - pos.avgPrice : pos.avgPrice - price;
  const realized = perUnit * closing * lotSize;
  const leftover = roundLots(qty - closing);
  if (leftover <= 0) {
    const nextLots = roundLots(pos.lots + signed);
    return {
      position: {
        lots: Math.abs(nextLots) < 0.005 ? 0 : nextLots,
        avgPrice: Math.abs(nextLots) < 0.005 ? 0 : pos.avgPrice,
      },
      realized,
    };
  }
  return { position: { lots: dir * leftover, avgPrice: price }, realized };
}

export function markToMarket(pos: Position, bid: number, spread: number, lotSize: number): number {
  if (Math.abs(pos.lots) < 0.005) return 0;
  if (pos.lots > 0) return (bid - pos.avgPrice) * pos.lots * lotSize;
  return (pos.avgPrice - (bid + spread)) * Math.abs(pos.lots) * lotSize;
}

export function executionBid(side: Side, type: "market" | "limit" | "stop", price: number, minute: { o: number; h: number; l: number; c: number }, tick: number): number {
  if (type === "market") return roundTick(minute.c, tick);
  if (type === "limit") {
    if (side === "buy") return roundTick(minute.o <= price ? minute.o : price, tick);
    return roundTick(minute.o >= price ? minute.o : price, tick);
  }
  if (side === "sell") return roundTick(minute.o <= price ? minute.o : price, tick);
  return roundTick(minute.o >= price ? minute.o : price, tick);
}

export function minuteTriggers(side: Side, type: "limit" | "stop", price: number, minute: { h: number; l: number }): boolean {
  if (type === "limit" && side === "buy") return minute.l <= price;
  if (type === "limit" && side === "sell") return minute.h >= price;
  if (type === "stop" && side === "buy") return minute.h >= price;
  return minute.l <= price;
}
