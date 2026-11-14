// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { VenueCapabilities } from "../orders/model.js";

export type BrokerId =
  | "binance"
  | "bybit"
  | "okx"
  | "kraken"
  | "ctrader"
  | "oanda"
  | "alpaca"
  | "ibkr"
  | "tradier"
  | "tradelocker"
  | "backtest";

const ALL_TYPES = ["market", "limit", "stop", "stop_limit"] as const;
const RESTING = ["limit", "stop", "stop_limit"] as const;

export const VENUE_CAPABILITIES: Record<BrokerId, VenueCapabilities> = {
  binance: {
    attachStopLoss: false,
    attachTakeProfit: false,
    protectionsOn: [],
    oauth: false,
    placement: "demo",
  },
  bybit: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: ALL_TYPES,
    oauth: false,
    placement: "demo",
  },
  okx: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: ALL_TYPES,
    oauth: false,
    placement: "demo",
  },
  kraken: {
    attachStopLoss: false,
    attachTakeProfit: false,
    protectionsOn: [],
    oauth: false,
    placement: "refused",
  },
  ctrader: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: ALL_TYPES,
    oauth: false,
    placement: "stub",
  },
  oanda: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: ["market", "limit", "stop"],
    oauth: false,
    placement: "demo",
  },
  alpaca: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: ALL_TYPES,
    oauth: true,
    placement: "demo",
  },
  ibkr: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: ALL_TYPES,
    oauth: false,
    placement: "interface",
  },
  tradier: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: RESTING,
    oauth: true,
    placement: "demo",
  },
  tradelocker: {
    attachStopLoss: true,
    attachTakeProfit: true,
    protectionsOn: ["market", "limit", "stop"],
    oauth: false,
    placement: "demo",
  },
  backtest: {
    attachStopLoss: false,
    attachTakeProfit: false,
    protectionsOn: [],
    oauth: false,
    placement: "local",
  },
};
