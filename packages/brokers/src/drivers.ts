// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { protectionsAllowed } from "./capabilities.ts";
import { mul } from "./decimal.ts";
import { BrokerError } from "./errors.ts";
import type { HttpClient, HttpResponse } from "./guard.ts";
import { redact } from "./redact.ts";
import type { NormalizedOrder } from "./order.ts";

export interface Credentials {
  token?: string;
  accessToken?: string;
  accountId?: string;
  apiKey?: string;
  secret?: string;
  passphrase?: string;
  accNum?: string;
  email?: string;
  password?: string;
  server?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface CcxtOrderResult {
  id?: string;
  status?: string;
  average?: number;
  filled?: number;
  fee?: { cost?: number };
  timestamp?: number;
}

export interface CcxtClient {
  id: string;
  apiKey?: string;
  secret?: string;
  password?: string;
  urls: { api: Record<string, unknown> };
  headers: Record<string, string>;
  enableDemoTrading?(enabled: boolean): void;
  setSandboxMode?(enabled: boolean): void;
  createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price: number | undefined,
    params: Record<string, unknown>,
  ): Promise<CcxtOrderResult>;
  cancelOrder?(id: string, symbol: string): Promise<unknown>;
}

export interface CtraderTransport {
  send(message: CtraderNewOrder): Promise<void>;
  openedSocket(): boolean;
}

export interface CtraderNewOrder {
  payloadType: "PROTO_OA_NEW_ORDER_REQ";
  ctidTraderAccountId: string;
  symbolId: string;
  orderType: "MARKET" | "LIMIT" | "STOP";
  tradeSide: "BUY" | "SELL";
  volume: string;
  limitPrice?: string;
  stopPrice?: string;
  stopLoss?: string;
  takeProfit?: string;
  clientOrderId: string;
}

export interface IbkrOrder {
  acctId: string;
  conid: number;
  cOID?: string;
  parentId?: string;
  orderType: "MKT" | "LMT" | "STP";
  side: "BUY" | "SELL";
  quantity: number;
  tif: "DAY";
  price?: number;
  auxPrice?: number;
}

export interface DriverResult {
  orderId: string;
  status: "filled" | "accepted" | "mapped";
  price?: string;
  lots?: string;
  commission?: string;
  time?: string;
  request?: unknown;
  transmitted: boolean;
}

export interface DriverContext {
  symbol: string;
  mode: "demo" | "paper" | "live" | "backtest";
  http: HttpClient;
  now: string;
  markPrice?: string;
  commission: string;
  credentials: Credentials;
  ccxt?: CcxtClient;
  ctraderSymbols?: Record<string, string>;
  ibkr?: { accountId: string; conid: number };
  routes?: Record<string, { tradableInstrumentId: number; routeId: number }>;
  transport?: CtraderTransport;
}

