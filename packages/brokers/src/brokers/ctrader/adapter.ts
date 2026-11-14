// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "../adapter.js";
import { VENUE_CAPABILITIES } from "../capabilities.js";
import { toCTraderVolume } from "../../orders/decimal.js";
import { InterfaceOnlyError, OrderRejected } from "../../orders/errors.js";
import { assertCanSend, fillSourceFor, type ExecutionContext } from "../../orders/guard.js";
import { buildFill, fillReason, type FillJournal } from "../../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent } from "../../orders/model.js";

/** JSON stand-in for ProtoOANewOrderReq. This build does not open the protobuf socket. */
export interface CTraderNewOrderReq {
  payloadType: "PROTO_OA_NEW_ORDER_REQ";
  ctidTraderAccountId: string;
  symbolId: string;
  orderType: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  tradeSide: "BUY" | "SELL";
  volume: string;
  limitPrice?: string;
  stopPrice?: string;
  stopLoss?: string;
  takeProfit?: string;
  clientOrderId: string;
}

export interface CTraderExecution {
  orderId: string;
  executionPrice?: string;
  filledAt?: string;
}

export interface CTraderTransport {
  send(message: CTraderNewOrderReq): Promise<CTraderExecution>;
}

export class UnboundCTraderTransport implements CTraderTransport {
  async send(): Promise<CTraderExecution> {
    throw new InterfaceOnlyError("cTrader Open API socket is not opened in this build.");
  }
}

export interface CTraderConfig {
  accountId: string;
  symbols: Record<string, string>;
}

const ORDER_TYPE = {
  market: "MARKET",
  limit: "LIMIT",
  stop: "STOP",
  stop_limit: "STOP_LIMIT",
} as const;

export function toCTraderNewOrder(order: OrderIntent, config: CTraderConfig): CTraderNewOrderReq {
  validateOrder(order);
  assertProtectionsAllowed(order, VENUE_CAPABILITIES.ctrader);
  if (!/^\d+$/.test(config.accountId)) throw new OrderRejected("cTrader account id must be digits.");
  const symbolId = config.symbols[order.symbol];
  if (!symbolId || !/^\d+$/.test(symbolId)) throw new OrderRejected(`No cTrader symbol id for ${order.symbol}.`);
  const message: CTraderNewOrderReq = {
    payloadType: "PROTO_OA_NEW_ORDER_REQ",
    ctidTraderAccountId: config.accountId,
    symbolId,
    orderType: ORDER_TYPE[order.type],
    tradeSide: order.side === "buy" ? "BUY" : "SELL",
    volume: toCTraderVolume(order.qty),
    clientOrderId: order.clientOrderId,
  };
  if (order.prices?.limit) message.limitPrice = order.prices.limit;
  if (order.prices?.stop) message.stopPrice = order.prices.stop;
  if (order.protections?.stopLoss) message.stopLoss = order.protections.stopLoss.price;
  if (order.protections?.takeProfit) message.takeProfit = order.protections.takeProfit.price;
  return message;
}

export function createCTraderBroker(
  config: CTraderConfig,
  journal: FillJournal,
  transport: CTraderTransport = new UnboundCTraderTransport(),
): BrokerAdapter {
  return {
    id: "ctrader",
    capabilities: VENUE_CAPABILITIES.ctrader,
    async placeOrder(order, ctx) {
      const decision = assertCanSend(ctx);
      if (ctx.mode === "live") {
        throw new InterfaceOnlyError("cTrader live placement is not implemented.");
      }
      const message = toCTraderNewOrder(order, config);
      const execution = await transport.send(message);
      let fill: ReturnType<typeof buildFill> | undefined;
      if (execution.executionPrice) {
        const time = execution.filledAt ?? ctx.now ?? new Date().toISOString();
        fill = buildFill({
          id: `ctrader:${execution.orderId}`,
          source: fillSourceFor(ctx.mode),
          adapterId: "ctrader",
          venue: "ctrader",
          symbol: order.symbol,
          side: order.side,
          lots: order.qty,
          price: execution.executionPrice,
          time,
          barCloseTime: time,
          orderId: execution.orderId,
          clientOrderId: order.clientOrderId,
          reason: fillReason(order.type, ctx.reason),
          spread: ctx.spread,
        });
        journal.append(fill);
      }
      const ack: OrderAck = {
        venue: "ctrader",
        orderId: execution.orderId,
        clientOrderId: order.clientOrderId,
        status: fill ? "filled" : "accepted",
        warnings: decision.warnings,
      };
      if (fill) ack.fill = fill;
      return ack;
    },
    async cancelOrder() {
      throw new InterfaceOnlyError("cTrader Open API socket is not opened in this build.");
    },
  };
}
