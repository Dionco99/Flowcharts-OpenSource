// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "../adapter.js";
import { VENUE_CAPABILITIES } from "../capabilities.js";
import { DemoUnavailable } from "../../orders/errors.js";
import { assertCanSend, fillSourceFor, type ExecutionContext } from "../../orders/guard.js";
import { buildFill, fillReason, type FillJournal } from "../../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent } from "../../orders/model.js";
import type { CcxtOrderInput, CcxtOrderResult, CcxtSession } from "./session.js";

export function buildCcxtOrder(venue: "binance" | "bybit" | "okx" | "kraken", order: OrderIntent): CcxtOrderInput {
  const caps = VENUE_CAPABILITIES[venue];
  validateOrder(order);
  assertProtectionsAllowed(order, caps);
  const params: Record<string, unknown> = { clientOrderId: order.clientOrderId };
  let type: "market" | "limit" = "market";
  let price: string | undefined;
  if (order.type === "limit") {
    type = "limit";
    price = order.prices?.limit;
  } else if (order.type === "stop") {
    params.triggerPrice = Number(order.prices?.stop);
  } else if (order.type === "stop_limit") {
    type = "limit";
    price = order.prices?.limit;
    params.triggerPrice = Number(order.prices?.stop);
  }
  if (order.protections?.stopLoss) {
    params.stopLoss = { triggerPrice: Number(order.protections.stopLoss.price) };
  }
  if (order.protections?.takeProfit) {
    params.takeProfit = { triggerPrice: Number(order.protections.takeProfit.price) };
  }
  const input: CcxtOrderInput = {
    symbol: order.symbol,
    type,
    side: order.side,
    amount: order.qty,
    params,
  };
  if (price !== undefined) input.price = price;
  return input;
}

function journalCcxt(
  venue: CcxtSession["id"],
  order: OrderIntent,
  placed: CcxtOrderResult,
  ctx: ExecutionContext,
): ReturnType<typeof buildFill> | undefined {
  const filled = placed.filled ?? 0;
  if (placed.status !== "closed" && filled <= 0) return undefined;
  const price = placed.average ?? placed.price;
  if (price === undefined || !(price > 0)) return undefined;
  const time = placed.timestamp ? new Date(placed.timestamp).toISOString() : (ctx.now ?? new Date().toISOString());
  return buildFill({
    id: `ccxt:${venue}:${placed.id}`,
    source: fillSourceFor(ctx.mode),
    adapterId: "ccxt",
    venue,
    symbol: order.symbol,
    side: order.side,
    lots: filled > 0 ? String(filled) : order.qty,
    price: String(price),
    time,
    barCloseTime: time,
    orderId: placed.id,
    clientOrderId: order.clientOrderId,
    reason: fillReason(order.type, ctx.reason),
    commission: placed.feeCost !== undefined ? String(placed.feeCost) : "0",
    spread: ctx.spread,
  });
}

export function createCcxtAdapter(session: CcxtSession, journal: FillJournal): BrokerAdapter {
  return {
    id: session.id,
    capabilities: VENUE_CAPABILITIES[session.id],
    async placeOrder(order, ctx) {
      validateOrder(order);
      assertProtectionsAllowed(order, VENUE_CAPABILITIES[session.id]);
      const decision = assertCanSend(ctx);
      if (ctx.mode === "live") {
        throw new DemoUnavailable("This CCXT session is armed for demo trading and cannot place a live order.");
      }
      if (ctx.mode === "backtest") {
        throw new DemoUnavailable("Use the backtest adapter for backtest fills.");
      }
      if (session.demoArmed !== true) {
        throw new DemoUnavailable("CCXT session is not armed for demo trading.");
      }
      const placed = await session.createOrder(buildCcxtOrder(session.id, order));
      const fill = journalCcxt(session.id, order, placed, ctx);
      if (fill) journal.append(fill);
      const ack: OrderAck = {
        venue: session.id,
        orderId: placed.id,
        clientOrderId: order.clientOrderId,
        status: fill ? "filled" : "accepted",
        warnings: decision.warnings,
      };
      if (fill) ack.fill = fill;
      return ack;
    },
    async cancelOrder(orderId, symbol, ctx) {
      assertCanSend(ctx);
      if (ctx.mode === "live") {
        throw new DemoUnavailable("This CCXT session is armed for demo trading and cannot cancel a live order.");
      }
      await session.cancelOrder(orderId, symbol);
    },
  };
}

export function createKrakenAdapter(journal: FillJournal): BrokerAdapter {
  void journal;
  return {
    id: "kraken",
    capabilities: VENUE_CAPABILITIES.kraken,
    async placeOrder(order, ctx) {
      validateOrder(order);
      assertProtectionsAllowed(order, VENUE_CAPABILITIES.kraken);
      assertCanSend(ctx);
      throw new DemoUnavailable(
        "Kraken spot has no self-service CCXT demo. No order was sent.",
      );
    },
    async cancelOrder() {
      throw new DemoUnavailable("Kraken spot has no self-service CCXT demo. No cancel was sent.");
    },
  };
}
