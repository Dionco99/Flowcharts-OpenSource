// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "../adapter.js";
import { VENUE_CAPABILITIES } from "../capabilities.js";
import { httpError, type HttpClient } from "../http.js";
import { OrderRejected } from "../../orders/errors.js";
import { assertCanSend, endpointFor, fillSourceFor, type ExecutionContext } from "../../orders/guard.js";
import { buildFill, fillReason, type FillJournal, type FillRecord } from "../../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent } from "../../orders/model.js";

export interface OandaConfig {
  accountId: string;
  token: string;
}

const ENDPOINTS = {
  demo: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

export function toOandaInstrument(symbol: string): string {
  const underscored = symbol.trim().replace(/[\s/-]+/g, "_").replace(/_+/g, "_").toUpperCase();
  if (/^[A-Z]{3}_[A-Z]{3}$/.test(underscored)) return underscored;
  const raw = symbol.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (/^[A-Z]{6}$/.test(raw)) return `${raw.slice(0, 3)}_${raw.slice(3)}`;
  throw new OrderRejected("OANDA symbol must be a pair such as EUR/USD.");
}

export function buildOandaOrder(order: OrderIntent): { body: { order: Record<string, unknown> }; warnings: string[] } {
  validateOrder(order);
  assertProtectionsAllowed(order, VENUE_CAPABILITIES.oanda);
  if (order.type === "stop_limit") {
    throw new OrderRejected("OANDA v20 practice orders in this adapter are market, limit, or stop.");
  }
  if (order.clientOrderId.length > 50) {
    throw new OrderRejected("OANDA client order ids are limited to 50 characters.");
  }
  const warnings: string[] = [];
  let timeInForce = "GTC";
  if (order.type === "market") {
    timeInForce = order.timeInForce === "ioc" ? "IOC" : "FOK";
    if (order.timeInForce === "gtc" || order.timeInForce === "day") {
      warnings.push("OANDA market orders are sent as FOK.");
    }
  } else if (order.timeInForce === "ioc") timeInForce = "IOC";
  else if (order.timeInForce === "fok") timeInForce = "FOK";
  else if (order.timeInForce === "day") warnings.push("OANDA has no day time-in-force; sent GTC.");

  const ticket: Record<string, unknown> = {
    type: order.type === "market" ? "MARKET" : order.type === "limit" ? "LIMIT" : "STOP",
    instrument: toOandaInstrument(order.symbol),
    units: order.side === "buy" ? order.qty : `-${order.qty}`,
    timeInForce,
    positionFill: "DEFAULT",
    clientExtensions: { id: order.clientOrderId },
  };
  if (order.type === "limit") ticket.price = order.prices?.limit;
  if (order.type === "stop") ticket.price = order.prices?.stop;
  if (order.protections?.stopLoss) {
    ticket.stopLossOnFill = { price: order.protections.stopLoss.price, timeInForce: "GTC" };
  }
  if (order.protections?.takeProfit) {
    ticket.takeProfitOnFill = { price: order.protections.takeProfit.price, timeInForce: "GTC" };
  }
  return { body: { order: ticket }, warnings };
}

function accountPath(accountId: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(accountId)) throw new OrderRejected("OANDA account id is not usable.");
  return accountId;
}

interface OandaPayload {
  orderCreateTransaction?: { id?: string };
  orderFillTransaction?: { id?: string; price?: string; units?: string; time?: string; commission?: string };
}

function fillFromOanda(order: OrderIntent, payload: OandaPayload, ctx: ExecutionContext): FillRecord | undefined {
  const fill = payload.orderFillTransaction;
  if (!fill?.price || !fill.id) return undefined;
  const units = fill.units?.replace(/^-/, "") || order.qty;
  const time = fill.time ?? ctx.now ?? new Date().toISOString();
  return buildFill({
    id: `oanda:${fill.id}`,
    source: fillSourceFor(ctx.mode),
    adapterId: "oanda",
    venue: "oanda",
    symbol: order.symbol,
    side: order.side,
    lots: units,
    price: fill.price,
    time,
    barCloseTime: time,
    orderId: fill.id,
    clientOrderId: order.clientOrderId,
    reason: fillReason(order.type, ctx.reason),
    commission: fill.commission,
    spread: ctx.spread,
  });
}

export function createOandaBroker(config: OandaConfig, journal: FillJournal, http: HttpClient): BrokerAdapter {
  const secrets = [config.token];
  return {
    id: "oanda",
    capabilities: VENUE_CAPABILITIES.oanda,
    async placeOrder(order, ctx) {
      const decision = assertCanSend(ctx);
      const built = buildOandaOrder(order);
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "POST",
        url: `${base}/v3/accounts/${accountPath(config.accountId)}/orders`,
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(built.body),
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
      const payload = JSON.parse(response.body) as OandaPayload;
      const fill = fillFromOanda(order, payload, ctx);
      if (fill) journal.append(fill);
      const orderId = fill?.orderId ?? payload.orderCreateTransaction?.id ?? "";
      if (!orderId) throw httpError(response.status, response.body, secrets);
      const ack: OrderAck = {
        venue: "oanda",
        orderId,
        clientOrderId: order.clientOrderId,
        status: fill ? "filled" : "accepted",
        warnings: [...decision.warnings, ...built.warnings],
      };
      if (fill) ack.fill = fill;
      return ack;
    },
    async cancelOrder(orderId, _symbol, ctx) {
      assertCanSend(ctx);
      if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) throw new OrderRejected("OANDA order id is not usable.");
      const base = endpointFor(ctx.mode, ctx.confirmRealMoney, ENDPOINTS);
      const response = await http.request({
        method: "PUT",
        url: `${base}/v3/accounts/${accountPath(config.accountId)}/orders/${orderId}/cancel`,
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        body: "{}",
      });
      if (response.status < 200 || response.status >= 300) throw httpError(response.status, response.body, secrets);
    },
  };
}
