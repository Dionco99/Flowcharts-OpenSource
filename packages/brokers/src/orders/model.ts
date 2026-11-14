// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { assertNoNewlines, assertPositiveDecimal } from "./decimal.js";
import { OrderRejected, ProtectionNotSupported } from "./errors.js";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TimeInForce = "gtc" | "ioc" | "fok" | "day";

export interface OrderPrices {
  /** Limit price for `limit` and `stop_limit`. */
  limit?: string;
  /** Trigger price for `stop` and `stop_limit`. */
  stop?: string;
}

export interface ProtectionLevel {
  price: string;
}

/** Attached exits. Venues that cannot attach these report it on `VenueCapabilities`. */
export interface OrderProtections {
  stopLoss?: ProtectionLevel;
  takeProfit?: ProtectionLevel;
}

export interface OrderIntent {
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: string;
  prices?: OrderPrices;
  protections?: OrderProtections;
  timeInForce?: TimeInForce;
}

export type Placement = "demo" | "refused" | "stub" | "interface" | "local";

export interface VenueCapabilities {
  attachStopLoss: boolean;
  attachTakeProfit: boolean;
  /** Order types where an attached stop or target is sent. Empty hides both in the UI. */
  protectionsOn: readonly OrderType[];
  oauth: boolean;
  placement: Placement;
}

export interface ProtectionVisibility {
  stopLoss: boolean;
  takeProfit: boolean;
}

/** UI hook: hide a protection control when this returns false. */
export function protectionsVisible(
  caps: Pick<VenueCapabilities, "attachStopLoss" | "attachTakeProfit" | "protectionsOn">,
  type: OrderType,
): ProtectionVisibility {
  const onType = caps.protectionsOn.includes(type);
  return {
    stopLoss: caps.attachStopLoss && onType,
    takeProfit: caps.attachTakeProfit && onType,
  };
}

const CLIENT_ID = /^[A-Za-z0-9._:-]{1,64}$/;
const SIDES = new Set<OrderSide>(["buy", "sell"]);
const TYPES = new Set<OrderType>(["market", "limit", "stop", "stop_limit"]);

export function validateOrder(order: OrderIntent): void {
  if (!CLIENT_ID.test(order.clientOrderId)) {
    throw new OrderRejected("clientOrderId must be 1-64 characters of letters, digits, or . _ : -");
  }
  assertNoNewlines(order.symbol, "symbol");
  if (order.symbol.trim().length === 0) {
    throw new OrderRejected("symbol is required");
  }
  if (!SIDES.has(order.side)) {
    throw new OrderRejected("side must be buy or sell");
  }
  if (!TYPES.has(order.type)) {
    throw new OrderRejected("type must be market, limit, stop, or stop_limit");
  }
  assertPositiveDecimal(order.qty, "qty");
  if (order.type === "limit" || order.type === "stop_limit") {
    assertPositiveDecimal(order.prices?.limit ?? "", "prices.limit");
  }
  if (order.type === "stop" || order.type === "stop_limit") {
    assertPositiveDecimal(order.prices?.stop ?? "", "prices.stop");
  }
  if (order.protections?.stopLoss) {
    assertPositiveDecimal(order.protections.stopLoss.price, "protections.stopLoss.price");
  }
  if (order.protections?.takeProfit) {
    assertPositiveDecimal(order.protections.takeProfit.price, "protections.takeProfit.price");
  }
}

export function assertProtectionsAllowed(order: OrderIntent, caps: VenueCapabilities): void {
  const visible = protectionsVisible(caps, order.type);
  if (order.protections?.stopLoss && !visible.stopLoss) {
    throw new ProtectionNotSupported(
      `${order.type} orders cannot attach protections.stopLoss on this venue. Hide the control.`,
    );
  }
  if (order.protections?.takeProfit && !visible.takeProfit) {
    throw new ProtectionNotSupported(
      `${order.type} orders cannot attach protections.takeProfit on this venue. Hide the control.`,
    );
  }
}
