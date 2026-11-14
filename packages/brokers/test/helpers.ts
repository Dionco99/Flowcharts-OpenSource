// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { HttpClient, HttpRequest, HttpResponse } from "../src/brokers/http.js";
import type { CcxtOrderInput, CcxtOrderResult, CcxtSession } from "../src/brokers/ccxt/session.js";
import type { OrderIntent } from "../src/orders/model.js";

export function recordingHttp(handler: (req: HttpRequest) => HttpResponse): HttpClient & { calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    async request(req) {
      calls.push(req);
      return handler(req);
    },
  };
}

export function demoSession(id: CcxtSession["id"], result: CcxtOrderResult): CcxtSession & { orders: CcxtOrderInput[] } {
  const orders: CcxtOrderInput[] = [];
  return {
    id,
    demoArmed: true,
    orders,
    async createOrder(input) {
      orders.push(input);
      return result;
    },
    async cancelOrder() {
      return;
    },
  };
}

export const btcMarket: OrderIntent = {
  clientOrderId: "btc-1",
  symbol: "BTC/USDT",
  side: "buy",
  type: "market",
  qty: "0.01",
};

export const equityLimit: OrderIntent = {
  clientOrderId: "aapl-1",
  symbol: "AAPL",
  side: "buy",
  type: "limit",
  qty: "10",
  prices: { limit: "130" },
  timeInForce: "gtc",
  protections: { stopLoss: { price: "120" }, takeProfit: { price: "150" } },
};
