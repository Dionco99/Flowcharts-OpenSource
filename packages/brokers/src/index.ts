// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export { VENUE_CAPABILITIES, protectionsVisible } from "./capabilities.ts";
export type { VenueCapabilities } from "./capabilities.ts";
export { BrokerError } from "./errors.ts";
export type { BrokerResult } from "./errors.ts";
export { FILL_KEYS, FILL_RECORD, buildFill } from "./fill.ts";
export type { FlowchartFill } from "./fill.ts";
export { reviewFundedNext } from "./fundednext.ts";
export type { FundedNextDecision, FundedNextProfile, FundedPlatform } from "./fundednext.ts";
export {
  REAL_MONEY_CONFIRMATION_DEFAULT,
  assertDemoRequest,
  createGuardedClient,
  liveNetworkEnabled,
} from "./guard.ts";
export type { Env, HttpClient, HttpRequest, HttpResponse } from "./guard.ts";
export { createBroker } from "./port.ts";
export type { Ack, BrokerPort, CloseOrder, CreateBrokerOptions, Snapshot, WorkingOrder } from "./port.ts";
export {
  alpacaAuthorizeUrl,
  armCcxtDemo,
  buildCcxtOrder,
  ccxtDemoTarget,
  defaultCtraderTransport,
  exchangeAlpacaCode,
  exchangeTradierCode,
  loginTradeLockerDemo,
  toCtraderNewOrder,
  toIbkrOrderRequest,
  toOandaInstrument,
} from "./drivers.ts";
export type { CcxtClient, Credentials, CtraderNewOrder, CtraderTransport, IbkrOrder } from "./drivers.ts";
export { CredentialVault } from "./vault.ts";

export const VENUE_CATALOG = [
  { name: "OANDA", venue: "oanda", adapterId: "oanda", placement: "demo" },
  { name: "cTrader", venue: "ctrader", adapterId: "ctrader", placement: "stub" },
  { name: "TradeLocker", venue: "tradelocker", adapterId: "tradelocker", placement: "demo" },
  { name: "MT5", venue: "mt5", adapterId: "mt5", placement: "documented" },
  { name: "IBKR", venue: "ibkr", adapterId: "ibkr", placement: "interface" },
  { name: "Alpaca", venue: "alpaca", adapterId: "alpaca", placement: "paper" },
  { name: "Tradovate", venue: "tradovate", adapterId: "tradovate", placement: "documented" },
  { name: "CCXT", venue: "ccxt", adapterId: "ccxt", placement: "demo", exchanges: ["binance", "bybit", "okx", "kraken"] },
  { name: "Tradier", venue: "tradier", adapterId: "tradier", placement: "sandbox" },
] as const;
