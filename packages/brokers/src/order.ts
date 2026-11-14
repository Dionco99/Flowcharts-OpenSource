// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { assertDecimal, isPositive } from "./decimal.ts";
import { BrokerError } from "./errors.ts";

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";
export type FillReason = "market" | "limit" | "stop" | "stop_loss" | "take_profit" | "close";

export interface PlaceOrder {
  clientOrderId: string;
  side: Side;
  type: OrderType;
  lots: string;
  limitPrice?: string | null;
  stopPrice?: string | null;
  stopLoss?: string | null;
  takeProfit?: string | null;
  /** Live orders send only when this is exactly true. Defaults to false. */
  confirmRealMoney?: boolean;
}

export interface NormalizedOrder {
  clientOrderId: string;
  side: Side;
  type: OrderType;
  lots: string;
  limitPrice: string | null;
  stopPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
  confirmRealMoney: boolean;
}

export function normalizeOrder(order: PlaceOrder): NormalizedOrder {
  if (typeof order.clientOrderId !== "string" || order.clientOrderId.trim() === "" || order.clientOrderId.length > 64) {
    throw new BrokerError("invalid_order", "clientOrderId must be 1 to 64 characters.");
  }
  if (order.side !== "buy" && order.side !== "sell") throw new BrokerError("invalid_order", "Side must be buy or sell.");
  if (order.type !== "market" && order.type !== "limit" && order.type !== "stop") {
    throw new BrokerError("invalid_order", "Type must be market, limit, or stop.");
  }
  assertDecimal(order.lots, "lots");
  if (!isPositive(order.lots)) throw new BrokerError("invalid_size", "Lots must be positive.");
  const limitPrice = optionalPrice(order.limitPrice, "limitPrice");
  const stopPrice = optionalPrice(order.stopPrice, "stopPrice");
  const stopLoss = optionalPrice(order.stopLoss, "stopLoss");
  const takeProfit = optionalPrice(order.takeProfit, "takeProfit");
  if (order.type === "market" && (limitPrice || stopPrice)) {
    throw new BrokerError("invalid_order", "A market order takes no limit or stop price.");
  }
  if (order.type === "limit" && (!limitPrice || stopPrice)) {
    throw new BrokerError("invalid_order", "A limit order takes only a limit price.");
  }
  if (order.type === "stop" && (!stopPrice || limitPrice)) {
    throw new BrokerError("invalid_order", "A stop order takes only a stop price.");
  }
  return {
    clientOrderId: order.clientOrderId,
    side: order.side,
    type: order.type,
    lots: order.lots,
    limitPrice,
    stopPrice,
    stopLoss,
    takeProfit,
    confirmRealMoney: order.confirmRealMoney === true,
  };
}

function optionalPrice(value: string | null | undefined, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  assertDecimal(value, label);
  if (!isPositive(value)) throw new BrokerError("invalid_order", `${label} must be positive.`);
  return value;
}