export interface VenueDriver {
  adapterId: string;
  venue: string;
  place(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult>;
  cancel(orderId: string, ctx: DriverContext): Promise<void>;
}

const OANDA = { demo: "https://api-fxpractice.oanda.com", live: "https://api-fxtrade.oanda.com" };
const ALPACA = { demo: "https://paper-api.alpaca.markets", live: "https://api.alpaca.markets" };
const TRADIER = { demo: "https://sandbox.tradier.com", live: "https://api.tradier.com" };
const LOCKER = { demo: "https://demo.tradelocker.com", live: "https://live.tradelocker.com" };

export function createDriver(venue: string): VenueDriver {
  switch (venue) {
    case "oanda":
      return { adapterId: "oanda", venue, place: placeOanda, cancel: cancelOanda };
    case "alpaca":
      return { adapterId: "alpaca", venue, place: placeAlpaca, cancel: cancelAlpaca };
    case "tradier":
      return { adapterId: "tradier", venue, place: placeTradier, cancel: cancelTradier };
    case "tradelocker":
      return { adapterId: "tradelocker", venue, place: placeTradeLocker, cancel: cancelTradeLocker };
    case "binance":
    case "bybit":
    case "okx":
      return { adapterId: "ccxt", venue, place: (order, ctx) => placeCcxt(venue, order, ctx), cancel: (id, ctx) => cancelCcxt(venue, id, ctx) };
    case "kraken":
      return { adapterId: "ccxt", venue, place: placeKraken, cancel: placeKrakenCancel };
    case "ctrader":
      return { adapterId: "ctrader", venue, place: placeCtrader, cancel: async () => { throw new BrokerError("interface_only", "cTrader cancel opens no socket."); } };
    case "ibkr":
      return { adapterId: "ibkr", venue, place: placeIbkr, cancel: placeIbkrCancel };
    case "backtest":
      return { adapterId: "backtest", venue, place: placeBacktest, cancel: async () => { throw new BrokerError("order_not_working", "Backtest orders fill immediately."); } };
    case "mt5":
    case "tradovate":
      return {
        adapterId: venue,
        venue,
        place: async () => {
          throw new BrokerError("documented_only", `${venue} is documented only. This package does not open a connection.`);
        },
        cancel: async () => {
          throw new BrokerError("documented_only", `${venue} is documented only. This package does not open a connection.`);
        },
      };
    default:
      throw new BrokerError("unknown_venue", `Unknown venue ${venue}.`);
  }
}

export function toOandaInstrument(symbol: string): string {
  const compact = symbol.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (!/^[A-Z]{6}$/.test(compact)) throw new BrokerError("invalid_order", "OANDA symbol must be a pair such as EURUSD.");
  return `${compact.slice(0, 3)}_${compact.slice(3)}`;
}

export function buildOandaBody(order: NormalizedOrder, symbol: string): { order: Record<string, unknown> } {
  if (order.clientOrderId.length > 50) throw new BrokerError("invalid_order", "OANDA client order ids are limited to 50 characters.");
  const ticket: Record<string, unknown> = {
    type: order.type === "market" ? "MARKET" : order.type === "limit" ? "LIMIT" : "STOP",
    instrument: toOandaInstrument(symbol),
    units: order.side === "buy" ? order.lots : `-${order.lots}`,
    timeInForce: order.type === "market" ? "FOK" : "GTC",
    positionFill: "DEFAULT",
    clientExtensions: { id: order.clientOrderId },
  };
  if (order.type === "limit") ticket.price = order.limitPrice;
  if (order.type === "stop") ticket.price = order.stopPrice;
  if (order.stopLoss) ticket.stopLossOnFill = { price: order.stopLoss, timeInForce: "GTC" };
  if (order.takeProfit) ticket.takeProfitOnFill = { price: order.takeProfit, timeInForce: "GTC" };
  return { order: ticket };
}

async function placeOanda(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  const accountId = required(ctx.credentials.accountId, "OANDA account id");
  const token = required(ctx.credentials.token, "OANDA token");
  assertAccount(accountId);
  const response = await ctx.http.request({
    method: "POST",
    url: `${base(ctx, OANDA)}/v3/accounts/${accountId}/orders`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(buildOandaBody(order, ctx.symbol)),
  });
  const payload = readJson<{
    orderCreateTransaction?: { id?: string };
    orderFillTransaction?: { id?: string; price?: string; units?: string; time?: string; commission?: string };
  }>(response, [token]);
  const fill = payload.orderFillTransaction;
  if (fill?.price && fill.id) {
    return {
      orderId: fill.id,
      status: "filled",
      price: fill.price,
      lots: fill.units?.replace(/^-/, "") || order.lots,
      commission: fill.commission ?? "0",
      time: fill.time ?? ctx.now,
      transmitted: true,
    };
  }
  const orderId = payload.orderCreateTransaction?.id;
  if (!orderId) throw httpFailure(response, [token]);
  return { orderId, status: "accepted", transmitted: true };
}

async function cancelOanda(orderId: string, ctx: DriverContext): Promise<void> {
  const accountId = required(ctx.credentials.accountId, "OANDA account id");
  const token = required(ctx.credentials.token, "OANDA token");
  assertAccount(accountId);
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw new BrokerError("order_not_working", "OANDA order id is not usable.");
  const response = await ctx.http.request({
    method: "PUT",
    url: `${base(ctx, OANDA)}/v3/accounts/${accountId}/orders/${orderId}/cancel`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!okStatus(response.status)) throw httpFailure(response, [token]);
}

export function alpacaAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://app.alpaca.markets/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", "account:write trading");
  return url.toString();
}

export async function exchangeAlpacaCode(
  http: HttpClient,
  input: { code: string; clientId: string; clientSecret: string; redirectUri: string },
): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const response = await http.request({
    method: "POST",
    url: "https://api.alpaca.markets/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
  });
  const payload = readJson<{ access_token?: string }>(response, [input.clientSecret]);
  if (!payload.access_token) throw httpFailure(response, [input.clientSecret]);
  return { accessToken: payload.access_token };
}

