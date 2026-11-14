// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
export { REAL_MONEY_CONFIRMATION_DEFAULT, assertCanSend, endpointFor, fillSourceFor } from "./orders/guard.js";
export type { AccountMode, ExecutionContext } from "./orders/guard.js";
export {
  BrokerRequestError,
  DemoUnavailable,
  InterfaceOnlyError,
  LiveNetworkDisabled,
  OrderRejected,
  PropFirmAutomationBlocked,
  ProtectionNotSupported,
  RealMoneyConfirmationRequired,
} from "./orders/errors.js";
export { FILL_KEYS, FillJournal, buildFill, toJournalTrade } from "./orders/journal.js";
export type { FillRecord, FillSource, JournalTrade } from "./orders/journal.js";
export {
  assertProtectionsAllowed,
  protectionsVisible,
  validateOrder,
} from "./orders/model.js";
export type {
  OrderIntent,
  OrderPrices,
  OrderProtections,
  OrderSide,
  OrderType,
  Placement,
  ProtectionLevel,
  TimeInForce,
  VenueCapabilities,
} from "./orders/model.js";
export { CredentialVault, MemorySecretStore } from "./secrets/vault.js";
export { redactText, redactValue } from "./secrets/redact.js";
export type { BrokerAdapter, OrderAck } from "./brokers/adapter.js";
export { VENUE_CAPABILITIES } from "./brokers/capabilities.js";
export type { BrokerId } from "./brokers/capabilities.js";
export { DOCUMENTED_ONLY, EXCLUDED_FROM_CORE } from "./brokers/documented.js";
export { reviewPropFirmAutomation } from "./brokers/prop-firm.js";
export type { PropFirmDecision, PropFirmProfile } from "./brokers/prop-firm.js";
export { assertDemoRequest, createGuardedClient, fetchHttpClient } from "./brokers/http.js";
export type { HttpClient, HttpRequest, HttpResponse } from "./brokers/http.js";
export { adapterIdFor, createBrokerPort } from "./broker/port.js";
export type {
  BrokerPort,
  CloseOrder,
  ModifyOrder,
  ModifyProtection,
  PlaceOrder,
  PortOrder,
  PortResult,
  Snapshot,
} from "./broker/port.js";
export { createBroker } from "./brokers/registry.js";
export type { BrokerDeps } from "./brokers/registry.js";
export { armCcxtDemo, assertCcxtDemoArmed, openCcxtDemoSession } from "./brokers/ccxt/session.js";
export type { CcxtCredentials, CcxtSession } from "./brokers/ccxt/session.js";
export { buildCcxtOrder } from "./brokers/ccxt/adapter.js";
export { toCTraderNewOrder, UnboundCTraderTransport } from "./brokers/ctrader/adapter.js";
export type { CTraderNewOrderReq, CTraderTransport } from "./brokers/ctrader/adapter.js";
export { buildOandaOrder, toOandaInstrument } from "./brokers/oanda/adapter.js";
export { alpacaAuthorizeUrl, exchangeAlpacaCode } from "./brokers/alpaca/oauth.js";
export { buildAlpacaOrder } from "./brokers/alpaca/adapter.js";
export { toIbkrOrderRequest } from "./brokers/ibkr/gateway.js";
export type { IbkrGateway, IbkrOrderRequest } from "./brokers/ibkr/gateway.js";
export { tradierAuthorizeUrl, exchangeTradierCode } from "./brokers/tradier/oauth.js";
export { buildTradierBody } from "./brokers/tradier/adapter.js";
export { buildTradeLockerOrder, loginTradeLockerDemo } from "./brokers/tradelocker/adapter.js";
