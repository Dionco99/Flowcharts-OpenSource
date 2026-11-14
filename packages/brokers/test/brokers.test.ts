// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBrokerPort } from "../src/broker/port.js";
import { createAlpacaBroker } from "../src/brokers/alpaca/adapter.js";
import { alpacaAuthorizeUrl, exchangeAlpacaCode } from "../src/brokers/alpaca/oauth.js";
import { createBacktestBroker } from "../src/brokers/backtest.js";
import { buildCcxtOrder, createCcxtAdapter, createKrakenAdapter } from "../src/brokers/ccxt/adapter.js";
import { createCTraderBroker, toCTraderNewOrder, UnboundCTraderTransport } from "../src/brokers/ctrader/adapter.js";
import { createIbkrBroker, toIbkrOrderRequest } from "../src/brokers/ibkr/gateway.js";
import { createOandaBroker } from "../src/brokers/oanda/adapter.js";
import { createTradierBroker } from "../src/brokers/tradier/adapter.js";
import { exchangeTradierCode } from "../src/brokers/tradier/oauth.js";
import { createTradeLockerBroker, loginTradeLockerDemo } from "../src/brokers/tradelocker/adapter.js";
import { DemoUnavailable, InterfaceOnlyError, ProtectionNotSupported, RealMoneyConfirmationRequired } from "../src/orders/errors.js";
import { FILL_KEYS, FillJournal } from "../src/orders/journal.js";
import type { OrderIntent } from "../src/orders/model.js";
import { btcMarket, demoSession, equityLimit, recordingHttp } from "./helpers.js";

const NOW = "2024-03-12T08:15:00.000Z";

describe("CCXT", () => {
  it("places a Binance demo order without attached protections", async () => {
    const session = demoSession("binance", { id: "99", status: "closed", filled: 0.01, average: 60000, feeCost: 0.1, timestamp: Date.parse(NOW) });
    const journal = new FillJournal();
    const broker = createCcxtAdapter(session, journal);
    const ack = await broker.placeOrder(btcMarket, { mode: "demo", now: NOW });
    assert.equal(session.orders[0]?.params.stopLoss, undefined);
    assert.equal(ack.status, "filled");
    assert.equal(ack.fill?.source, "demo");
    assert.equal(journal.records[0]?.venue, "binance");
    await assert.rejects(broker.placeOrder({ ...btcMarket, protections: { stopLoss: { price: "50000" } } }, { mode: "demo" }), ProtectionNotSupported);
    assert.equal(session.orders.length, 1);
  });

  it("sends Bybit and OKX stop-loss and take-profit on the demo order", () => {
    const protectedOrder: OrderIntent = {
      ...btcMarket,
      protections: { stopLoss: { price: "58000" }, takeProfit: { price: "64000" } },
    };
    const bybit = buildCcxtOrder("bybit", protectedOrder);
    const okx = buildCcxtOrder("okx", protectedOrder);
    assert.deepEqual(bybit.params.stopLoss, { triggerPrice: 58000 });
    assert.deepEqual(okx.params.takeProfit, { triggerPrice: 64000 });
    assert.throws(() => buildCcxtOrder("binance", protectedOrder), ProtectionNotSupported);
    assert.throws(() => buildCcxtOrder("kraken", protectedOrder), ProtectionNotSupported);
  });

  it("does not call Kraken", async () => {
    const journal = new FillJournal();
    const broker = createKrakenAdapter(journal);
    await assert.rejects(broker.placeOrder(btcMarket, { mode: "demo" }), DemoUnavailable);
    await assert.rejects(broker.placeOrder(btcMarket, { mode: "live", confirmRealMoney: true }), /Live network/);
    assert.equal(journal.records.length, 0);
  });

  it("refuses a live order on a demo-armed session before createOrder", async () => {
    const session = demoSession("okx", { id: "1" });
    const broker = createCcxtAdapter(session, new FillJournal());
    await assert.rejects(broker.placeOrder(btcMarket, { mode: "live" }), RealMoneyConfirmationRequired);
    assert.equal(session.orders.length, 0);
  });
});

