// SPDX-License-Identifier: Apache-2.0

import { EURUSD } from "@flowchart/bars";

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop";
export type OrderRole = "entry" | "stop" | "target" | "reduce";
export type OrderSource = "manual" | "strategy";

export type OrderTicket = {
  side: Side;
  type: OrderType;
  lots: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  reduceOnly?: boolean;
};

export type Position = { lots: number; avgPrice: number };

export type WorkingOrderView = {
  id: string;
  side: Side;
  type: "limit" | "stop";
  lots: number;
  price: number;
  role: OrderRole;
  submittedAt: number;
  stopLoss?: number;
  takeProfit?: number;
  source: OrderSource;
};

export type Fill = {
  id: string;
  orderId: string;
  time: number;
  side: Side;
  lots: number;
  price: number;
  spread: number;
  spreadCost: number;
  commission: number;
  ambiguous: boolean;
  realizedPnl: number;
  positionAfter: number;
  source: OrderSource;
};

export type BrokerPort = {
  submit(order: OrderTicket): string;
  amend(id: string, patch: { price?: number; lots?: number }): void;
  cancel(id: string): void;
  position(): Position;
  working(): readonly WorkingOrderView[];
  fills(): readonly Fill[];
};

export type OrderRecord = OrderTicket & { id: string; submittedAt: number; source: OrderSource };
export type CancelRecord = { id: string; at: number };

export type NumSpec = {
  symbol: string;
  tickSize: number;
  pipSize: number;
  lotSize: number;
  spread: number;
  commissionPerLot: number;
  pricePrecision: number;
  dayRollUtcMinute: number;
  sessions: typeof EURUSD.sessions;
};

export const EURUSD_NUM: NumSpec = {
  symbol: EURUSD.symbol,
  tickSize: Number(EURUSD.tickSize),
  pipSize: Number(EURUSD.pipSize),
  lotSize: Number(EURUSD.lotSize),
  spread: Number(EURUSD.spread),
  commissionPerLot: Number(EURUSD.commissionPerLot),
  pricePrecision: EURUSD.pricePrecision,
  dayRollUtcMinute: EURUSD.dayRollUtcMinute,
  sessions: EURUSD.sessions,
};

export function roundTick(value: number, tick = EURUSD_NUM.tickSize): number {
  return Math.round(value / tick) * tick;
}

export function roundLots(lots: number): number {
  return Math.round(lots * 100) / 100;
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
