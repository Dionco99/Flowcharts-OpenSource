// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { ExecutionContext } from "../orders/guard.js";
import type { FillRecord } from "../orders/journal.js";
import type { OrderIntent, VenueCapabilities } from "../orders/model.js";
import type { BrokerId } from "./capabilities.js";

export interface OrderAck {
  venue: string;
  orderId: string;
  clientOrderId: string;
  status: "accepted" | "filled";
  fill?: FillRecord;
  warnings: string[];
}

/** One port for every venue. Live, demo, paper, and backtest share `FillRecord`. */
export interface BrokerAdapter {
  readonly id: BrokerId;
  readonly capabilities: VenueCapabilities;
  placeOrder(order: OrderIntent, ctx: ExecutionContext): Promise<OrderAck>;
  cancelOrder(orderId: string, symbol: string, ctx: ExecutionContext): Promise<void>;
}
