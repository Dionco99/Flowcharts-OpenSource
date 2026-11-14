// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "../adapter.js";
import { VENUE_CAPABILITIES } from "../capabilities.js";
import { httpError, type HttpClient } from "../http.js";
import { isWholeShares } from "../../orders/decimal.js";
import { OrderRejected } from "../../orders/errors.js";
import { assertCanSend, endpointFor, fillSourceFor, type ExecutionContext } from "../../orders/guard.js";
import { buildFill, fillReason, type FillJournal, type FillRecord } from "../../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent } from "../../orders/model.js";

export interface TradierConfig {
  accountId: string;
  accessToken: string;
}

const ENDPOINTS = {
  demo: "https://sandbox.tradier.com",
  live: "https://api.tradier.com",
};

function duration(order: OrderIntent): string {
  if (order.timeInForce === "ioc" || order.timeInForce === "fok") {
    throw new OrderRejected("Tradier duration is day or gtc.");
  }
  return order.timeInForce === "gtc" ? "gtc" : "day";
}

function equitySymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.]{0,14}$/.test(upper)) throw new OrderRejected("Tradier adapter takes an equity symbol.");
  return upper;
}

export function buildTradierBody(order: OrderIntent): string {
  validateOrder(order);
  assertProtectionsAllowed(order, VENUE_CAPABILITIES.tradier);
  if (!isWholeShares(order.qty)) throw new OrderRejected("Tradier equity quantity must be whole shares.");
  const symbol = equitySymbol(order.symbol);
  const held = duration(order);
  const params = new URLSearchParams();
  params.set("duration", held);
  params.set("symbol", symbol);
  params.set("preview", "false");
  const stopLoss = order.protections?.stopLoss;
  const takeProfit = order.protections?.takeProfit;
  const exit = order.side === "buy" ? "sell" : "buy";
  if (stopLoss || takeProfit) {
    params.set("class", stopLoss && takeProfit ? "otoco" : "oto");
    params.set("side[0]", order.side);
    params.set("quantity[0]", order.qty);
    params.set("type[0]", order.type);
    if (order.prices?.limit) params.set("price[0]", order.prices.limit);
    if (order.prices?.stop) params.set("stop[0]", order.prices.stop);
    let leg = 1;
    if (takeProfit) {
      params.set(`side[${leg}]`, exit);
      params.set(`quantity[${leg}]`, order.qty);
      params.set(`type[${leg}]`, "limit");
      params.set(`price[${leg}]`, takeProfit.price);
      leg += 1;
    }
    if (stopLoss) {
      params.set(`side[${leg}]`, exit);
      params.set(`quantity[${leg}]`, order.qty);
      params.set(`type[${leg}]`, "stop");
      params.set(`stop[${leg}]`, stopLoss.price);
    }
    return params.toString();
  }
  params.set("class", "equity");
  params.set("side", order.side);
  params.set("quantity", order.qty);
  params.set("type", order.type);
  if (order.prices?.limit) params.set("price", order.prices.limit);
  if (order.prices?.stop) params.set("stop", order.prices.stop);
  return params.toString();
}

interface TradierOrder {
  id?: number | string;
  status?: string;
  avg_fill_price?: number | string;
  exec_quantity?: number | string;
  transaction_date?: string;
}

function fillFromTradier(order: OrderIntent, placed: TradierOrder, ctx: ExecutionContext): FillRecord | undefined {
  if (placed.id === undefined || placed.avg_fill_price === undefined || placed.avg_fill_price === "") return undefined;
  const price = String(placed.avg_fill_price);
  const qty = placed.exec_quantity === undefined ? order.qty : String(placed.exec_quantity);
  const time = placed.transaction_date ?? ctx.now ?? new Date().toISOString();
  return buildFill({
    id: `tradier:${placed.id}`,
    source: fillSourceFor(ctx.mode),
    adapterId: "tradier",
    venue: "tradier",
    symbol: order.symbol,
    side: order.side,
    lots: qty,
    price,
    time,
    barCloseTime: time,
    orderId: String(placed.id),
    clientOrderId: order.clientOrderId,
    reason: fillReason(order.type, ctx.reason),
    spread: ctx.spread,
  });
}

export function createTradierBroker(config: TradierConfig, journal: FillJournal, http: HttpClient): BrokerAdapter {
  const secrets = [config.accessToken];
  if (!/^[A-Za-z0-9]{1,32}$/.test(config.accountId)) throw new OrderRejected("Tradier account id is not usable.");
  return {
    id: "tradier",
    capabilities: VENUE_CAPABILITIES.tradier,
    async placeOrder(order, ctx) {
      const decision = assertCanSend(ctx);
      const body = buildTradierBody(order);
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "POST",
        url: `${base}/v1/accounts/${config.accountId}/orders`,
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
      const parsed = JSON.parse(response.body) as { order?: TradierOrder };
      const placed = parsed.order;
      if (!placed?.id) throw httpError(response.status, response.body, secrets);
      const fill = fillFromTradier(order, placed, ctx);
      if (fill) journal.append(fill);
      const ack: OrderAck = {
        venue: "tradier",
        orderId: String(placed.id),
        clientOrderId: order.clientOrderId,
        status: fill ? "filled" : "accepted",
        warnings: decision.warnings,
      };
      if (fill) ack.fill = fill;
      return ack;
    },
    async cancelOrder(orderId, _symbol, ctx) {
      assertCanSend(ctx);
      if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw new OrderRejected("Tradier order id is not usable.");
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "DELETE",
        url: `${base}/v1/accounts/${config.accountId}/orders/${orderId}`,
        headers: { authorization: `Bearer ${config.accessToken}`, accept: "application/json" },
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
    },
  };
}