export function buildAlpacaBody(order: NormalizedOrder, symbol: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    symbol,
    qty: order.lots,
    side: order.side,
    type: order.type,
    time_in_force: "day",
    client_order_id: order.clientOrderId,
  };
  if (order.limitPrice) body.limit_price = order.limitPrice;
  if (order.stopPrice) body.stop_price = order.stopPrice;
  if (order.stopLoss && order.takeProfit) {
    body.order_class = "bracket";
    body.stop_loss = { stop_price: order.stopLoss };
    body.take_profit = { limit_price: order.takeProfit };
  } else if (order.stopLoss || order.takeProfit) {
    body.order_class = "oto";
    if (order.stopLoss) body.stop_loss = { stop_price: order.stopLoss };
    if (order.takeProfit) body.take_profit = { limit_price: order.takeProfit };
  }
  return body;
}

async function placeAlpaca(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  const token = required(ctx.credentials.accessToken ?? ctx.credentials.token, "Alpaca access token");
  const response = await ctx.http.request({
    method: "POST",
    url: `${base(ctx, ALPACA)}/v2/orders`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(buildAlpacaBody(order, ctx.symbol)),
  });
  const payload = readJson<{ id?: string; filled_avg_price?: string | null; filled_qty?: string; filled_at?: string; status?: string }>(response, [token]);
  if (!payload.id) throw httpFailure(response, [token]);
  if (payload.filled_avg_price) {
    return {
      orderId: payload.id,
      status: "filled",
      price: payload.filled_avg_price,
      lots: payload.filled_qty || order.lots,
      commission: "0",
      time: payload.filled_at ?? ctx.now,
      transmitted: true,
    };
  }
  return { orderId: payload.id, status: "accepted", transmitted: true };
}

async function cancelAlpaca(orderId: string, ctx: DriverContext): Promise<void> {
  const token = required(ctx.credentials.accessToken ?? ctx.credentials.token, "Alpaca access token");
  const response = await ctx.http.request({
    method: "DELETE",
    url: `${base(ctx, ALPACA)}/v2/orders/${encodeURIComponent(orderId)}`,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!okStatus(response.status)) throw httpFailure(response, [token]);
}

export function buildTradierBody(order: NormalizedOrder, symbol: string): URLSearchParams {
  if (order.type === "market" && (order.stopLoss || order.takeProfit)) {
    throw new BrokerError("protection_not_supported", "Tradier does not attach a stop or target to a market order.");
  }
  const exit = order.side === "buy" ? "sell" : "buy";
  const params = new URLSearchParams();
  params.set("duration", "day");
  params.set("preview", "false");
  const hasBoth = Boolean(order.stopLoss && order.takeProfit);
  const hasOne = Boolean(order.stopLoss || order.takeProfit);
  if (!hasOne) {
    params.set("class", "equity");
    params.set("symbol", symbol);
    params.set("side", order.side);
    params.set("quantity", order.lots);
    params.set("type", order.type);
    if (order.limitPrice) params.set("price", order.limitPrice);
    if (order.stopPrice) params.set("stop", order.stopPrice);
    return params;
  }
  params.set("class", hasBoth ? "otoco" : "oto");
  setLeg(params, 0, { symbol, side: order.side, quantity: order.lots, type: order.type, price: order.limitPrice, stop: order.stopPrice });
  if (order.takeProfit) setLeg(params, 1, { symbol, side: exit, quantity: order.lots, type: "limit", price: order.takeProfit });
  if (order.stopLoss) setLeg(params, hasBoth ? 2 : 1, { symbol, side: exit, quantity: order.lots, type: "stop", stop: order.stopLoss });
  return params;
}

function setLeg(
  params: URLSearchParams,
  index: number,
  leg: { symbol: string; side: string; quantity: string; type: string; price?: string | null; stop?: string | null },
): void {
  params.set(`symbol[${index}]`, leg.symbol);
  params.set(`side[${index}]`, leg.side);
  params.set(`quantity[${index}]`, leg.quantity);
  params.set(`type[${index}]`, leg.type);
  if (leg.price) params.set(`price[${index}]`, leg.price);
  if (leg.stop) params.set(`stop[${index}]`, leg.stop);
}

export async function exchangeTradierCode(
  http: HttpClient,
  input: { code: string; clientId: string; clientSecret: string },
): Promise<{ accessToken: string }> {
  const response = await http.request({
    method: "POST",
    url: "https://api.tradier.com/v1/oauth/accesstoken",
    headers: {
      authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code }).toString(),
  });
  const payload = readJson<{ access_token?: string }>(response, [input.clientSecret]);
  if (!payload.access_token) throw httpFailure(response, [input.clientSecret]);
  return { accessToken: payload.access_token };
}

