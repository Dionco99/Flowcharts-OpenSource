// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "../adapter.js";
import { VENUE_CAPABILITIES } from "../capabilities.js";
import { httpError, type HttpClient } from "../http.js";
import { OrderRejected } from "../../orders/errors.js";
import { assertCanSend, endpointFor, fillSourceFor, type ExecutionContext } from "../../orders/guard.js";
import { buildFill, fillReason, type FillJournal, type FillRecord } from "../../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent, type TimeInForce } from "../../orders/model.js";

export interface AlpacaConfig {
  accessToken: string;
}

const ENDPOINTS = {
  demo: "https://paper-api.alpaca.markets",
  live: "https://api.alpaca.markets",
};

function alpacaTif(value: TimeInForce | undefined): string {
  if (value === "gtc" || value === "ioc" || value === "fok") return value;
  return "day";
}

export function buildAlpacaOrder(order: OrderIntent): Record<string, unknown> {
  validateOrder(order);
  assertProtectionsAllowed(order, VENUE_CAPABILITIES.alpaca);
  if (!/^[A-Za-z0-9./-]{1,16}$/.test(order.symbol)) {
    throw new OrderRejected("Alpaca symbol is not usable.");
  }
  const timeInForce = alpacaTif(order.timeInForce);
  const stopLoss = order.protections?.stopLoss;
  const takeProfit = order.protections?.takeProfit;
  if ((stopLoss || takeProfit) && (timeInForce === "ioc" || timeInForce === "fok")) {
    throw new OrderRejected("Alpaca bracket and OTO orders require day or gtc time in force.");
  }
  const body: Record<string, unknown> = {
    symbol: order.symbol,
    qty: order.qty,
    side: order.side,
    type: order.type,
    time_in_force: timeInForce,
    client_order_id: order.clientOrderId,
  };
  if (order.type === "limit" || order.type === "stop_limit") body.limit_price = order.prices?.limit;
  if (order.type === "stop" || order.type === "stop_limit") body.stop_price = order.prices?.stop;
  if (stopLoss && takeProfit) {
    body.order_class = "bracket";
    body.take_profit = { limit_price: takeProfit.price };
    body.stop_loss = { stop_price: stopLoss.price };
  } else if (stopLoss || takeProfit) {
    body.order_class = "oto";
    if (takeProfit) body.take_profit = { limit_price: takeProfit.price };
    if (stopLoss) body.stop_loss = { stop_price: stopLoss.price };
  }
  return body;
}

interface AlpacaOrder {
  id?: string;
  status?: string;
  filled_qty?: string;
  filled_avg_price?: string | null;
  filled_at?: string | null;
}

function fillFromAlpaca(order: OrderIntent, placed: AlpacaOrder, ctx: ExecutionContext): FillRecord | undefined {
  if (!placed.id || !placed.filled_avg_price) return undefined;
  if (placed.status !== "filled" && Number(placed.filled_qty ?? "0") <= 0) return undefined;
  const time = placed.filled_at ?? ctx.now ?? new Date().toISOString();
  return buildFill({
    id: `alpaca:${placed.id}`,
    source: fillSourceFor(ctx.mode),
    adapterId: "alpaca",
    venue: "alpaca",
    symbol: order.symbol,
    side: order.side,
    lots: placed.filled_qty && Number(placed.filled_qty) > 0 ? placed.filled_qty : order.qty,
    price: placed.filled_avg_price,
    time,
    barCloseTime: time,
    orderId: placed.id,
    clientOrderId: order.clientOrderId,
    reason: fillReason(order.type, ctx.reason),
    spread: ctx.spread,
  });
}

export function createAlpacaBroker(config: AlpacaConfig, journal: FillJournal, http: HttpClient): BrokerAdapter {
  const secrets = [config.accessToken];
  return {
    id: "alpaca",
    capabilities: VENUE_CAPABILITIES.alpaca,
    async placeOrder(order, ctx) {
      const decision = assertCanSend(ctx);
      const body = buildAlpacaOrder(order);
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "POST",
        url: `${base}/v2/orders`,
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
      const placed = JSON.parse(response.body) as AlpacaOrder;
      if (!placed.id) throw httpError(response.status, response.body, secrets);
      const fill = fillFromAlpaca(order, placed, ctx);
      if (fill) journal.append(fill);
      const ack: OrderAck = {
        venue: "alpaca",
        orderId: placed.id,
        clientOrderId: order.clientOrderId,
        status: fill ? "filled" : "accepted",
        warnings: decision.warnings,
      };
      if (fill) ack.fill = fill;
      return ack;
    },
    async cancelOrder(orderId, _symbol, ctx) {
      assertCanSend(ctx);
      if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw new OrderRejected("Alpaca order id is not usable.");
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "DELETE",
        url: `${base}/v2/orders/${orderId}`,
        headers: { authorization: `Bearer ${config.accessToken}`, accept: "application/json" },
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
    },
  };
}
