// SPDX-License-Identifier: Apache-2.0

import type { MarketWindow } from "@flowchart/bars";

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";
export type OrderRole = "entry" | "stop" | "target" | "reduce";
export type OrderSource = "manual" | "strategy";

/** Prices and lots are decimal strings. */
export type PlaceOrder = {
  side: Side;
  type: OrderType;
  lots: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  reduceOnly?: boolean;
};

export type OrderRecord = PlaceOrder & {
  id: string;
  submittedAt: number;
  source: OrderSource;
};

export type CancelRecord = { id: string; at: number };

export type Position = { lots: string; avgPrice: string };

export type WorkingOrder = {
  id: string;
  side: Side;
  type: "limit" | "stop";
  lots: string;
  price: string;
  role: OrderRole;
  submittedAt: number;
  stopLoss?: string;
  takeProfit?: string;
  source: OrderSource;
};

export type Fill = {
  id: string;
  orderId: string;
  time: number;
  side: Side;
  lots: string;
  price: string;
  spread: string;
  spreadCost: string;
  commission: string;
  ambiguous: boolean;
  realizedPnl: string;
  positionAfter: string;
  source: OrderSource;
};

export type CallResult = { ok: true; id: string } | { ok: false; code: string };

export type BookSnapshot = {
  position: Position;
  orders: readonly WorkingOrder[];
  fills: readonly Fill[];
  realized: string;
  commission: string;
  unrealized: string;
  bid: string;
  ask: string;
};

/** One port is one symbol and one net position. Calls do not throw. */
export type BrokerPort = {
  place(order: PlaceOrder): CallResult;
  modify(id: string, patch: { price?: string; lots?: string }): CallResult;
  cancel(id: string): CallResult;
  close(lots?: string): CallResult;
  modifyProtection(patch: { stopLoss?: string | null; takeProfit?: string | null }): CallResult;
  snapshot(): BookSnapshot;
};

export type StrategyRunner = {
  reset(): void;
  onBar(window: MarketWindow, port: BrokerPort): void;
};