async function placeTradier(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  const accountId = required(ctx.credentials.accountId, "Tradier account id");
  const token = required(ctx.credentials.accessToken ?? ctx.credentials.token, "Tradier access token");
  const response = await ctx.http.request({
    method: "POST",
    url: `${base(ctx, TRADIER)}/v1/accounts/${encodeURIComponent(accountId)}/orders`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: buildTradierBody(order, ctx.symbol).toString(),
  });
  const payload = readJson<{ order?: { id?: number | string; avg_fill_price?: string; exec_quantity?: string; transaction_date?: string } }>(response, [token]);
  const id = payload.order?.id;
  if (id === undefined) throw httpFailure(response, [token]);
  if (payload.order?.avg_fill_price) {
    return {
      orderId: String(id),
      status: "filled",
      price: payload.order.avg_fill_price,
      lots: payload.order.exec_quantity || order.lots,
      commission: "0",
      time: payload.order.transaction_date ?? ctx.now,
      transmitted: true,
    };
  }
  return { orderId: String(id), status: "accepted", transmitted: true };
}

async function cancelTradier(orderId: string, ctx: DriverContext): Promise<void> {
  const accountId = required(ctx.credentials.accountId, "Tradier account id");
  const token = required(ctx.credentials.accessToken ?? ctx.credentials.token, "Tradier access token");
  const response = await ctx.http.request({
    method: "DELETE",
    url: `${base(ctx, TRADIER)}/v1/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}`,
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!okStatus(response.status)) throw httpFailure(response, [token]);
}

export async function loginTradeLockerDemo(
  http: HttpClient,
  input: { email: string; password: string; server: string },
): Promise<{ accessToken: string }> {
  const response = await http.request({
    method: "POST",
    url: "https://demo.tradelocker.com/backend-api/auth/jwt/token",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password, server: input.server }),
  });
  const payload = readJson<{ accessToken?: string }>(response, [input.password]);
  if (!payload.accessToken) throw httpFailure(response, [input.password]);
  return { accessToken: payload.accessToken };
}

export function buildTradeLockerBody(
  order: NormalizedOrder,
  route: { tradableInstrumentId: number; routeId: number } | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    qty: Number(order.lots),
    side: order.side,
    type: order.type,
    validity: order.type === "market" ? "IOC" : "GTC",
  };
  if (route) {
    body.tradableInstrumentId = route.tradableInstrumentId;
    body.routeId = route.routeId;
  }
  if (order.limitPrice) body.price = Number(order.limitPrice);
  if (order.stopPrice) body.stopPrice = Number(order.stopPrice);
  if (order.stopLoss) {
    body.stopLoss = Number(order.stopLoss);
    body.stopLossType = "absolute";
  }
  if (order.takeProfit) {
    body.takeProfit = Number(order.takeProfit);
    body.takeProfitType = "absolute";
  }
  return body;
}

