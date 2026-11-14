// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter } from "../adapter.js";
import { VENUE_CAPABILITIES } from "../capabilities.js";
import { InterfaceOnlyError, OrderRejected } from "../../orders/errors.js";
import { assertCanSend } from "../../orders/guard.js";
import type { FillJournal } from "../../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent, type TimeInForce } from "../../orders/model.js";

/**
 * Client Portal Gateway contract. Nothing in this package implements `submitOrders`
 * or opens `https://localhost:5000`.
 */
export interface IbkrGateway {
  readonly baseUrl: "https://localhost:5000/v1/api";
  submitOrders(accountId: string, request: IbkrOrderRequest): Promise<unknown>;
  cancelOrder(accountId: string, orderId: string): Promise<void>;
}

export interface IbkrTicket {
  acctId: string;
  conid: number;
  cOID?: string;
  parentId?: string;
  orderType: "MKT" | "LMT" | "STP" | "STOP_LIMIT";
  side: "BUY" | "SELL";
  quantity: number;
  tif: "DAY" | "GTC" | "IOC";
  price?: number;
  auxPrice?: number;
}

export interface IbkrOrderRequest {
  orders: IbkrTicket[];
}

export interface IbkrContract {
  accountId: string;
  conid: number;
}

function tif(value: TimeInForce | undefined): "DAY" | "GTC" | "IOC" {
  if (value === "fok") throw new OrderRejected("IBKR Client Portal tickets in this interface have no FOK time in force.");
  if (value === "gtc") return "GTC";
  if (value === "ioc") return "IOC";
  return "DAY";
}

function orderType(type: OrderIntent["type"]): IbkrTicket["orderType"] {
  if (type === "market") return "MKT";
  if (type === "limit") return "LMT";
  if (type === "stop") return "STP";
  return "STOP_LIMIT";
}

/** Maps a Flowchart order onto the gateway's bracket body. Does not send it. */
export function toIbkrOrderRequest(order: OrderIntent, contract: IbkrContract): IbkrOrderRequest {
  validateOrder(order);
  assertProtectionsAllowed(order, VENUE_CAPABILITIES.ibkr);
  if (!Number.isInteger(contract.conid) || contract.conid <= 0) {
    throw new OrderRejected("IBKR conid must be a positive integer.");
  }
  if (!/^[A-Za-z0-9]+$/.test(contract.accountId)) throw new OrderRejected("IBKR account id is not usable.");
  const side = order.side === "buy" ? "BUY" : "SELL";
  const exit = order.side === "buy" ? "SELL" : "BUY";
  const quantity = Number(order.qty);
  const parent: IbkrTicket = {
    acctId: contract.accountId,
    conid: contract.conid,
    cOID: order.clientOrderId,
    orderType: orderType(order.type),
    side,
    quantity,
    tif: tif(order.timeInForce),
  };
  if (order.type === "limit" || order.type === "stop_limit") parent.price = Number(order.prices?.limit);
  if (order.type === "stop" || order.type === "stop_limit") parent.auxPrice = Number(order.prices?.stop);
  const orders: IbkrTicket[] = [parent];
  if (order.protections?.takeProfit) {
    orders.push({
      acctId: contract.accountId,
      conid: contract.conid,
      parentId: order.clientOrderId,
      orderType: "LMT",
      side: exit,
      quantity,
      tif: "GTC",
      price: Number(order.protections.takeProfit.price),
    });
  }
  if (order.protections?.stopLoss) {
    orders.push({
      acctId: contract.accountId,
      conid: contract.conid,
      parentId: order.clientOrderId,
      orderType: "STP",
      side: exit,
      quantity,
      tif: "GTC",
      auxPrice: Number(order.protections.stopLoss.price),
    });
  }
  return { orders };
}

export function createIbkrBroker(journal: FillJournal): BrokerAdapter {
  void journal;
  return {
    id: "ibkr",
    capabilities: VENUE_CAPABILITIES.ibkr,
    async placeOrder(order, ctx) {
      validateOrder(order);
      assertProtectionsAllowed(order, VENUE_CAPABILITIES.ibkr);
      assertCanSend(ctx);
      throw new InterfaceOnlyError(
        "IBKR Client Portal Gateway is interface-only. No order was sent to localhost or to IBKR.",
      );
    },
    async cancelOrder() {
      throw new InterfaceOnlyError("IBKR Client Portal Gateway is interface-only. No cancel was sent.");
    },
  };
}