describe("OANDA practice", () => {
  it("posts a practice order with stopLossOnFill and takeProfitOnFill", async () => {
    const http = recordingHttp(() => ({
      status: 201,
      body: JSON.stringify({
        orderCreateTransaction: { id: "10" },
        orderFillTransaction: {
          id: "11",
          price: "1.0850",
          units: "1000",
          time: NOW,
          commission: "0",
        },
      }),
    }));
    const journal = new FillJournal();
    const broker = createOandaBroker({ accountId: "101-004-1", token: "practice-token-value" }, journal, http);
    const order: OrderIntent = {
      clientOrderId: "eu-1",
      symbol: "EUR/USD",
      side: "sell",
      type: "market",
      qty: "1000",
      protections: { stopLoss: { price: "1.0900" }, takeProfit: { price: "1.0700" } },
    };
    const ack = await broker.placeOrder(order, { mode: "demo", now: NOW });
    const request = http.calls[0];
    assert.equal(request && new URL(request.url).host, "api-fxpractice.oanda.com");
    assert.equal(request?.headers?.authorization?.includes("practice-token-value"), true);
    const body = JSON.parse(request?.body ?? "{}") as { order: { units: string; stopLossOnFill: { price: string }; takeProfitOnFill: { price: string } } };
    assert.equal(body.order.units, "-1000");
    assert.equal(body.order.stopLossOnFill.price, "1.0900");
    assert.equal(body.order.takeProfitOnFill.price, "1.0700");
    assert.equal(ack.fill?.source, "demo");
    assert.equal(ack.fill?.price, "1.0850");
    await assert.rejects(broker.placeOrder(order, { mode: "live" }), RealMoneyConfirmationRequired);
    assert.equal(http.calls.length, 1);
  });
});

describe("Alpaca paper OAuth", () => {
  it("builds an authorize URL without the client secret and posts a paper bracket", async () => {
    const authorize = alpacaAuthorizeUrl({
      clientId: "client-public",
      redirectUri: "https://localhost/callback",
      state: "state-1",
    });
    assert.equal(new URL(authorize).host, "app.alpaca.markets");
    assert.equal(authorize.includes("client-secret-value"), false);
    const tokenHttp = recordingHttp(() => ({ status: 200, body: JSON.stringify({ access_token: "paper-access-token" }) }));
    const token = await exchangeAlpacaCode(tokenHttp, {
      code: "auth-code",
      clientId: "client-public",
      clientSecret: "client-secret-value",
      redirectUri: "https://localhost/callback",
    });
    assert.equal(token.accessToken, "paper-access-token");
    assert.equal(tokenHttp.calls[0]?.url, "https://api.alpaca.markets/oauth/token");
    const http = recordingHttp(() => ({
      status: 200,
      body: JSON.stringify({
        id: "ord-1",
        status: "filled",
        filled_qty: "1",
        filled_avg_price: "190.5",
        filled_at: NOW,
      }),
    }));
    const journal = new FillJournal();
    const broker = createAlpacaBroker({ accessToken: token.accessToken }, journal, http);
    const ack = await broker.placeOrder(
      {
        clientOrderId: "spy-1",
        symbol: "SPY",
        side: "buy",
        type: "market",
        qty: "1",
        timeInForce: "day",
        protections: { stopLoss: { price: "180" }, takeProfit: { price: "200" } },
      },
      { mode: "paper", now: NOW },
    );
    assert.equal(new URL(http.calls[0]?.url ?? "").host, "paper-api.alpaca.markets");
    const body = JSON.parse(http.calls[0]?.body ?? "{}") as { order_class: string; stop_loss: { stop_price: string } };
    assert.equal(body.order_class, "bracket");
    assert.equal(body.stop_loss.stop_price, "180");
    assert.equal(ack.fill?.source, "demo");
    const failing = recordingHttp(() => ({ status: 401, body: "bad client-secret-value" }));
    await assert.rejects(
      exchangeAlpacaCode(failing, {
        code: "auth-code",
        clientId: "client-public",
        clientSecret: "client-secret-value",
        redirectUri: "https://localhost/callback",
      }),
      (error: Error) => !error.message.includes("client-secret-value"),
    );
  });
});

