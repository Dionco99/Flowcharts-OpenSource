// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { add, cmp, div, min, mul, neg, sub } from "./decimal.ts";
import type { Side } from "./order.ts";

export interface Position {
  side: "long" | "short" | "flat";
  lots: string;
  averagePrice: string | null;
}

export function flatPosition(): Position {
  return { side: "flat", lots: "0", averagePrice: null };
}

/** Price P&L on the closed lots, minus the fill commission. An opening fill is minus the commission. */
export function realizedForFill(
  position: Position,
  side: Side,
  lots: string,
  price: string,
  commission: string,
  lotSize: string,
): string {
  const direction = side === "buy" ? "long" : "short";
  if (position.side === "flat" || position.side === direction || position.averagePrice === null) {
    return neg(commission);
  }
  const closing = min(lots, position.lots);
  const diff = position.side === "long" ? sub(price, position.averagePrice) : sub(position.averagePrice, price);
  return sub(mul(mul(diff, closing), lotSize), commission);
}

export function applyFill(position: Position, side: Side, lots: string, price: string): Position {
  const direction = side === "buy" ? "long" : "short";
  if (position.side === "flat" || position.lots === "0") {
    return { side: direction, lots, averagePrice: price };
  }
  if (position.side === direction && position.averagePrice !== null) {
    const nextLots = add(position.lots, lots);
    const weighted = add(mul(position.averagePrice, position.lots), mul(price, lots));
    return { side: direction, lots: nextLots, averagePrice: div(weighted, nextLots) };
  }
  if (cmp(lots, position.lots) < 0) {
    return { side: position.side, lots: sub(position.lots, lots), averagePrice: position.averagePrice };
  }
  if (cmp(lots, position.lots) === 0) return flatPosition();
  return { side: direction, lots: sub(lots, position.lots), averagePrice: price };
}
