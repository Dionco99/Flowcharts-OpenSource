// SPDX-License-Identifier: Apache-2.0

import type { Window } from "./window.js";

/**
 * The calls a strategy may make. `packages/orders` owns the records and the
 * replay fill adapter. `packages/brokers` owns venue adapters. A strategy
 * package only sees this port.
 */
export interface BrokerPort {
  place(order: PlaceOrder): unknown;
  modify(orderId: string, patch: OrderPatch): unknown;
  cancel(orderId: string): unknown;
  close(request: CloseRequest): unknown;
  modifyProtection(patch: ProtectionPatch): unknown;
  snapshot(): unknown;
}

export interface PlaceOrder {
  readonly clientOrderId: string;
  readonly side: "buy" | "sell";
  readonly type: "market" | "limit" | "stop";
  /** Decimal string. A positive multiple of the symbol lot step. */
  readonly lots: string;
  readonly limitPrice?: string;
  readonly stopPrice?: string;
  /** Decimal string, or null to clear. Omitted leaves the position level alone. */
  readonly stopLoss?: string | null;
  readonly takeProfit?: string | null;
}

export interface OrderPatch {
  readonly lots?: string;
  readonly limitPrice?: string;
  readonly stopPrice?: string;
  readonly stopLoss?: string | null;
  readonly takeProfit?: string | null;
}

export interface CloseRequest {
  readonly clientOrderId: string;
  /** Omit to close the whole position. */
  readonly lots?: string;
}

export interface ProtectionPatch {
  readonly stopLoss?: string | null;
  readonly takeProfit?: string | null;
}

export interface StrategyContext {
  /** Bars whose close is at or before the cursor. This is the whole market input. */
  readonly window: Window;
  readonly broker: BrokerPort;
}

/**
 * A strategy reads the window and submits orders only through the broker port.
 * It is not an indicator.
 */
export interface Strategy {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  onBar(context: StrategyContext): void | Promise<void>;
}
