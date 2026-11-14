// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { OrderType } from "./order.ts";

export interface VenueCapabilities {
  adapterId: string;
  venue: string;
  /** Order types that may carry a stop and a target. */
  protectionsOn: readonly OrderType[];
  placement: "demo" | "paper" | "stub" | "interface" | "local" | "refused" | "documented";
}

const ALL: readonly OrderType[] = ["market", "limit", "stop"];
const RESTING: readonly OrderType[] = ["limit", "stop"];
const NONE: readonly OrderType[] = [];

export const VENUE_CAPABILITIES: Record<string, VenueCapabilities> = {
  binance: { adapterId: "ccxt", venue: "binance", protectionsOn: NONE, placement: "demo" },
  bybit: { adapterId: "ccxt", venue: "bybit", protectionsOn: ALL, placement: "demo" },
  okx: { adapterId: "ccxt", venue: "okx", protectionsOn: ALL, placement: "demo" },
  kraken: { adapterId: "ccxt", venue: "kraken", protectionsOn: NONE, placement: "refused" },
  oanda: { adapterId: "oanda", venue: "oanda", protectionsOn: ALL, placement: "demo" },
  alpaca: { adapterId: "alpaca", venue: "alpaca", protectionsOn: ALL, placement: "paper" },
  tradier: { adapterId: "tradier", venue: "tradier", protectionsOn: RESTING, placement: "demo" },
  tradelocker: { adapterId: "tradelocker", venue: "tradelocker", protectionsOn: ALL, placement: "demo" },
  ctrader: { adapterId: "ctrader", venue: "ctrader", protectionsOn: ALL, placement: "stub" },
  ibkr: { adapterId: "ibkr", venue: "ibkr", protectionsOn: ALL, placement: "interface" },
  backtest: { adapterId: "backtest", venue: "backtest", protectionsOn: NONE, placement: "local" },
  mt5: { adapterId: "mt5", venue: "mt5", protectionsOn: NONE, placement: "documented" },
  tradovate: { adapterId: "tradovate", venue: "tradovate", protectionsOn: NONE, placement: "documented" },
};

/** Whether the order ticket should show a stop and a target for this type. */
export function protectionsVisible(venue: string, type: OrderType): { stopLoss: boolean; takeProfit: boolean } {
  const caps = VENUE_CAPABILITIES[venue];
  const visible = caps ? caps.protectionsOn.includes(type) : false;
  return { stopLoss: visible, takeProfit: visible };
}

export function protectionsAllowed(venue: string, type: OrderType): boolean {
  return protectionsVisible(venue, type).stopLoss;
}