async function placeTradeLocker(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  const accountId = required(ctx.credentials.accountId, "TradeLocker account id");
  const token = required(ctx.credentials.accessToken ?? ctx.credentials.token, "TradeLocker access token");
  const accNum = ctx.credentials.accNum ?? "1";
  const response = await ctx.http.request({
    method: "POST",
    url: `${base(ctx, LOCKER)}/backend-api/trade/accounts/${encodeURIComponent(accountId)}/orders`,
    headers: { authorization: `Bearer ${token}`, accnum: accNum, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(buildTradeLockerBody(order, ctx.routes?.[ctx.symbol])),
  });
  const payload = readJson<{ d?: { orderId?: string; avgPrice?: string | number } }>(response, [token]);
  const orderId = payload.d?.orderId;
  if (!orderId) throw httpFailure(response, [token]);
  if (payload.d?.avgPrice !== undefined) {
    return {
      orderId,
      status: "filled",
      price: String(payload.d.avgPrice),
      lots: order.lots,
      commission: "0",
      time: ctx.now,
      transmitted: true,
    };
  }
  return { orderId, status: "accepted", transmitted: true };
}

async function cancelTradeLocker(orderId: string, ctx: DriverContext): Promise<void> {
  const token = required(ctx.credentials.accessToken ?? ctx.credentials.token, "TradeLocker access token");
  const response = await ctx.http.request({
    method: "DELETE",
    url: `${base(ctx, LOCKER)}/backend-api/trade/orders/${encodeURIComponent(orderId)}`,
    headers: { authorization: `Bearer ${token}` },
  });
  if (!okStatus(response.status)) throw httpFailure(response, [token]);
}

/** What a demo-armed CCXT session must show before an order is sent. No network. */
export function ccxtDemoTarget(venue: string): { hostIncludes?: string; header?: readonly [string, string] } {
  if (venue === "binance") return { hostIncludes: "demo-api.binance.com" };
  if (venue === "bybit") return { hostIncludes: "api-demo" };
  if (venue === "okx") return { header: ["x-simulated-trading", "1"] };
  throw new BrokerError("demo_unavailable", "Kraken has no self-service demo.");
}

export function armCcxtDemo(client: CcxtClient): void {
  if (client.id === "kraken") throw new BrokerError("demo_unavailable", "Kraken has no self-service demo.");
  if (client.id === "binance" || client.id === "bybit") {
    if (!client.enableDemoTrading) throw new BrokerError("demo_session_required", "The CCXT client cannot arm a demo session.");
    client.enableDemoTrading(true);
    return;
  }
  if (client.id === "okx") {
    if (!client.setSandboxMode) throw new BrokerError("demo_session_required", "The CCXT client cannot arm a demo session.");
    client.setSandboxMode(true);
    return;
  }
  throw new BrokerError("unknown_venue", `Unknown CCXT venue ${client.id}.`);
}

export function assertCcxtDemo(client: CcxtClient): void {
  const target = ccxtDemoTarget(client.id);
  const blob = JSON.stringify(client.urls);
  if (target.hostIncludes && !blob.includes(target.hostIncludes)) {
    throw new BrokerError("demo_session_required", `${client.id} is not armed for demo trading.`);
  }
  if (target.header && client.headers[target.header[0]] !== target.header[1]) {
    throw new BrokerError("demo_session_required", `${client.id} is not armed for demo trading.`);
  }
}

export function buildCcxtOrder(venue: string, order: NormalizedOrder, symbol: string): {
  type: string;
  side: string;
  amount: number;
  price: number | undefined;
  params: Record<string, unknown>;
} {
  if ((order.stopLoss || order.takeProfit) && !protectionsAllowed(venue, order.type)) {
    throw new BrokerError("protection_not_supported", `${venue} cannot attach a stop or target on this order.`);
  }
  const params: Record<string, unknown> = { clientOrderId: order.clientOrderId };
  if (order.stopLoss) params.stopLoss = { triggerPrice: Number(order.stopLoss) };
  if (order.takeProfit) params.takeProfit = { triggerPrice: Number(order.takeProfit) };
  const price = order.limitPrice ?? order.stopPrice;
  return {
    type: order.type,
    side: order.side,
    amount: Number(order.lots),
    price: price === null ? undefined : Number(price),
    params,
  };
}

async function placeCcxt(venue: string, order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  if (ctx.mode === "live") {
    throw new BrokerError("demo_session_required", "A CCXT session stays on the demo host and does not send a live order.");
  }
  const client = ctx.ccxt;
  if (!client || client.id !== venue) throw new BrokerError("client_required", "Pass a CCXT client for this venue.");
  if (venue === "okx" && !ctx.credentials.passphrase && !client.password) {
    throw new BrokerError("credential_required", "OKX requires a passphrase.");
  }
  if (!ctx.credentials.apiKey && !client.apiKey) throw new BrokerError("credential_required", "CCXT requires an API key.");
  armCcxtDemo(client);
  assertCcxtDemo(client);
  const built = buildCcxtOrder(venue, order, ctx.symbol);
  const result = await client.createOrder(ctx.symbol, built.type, built.side, built.amount, built.price, built.params);
  const filled = result.average !== undefined && (result.status === "closed" || result.status === "filled");
  if (filled && result.id) {
    return {
      orderId: result.id,
      status: "filled",
      price: String(result.average),
      lots: result.filled !== undefined ? String(result.filled) : order.lots,
      commission: result.fee?.cost !== undefined ? String(result.fee.cost) : "0",
      time: result.timestamp !== undefined ? new Date(result.timestamp).toISOString() : ctx.now,
      transmitted: true,
    };
  }
  if (!result.id) throw new BrokerError("venue_rejected", "CCXT did not return an order id.");
  return { orderId: result.id, status: "accepted", transmitted: true };
}

async function cancelCcxt(venue: string, orderId: string, ctx: DriverContext): Promise<void> {
  const client = ctx.ccxt;
  if (!client || client.id !== venue || !client.cancelOrder) throw new BrokerError("client_required", "Pass a CCXT client that can cancel.");
  armCcxtDemo(client);
  assertCcxtDemo(client);
  await client.cancelOrder(orderId, ctx.symbol);
}

async function placeKraken(): Promise<DriverResult> {
  throw new BrokerError("demo_unavailable", "Kraken has no self-service demo. This adapter does not call api.kraken.com.");
}

async function placeKrakenCancel(): Promise<void> {
  throw new BrokerError("demo_unavailable", "Kraken has no self-service demo. This adapter does not call api.kraken.com.");
}

export function toCtraderNewOrder(order: NormalizedOrder, symbol: string, config: { accountId: string; symbols: Record<string, string> }): CtraderNewOrder {
  const symbolId = config.symbols[symbol];
  if (!symbolId) throw new BrokerError("invalid_order", "cTrader has no symbol id for this instrument.");
  const volume = mul(order.lots, "100");
  if (volume.includes(".")) throw new BrokerError("invalid_size", "cTrader volume must be a whole number of hundredths.");
  const message: CtraderNewOrder = {
    payloadType: "PROTO_OA_NEW_ORDER_REQ",
    ctidTraderAccountId: config.accountId,
    symbolId,
    orderType: order.type === "market" ? "MARKET" : order.type === "limit" ? "LIMIT" : "STOP",
    tradeSide: order.side === "buy" ? "BUY" : "SELL",
    volume,
    clientOrderId: order.clientOrderId,
  };
  if (order.limitPrice) message.limitPrice = order.limitPrice;
  if (order.stopPrice) message.stopPrice = order.stopPrice;
  if (order.stopLoss) message.stopLoss = order.stopLoss;
  if (order.takeProfit) message.takeProfit = order.takeProfit;
  return message;
}

export function defaultCtraderTransport(): CtraderTransport {
  return {
    async send() {},
    openedSocket: () => false,
  };
}

async function placeCtrader(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  const accountId = required(ctx.credentials.accountId, "cTrader account id");
  const message = toCtraderNewOrder(order, ctx.symbol, { accountId, symbols: ctx.ctraderSymbols ?? {} });
  const transport = ctx.transport ?? defaultCtraderTransport();
  await transport.send(message);
  if (transport.openedSocket()) throw new BrokerError("interface_only", "The default cTrader transport must not open a socket.");
  return { orderId: order.clientOrderId, status: "mapped", request: message, transmitted: false };
}

export function toIbkrOrderRequest(
  order: NormalizedOrder,
  config: { accountId: string; conid: number },
): { url: string; orders: IbkrOrder[] } {
  const exit = order.side === "buy" ? "SELL" : "BUY";
  const parent: IbkrOrder = {
    acctId: config.accountId,
    conid: config.conid,
    cOID: order.clientOrderId,
    orderType: order.type === "market" ? "MKT" : order.type === "limit" ? "LMT" : "STP",
    side: order.side === "buy" ? "BUY" : "SELL",
    quantity: Number(order.lots),
    tif: "DAY",
  };
  if (order.limitPrice) parent.price = Number(order.limitPrice);
  if (order.stopPrice) parent.auxPrice = Number(order.stopPrice);
  const orders = [parent];
  if (order.takeProfit) {
    orders.push({
      acctId: config.accountId,
      conid: config.conid,
      parentId: order.clientOrderId,
      orderType: "LMT",
      side: exit,
      quantity: Number(order.lots),
      tif: "DAY",
      price: Number(order.takeProfit),
    });
  }
  if (order.stopLoss) {
    orders.push({
      acctId: config.accountId,
      conid: config.conid,
      parentId: order.clientOrderId,
      orderType: "STP",
      side: exit,
      quantity: Number(order.lots),
      tif: "DAY",
      auxPrice: Number(order.stopLoss),
    });
  }
  return {
    url: `https://localhost:5000/v1/api/iserver/account/${config.accountId}/orders`,
    orders,
  };
}

async function placeIbkr(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  if (!ctx.ibkr) throw new BrokerError("interface_only", "IBKR place does not call the Client Portal Gateway.");
  toIbkrOrderRequest(order, ctx.ibkr);
  throw new BrokerError("interface_only", "IBKR place does not call the Client Portal Gateway.");
}

async function placeIbkrCancel(): Promise<void> {
  throw new BrokerError("interface_only", "IBKR cancel does not call the Client Portal Gateway.");
}

async function placeBacktest(order: NormalizedOrder, ctx: DriverContext): Promise<DriverResult> {
  if (order.stopLoss || order.takeProfit) {
    throw new BrokerError("protection_not_supported", "The backtest adapter does not attach a stop or target.");
  }
  const price = order.type === "market" ? ctx.markPrice : order.limitPrice ?? order.stopPrice ?? undefined;
  if (!price) throw new BrokerError("mark_price_required", "A backtest market order needs a mark price.");
  return {
    orderId: `backtest:${order.clientOrderId}`,
    status: "filled",
    price,
    lots: order.lots,
    commission: ctx.commission,
    time: ctx.now,
    transmitted: false,
  };
}

function base(ctx: DriverContext, endpoints: { demo: string; live: string }): string {
  if (ctx.mode === "live") return endpoints.live;
  if (ctx.mode === "backtest") throw new BrokerError("mode_mismatch", "Backtest does not use a venue host.");
  return endpoints.demo;
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new BrokerError("credential_required", `${label} is required.`);
  return value;
}

function assertAccount(accountId: string): void {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(accountId)) throw new BrokerError("invalid_order", "Account id is not usable.");
}

function okStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function readJson<T>(response: HttpResponse, secrets: readonly string[]): T {
  if (!okStatus(response.status)) throw httpFailure(response, secrets);
  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw httpFailure(response, secrets);
  }
}

function httpFailure(response: HttpResponse, secrets: readonly string[]): BrokerError {
  return new BrokerError("venue_rejected", redact(`Venue responded ${response.status}: ${response.body.slice(0, 300)}`, secrets));
}
