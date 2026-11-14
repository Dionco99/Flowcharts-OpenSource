// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "../adapter.js";
import { VENUE_CAPABILITIES } from "../capabilities.js";
import { httpError, type HttpClient } from "../http.js";
import { BrokerRequestError, OrderRejected } from "../../orders/errors.js";
import { assertCanSend, endpointFor, fillSourceFor, type ExecutionContext } from "../../orders/guard.js";
import { buildFill, fillReason, type FillJournal, type FillRecord } from "../../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent } from "../../orders/model.js";

export interface TradeLockerRoute {
  tradableInstrumentId: number;
  routeId: number;
}

export interface TradeLockerConfig {
  accountId: string;
  accNum: string;
  accessToken: string;
  routes: Record<string, TradeLockerRoute>;
}

const ENDPOINTS = {
  demo: "https://demo.tradelocker.com/backend-api",
  live: "https://live.tradelocker.com/backend-api",
};

export async function loginTradeLockerDemo(
  http: HttpClient,
  input: { email: string; password: string; server: string },
): Promise<{ accessToken: string; refreshToken?: string }> {
  const response = await http.request({
    method: "POST",
    url: `${ENDPOINTS.demo}/auth/jwt/token`,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password, server: input.server }),
  });
  const secrets = [input.password, input.email];
  if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
  let parsed: { accessToken?: string; refreshToken?: string };
  try {
    parsed = JSON.parse(response.body) as { accessToken?: string; refreshToken?: string };
  } catch {
    throw httpError(response.status, response.body, secrets);
  }
  if (!parsed.accessToken) throw new BrokerRequestError("TradeLocker demo login did not return an access token.");
  const tokens: { accessToken: string; refreshToken?: string } = { accessToken: parsed.accessToken };
  if (parsed.refreshToken) tokens.refreshToken = parsed.refreshToken;
  return tokens;
}

export function buildTradeLockerOrder(order: OrderIntent, route: TradeLockerRoute): Record<string, unknown> {
  validateOrder(order);
  assertProtectionsAllowed(order, VENUE_CAPABILITIES.tradelocker);
  if (order.type === "stop_limit") {
    throw new OrderRejected("TradeLocker demo orders in this adapter are market, limit, or stop.");
  }
  if (order.clientOrderId.length > 31) {
    throw new OrderRejected("TradeLocker strategyId is limited to 31 characters.");
  }
  const body: Record<string, unknown> = {
    qty: Number(order.qty),
    routeId: route.routeId,
    side: order.side,
    tradableInstrumentId: route.tradableInstrumentId,
    type: order.type,
    validity: order.type === "market" ? "IOC" : "GTC",
    strategyId: order.clientOrderId,
  };
  if (order.type === "market") body.price = 0;
  if (order.type === "limit") body.price = Number(order.prices?.limit);
  if (order.type === "stop") body.stopPrice = Number(order.prices?.stop);
  if (order.protections?.stopLoss) {
    body.stopLoss = Number(order.protections.stopLoss.price);
    body.stopLossType = "absolute";
  }
  if (order.protections?.takeProfit) {
    body.takeProfit = Number(order.protections.takeProfit.price);
    body.takeProfitType = "absolute";
  }
  return body;
}

interface TradeLockerPayload {
  s?: string;
  d?: { orderId?: string; avgPrice?: string | number };
}

function fillFromTradeLocker(order: OrderIntent, payload: TradeLockerPayload, ctx: ExecutionContext): FillRecord | undefined {
  const orderId = payload.d?.orderId;
  const avg = payload.d?.avgPrice;
  if (!orderId || avg === undefined || avg === "") return undefined;
  const time = ctx.now ?? new Date().toISOString();
  return buildFill({
    id: `tradelocker:${orderId}`,
    source: fillSourceFor(ctx.mode),
    adapterId: "tradelocker",
    venue: "tradelocker",
    symbol: order.symbol,
    side: order.side,
    lots: order.qty,
    price: String(avg),
    time,
    barCloseTime: time,
    orderId,
    clientOrderId: order.clientOrderId,
    reason: fillReason(order.type, ctx.reason),
    spread: ctx.spread,
  });
}

export function createTradeLockerBroker(
  config: TradeLockerConfig,
  journal: FillJournal,
  http: HttpClient,
): BrokerAdapter {
  if (!/^\d+$/.test(config.accountId) || !/^\d+$/.test(config.accNum)) {
    throw new OrderRejected("TradeLocker account id and accNum must be digits.");
  }
  const secrets = [config.accessToken];
  return {
    id: "tradelocker",
    capabilities: VENUE_CAPABILITIES.tradelocker,
    async placeOrder(order, ctx) {
      const decision = assertCanSend(ctx);
      const route = config.routes[order.symbol];
      if (!route) throw new OrderRejected(`No TradeLocker instrument route for ${order.symbol}.`);
      const body = buildTradeLockerOrder(order, route);
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "POST",
        url: `${base}/trade/accounts/${config.accountId}/orders`,
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          accNum: config.accNum,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
      const payload = JSON.parse(response.body) as TradeLockerPayload;
      if (payload.s !== "ok" || !payload.d?.orderId) throw httpError(response.status, response.body, secrets);
      const fill = fillFromTradeLocker(order, payload, ctx);
      if (fill) journal.append(fill);
      const ack: OrderAck = {
        venue: "tradelocker",
        orderId: payload.d.orderId,
        clientOrderId: order.clientOrderId,
        status: fill ? "filled" : "accepted",
        warnings: decision.warnings,
      };
      if (fill) ack.fill = fill;
      return ack;
    },
    async cancelOrder(orderId, _symbol, ctx) {
      assertCanSend(ctx);
      if (!/^[A-Za-z0-9-]+$/.test(orderId)) throw new OrderRejected("TradeLocker order id is not usable.");
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "DELETE",
        url: `${base}/trade/accounts/${config.accountId}/orders/${orderId}`,
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          accNum: config.accNum,
          accept: "application/json",
        },
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
    },
  };
}