describe("Tradier sandbox and TradeLocker demo", () => {
  it("places a sandbox OTOCO and a demo order with absolute protections", async () => {
    const tradierHttp = recordingHttp(() => ({
      status: 200,
      body: JSON.stringify({ order: { id: 55, status: "ok", avg_fill_price: "130.00", exec_quantity: "10", transaction_date: NOW } }),
    }));
    const tradier = createTradierBroker({ accountId: "6YA00001", accessToken: "sandbox-token-value" }, new FillJournal(), tradierHttp);
    const ack = await tradier.placeOrder(equityLimit, { mode: "demo", now: NOW });
    const params = new URLSearchParams(tradierHttp.calls[0]?.body ?? "");
    assert.equal(new URL(tradierHttp.calls[0]?.url ?? "").host, "sandbox.tradier.com");
    assert.equal(params.get("class"), "otoco");
    assert.equal(params.get("preview"), "false");
    assert.equal(params.get("type[1]"), "limit");
    assert.equal(params.get("price[1]"), "150");
    assert.equal(params.get("type[2]"), "stop");
    assert.equal(params.get("stop[2]"), "120");
    assert.equal(ack.fill?.venue, "tradier");
    await assert.rejects(
      tradier.placeOrder({ ...equityLimit, type: "market", prices: undefined, clientOrderId: "mkt-1" }, { mode: "demo" }),
      ProtectionNotSupported,
    );

    const lockerHttp = recordingHttp(() => ({
      status: 200,
      body: JSON.stringify({ s: "ok", d: { orderId: "77", avgPrice: "1.085" } }),
    }));
    const loginHttp = recordingHttp(() => ({
      status: 200,
      body: JSON.stringify({ accessToken: "jwt-access", refreshToken: "jwt-refresh" }),
    }));
    const login = await loginTradeLockerDemo(loginHttp, { email: "trader@example.com", password: "desk-password", server: "demo" });
    assert.equal(loginHttp.calls[0]?.url, "https://demo.tradelocker.com/backend-api/auth/jwt/token");
    const journal = new FillJournal();
    const locker = createTradeLockerBroker(
      {
        accountId: "1",
        accNum: "1",
        accessToken: login.accessToken,
        routes: { "EUR/USD": { tradableInstrumentId: 42, routeId: 7 } },
      },
      journal,
      lockerHttp,
    );
    await locker.placeOrder(
      {
        clientOrderId: "eu-demo",
        symbol: "EUR/USD",
        side: "buy",
        type: "market",
        qty: "0.1",
        protections: { stopLoss: { price: "1.08" }, takeProfit: { price: "1.09" } },
      },
      { mode: "demo", now: NOW },
    );
    const sent = JSON.parse(lockerHttp.calls[0]?.body ?? "{}") as { stopLossType: string; takeProfit: number; validity: string };
    assert.equal(new URL(lockerHttp.calls[0]?.url ?? "").host, "demo.tradelocker.com");
    assert.equal(sent.stopLossType, "absolute");
    assert.equal(sent.takeProfit, 1.09);
    assert.equal(sent.validity, "IOC");
    assert.equal(journal.records[0]?.source, "demo");
  });

  it("redacts the Tradier client secret from a failed token exchange", async () => {
    const http = recordingHttp(() => ({ status: 400, body: "invalid client-secret-value" }));
    await assert.rejects(
      exchangeTradierCode(http, { code: "code-1", clientId: "id-1", clientSecret: "client-secret-value" }),
      (error: Error) => !error.message.includes("client-secret-value"),
    );
  });
});

describe("cTrader stub and IBKR interface", () => {
  it("maps a cTrader order and does not open a socket", async () => {
    const config = { accountId: "1001", symbols: { "EUR/USD": "1" } };
    const message = toCTraderNewOrder(
      {
        clientOrderId: "ct-1",
        symbol: "EUR/USD",
        side: "buy",
        type: "limit",
        qty: "1.5",
        prices: { limit: "1.08" },
        protections: { stopLoss: { price: "1.07" }, takeProfit: { price: "1.09" } },
      },
      config,
    );
    assert.equal(message.payloadType, "PROTO_OA_NEW_ORDER_REQ");
    assert.equal(message.volume, "150");
    assert.equal(message.stopLoss, "1.07");
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("fetch");
    };
    try {
      const broker = createCTraderBroker(config, new FillJournal(), new UnboundCTraderTransport());
      await assert.rejects(broker.placeOrder({
        clientOrderId: "ct-1",
        symbol: "EUR/USD",
        side: "buy",
        type: "market",
        qty: "1",
      }, { mode: "demo" }), InterfaceOnlyError);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(called, false);
  });

  it("maps an IBKR bracket and does not submit it", async () => {
    const request = toIbkrOrderRequest(equityLimit, { accountId: "DU123456", conid: 265598 });
    assert.equal(request.orders.length, 3);
    assert.equal(request.orders[0]?.orderType, "LMT");
    assert.equal(request.orders[1]?.orderType, "LMT");
    assert.equal(request.orders[1]?.parentId, "aapl-1");
    assert.equal(request.orders[2]?.orderType, "STP");
    assert.equal(request.orders[2]?.auxPrice, 120);
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("fetch");
    };
    try {
      await assert.rejects(createIbkrBroker(new FillJournal()).placeOrder(equityLimit, { mode: "demo" }), InterfaceOnlyError);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(called, false);
  });
});

describe("shared fill stream", () => {
  it("matches keys across backtest and the demo adapters", async () => {
    const backtestJournal = new FillJournal();
    const backtest = await createBacktestBroker(backtestJournal).placeOrder(
      { clientOrderId: "bt", symbol: "EUR/USD", side: "buy", type: "market", qty: "1", },
      { mode: "backtest", markPrice: "1.1", now: NOW, commission: "0.2", spread: "0.0001" },
    );
    const oanda = recordingHttp(() => ({
      status: 201,
      body: JSON.stringify({ orderFillTransaction: { id: "2", price: "1.1", units: "1", time: NOW, commission: "0.2" } }),
    }));
    const oandaAck = await createOandaBroker({ accountId: "abc", token: "t" }, new FillJournal(), oanda).placeOrder(
      { clientOrderId: "eu", symbol: "EUR/USD", side: "buy", type: "market", qty: "1" },
      { mode: "demo", now: NOW, spread: "0.0001" },
    );
    const ccxt = demoSession("bybit", { id: "3", status: "closed", filled: 1, average: 1.1, feeCost: 0.2, timestamp: Date.parse(NOW) });
    const ccxtAck = await createCcxtAdapter(ccxt, new FillJournal()).placeOrder(
      { clientOrderId: "btc-1", symbol: "BTC/USDT", side: "buy", type: "market", qty: "1" },
      { mode: "demo", now: NOW, spread: "0.0001" },
    );
    const keys = [backtest.fill, oandaAck.fill, ccxtAck.fill].map((fill) => Object.keys(fill ?? {}).sort().join());
    assert.equal(keys[0], [...FILL_KEYS].sort().join());
    assert.equal(keys[0], keys[1]);
    assert.equal(keys[1], keys[2]);
    assert.equal(backtest.fill?.source, "backtest");
    assert.equal(oandaAck.fill?.source, "demo");
    assert.equal(ccxtAck.fill?.source, "demo");
    assert.equal(backtest.fill?.reason, "market");
    assert.equal(backtest.fill?.ambiguous, false);
    assert.equal(backtest.fill?.lots, "1");
  });
});

describe("BrokerPort", () => {
  it("returns codes instead of throwing, and a repeated client order id does not send twice", async () => {
    const session = demoSession("bybit", { id: "9", status: "closed", filled: 0.01, average: 60000, timestamp: Date.parse(NOW) });
    const port = createBrokerPort(createCcxtAdapter(session, new FillJournal()), {
      symbol: "BTC/USDT",
      mode: "demo",
      now: NOW,
    });
    assert.equal(port.adapterId, "ccxt");
    const first = await port.place({
      clientOrderId: "p1",
      side: "buy",
      type: "market",
      lots: "0.01",
      stopLoss: "58000",
      takeProfit: "64000",
    });
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.fills[0]?.reason, "market");
    const again = await port.place({ clientOrderId: "p1", side: "buy", type: "market", lots: "0.01" });
    assert.equal(again, first);
    assert.equal(session.orders.length, 1);
    const hidden = await createBrokerPort(createCcxtAdapter(demoSession("binance", { id: "1" }), new FillJournal()), {
      symbol: "BTC/USDT",
      mode: "demo",
    }).place({ clientOrderId: "p2", side: "buy", type: "market", lots: "0.01", stopLoss: "1" });
    assert.equal(hidden.ok, false);
    if (!hidden.ok) assert.equal(hidden.code, "protection_not_supported");
    const livePort = createBrokerPort(createCcxtAdapter(session, new FillJournal()), {
      symbol: "BTC/USDT",
      mode: "live",
    });
    const blocked = await livePort.place({ clientOrderId: "live-1", side: "buy", type: "market", lots: "0.01" });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "real_money_confirmation_required");
    const kraken = await createBrokerPort(createKrakenAdapter(new FillJournal()), {
      symbol: "BTC/USDT",
      mode: "demo",
    }).place({ clientOrderId: "k1", side: "buy", type: "market", lots: "0.01" });
    assert.equal(kraken.ok, false);
    if (!kraken.ok) assert.equal(kraken.code, "demo_unavailable");
    const book = port.snapshot();
    assert.equal(book.position.side, "long");
    assert.equal(book.orders.length, 0);
    assert.equal(book.fills.length, 1);
  });
});
