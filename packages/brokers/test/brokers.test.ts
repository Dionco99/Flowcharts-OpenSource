// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { inspect } from "node:util";
import { describe, it } from "node:test";
import {
  BrokerError,
  CredentialVault,
  FILL_KEYS,
  REAL_MONEY_CONFIRMATION_DEFAULT,
  VENUE_CATALOG,
  alpacaAuthorizeUrl,
  armCcxtDemo,
  buildCcxtOrder,
  ccxtDemoTarget,
  createBroker,
  createGuardedClient,
  exchangeAlpacaCode,
  exchangeTradierCode,
  loginTradeLockerDemo,
  protectionsVisible,
  reviewFundedNext,
  toCtraderNewOrder,
  toIbkrOrderRequest,
  type BrokerResult,
  type CcxtClient,
  type HttpRequest,
  type HttpResponse,
} from "../src/index.ts";

const NOW = "2024-03-12T08:15:00.000Z";

function ok<T>(result: BrokerResult<T>): T {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result.value;
}

function recording(respond: (req: HttpRequest) => HttpResponse) {
  const calls: HttpRequest[] = [];
  return {
    calls,
    client: {
      async request(req: HttpRequest): Promise<HttpResponse> {
        calls.push(req);
        return respond(req);
      },
    },
  };
}

function json(status: number, body: unknown): HttpResponse {
  return { status, body: JSON.stringify(body) };
}

function fakeCcxt(id: string, result: { id?: string; status?: string; average?: number; filled?: number; fee?: { cost?: number }; timestamp?: number }): CcxtClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    id,
    apiKey: "key-value-12345678",
    secret: "secret-value-12345678",
    calls,
    urls: { api: { public: `https://api.${id}.com` } },
    headers: {},
    enableDemoTrading(enabled: boolean) {
      if (!enabled) return;
      if (id === "binance") this.urls.api.public = "https://demo-api.binance.com";
      if (id === "bybit") this.urls.api.public = "https://api-demo.bybit.com";
    },
    setSandboxMode(enabled: boolean) {
      if (enabled) this.headers["x-simulated-trading"] = "1";
    },
    async createOrder(...args: unknown[]) {
      calls.push(args);
      return result;
    },
    async cancelOrder() {
      calls.push(["cancel"]);
    },
  };
}

describe("demo and paper orders", () => {
  it("posts an OANDA practice order with stopLossOnFill and takeProfitOnFill", async () => {
    const http = recording(() => json(201, {
      orderCreateTransaction: { id: "10" },
      orderFillTransaction: { id: "11", price: "1.0850", units: "1000", time: NOW, commission: "0.20" },
    }));
    const broker = createBroker({
      venue: "oanda",
      symbol: "EUR/USD",
      now: NOW,
      credentials: { accountId: "101-004-1", token: "practice-token-value" },
      http: http.client,
    });
    const ack = ok(await broker.place({
      clientOrderId: "eu-1",
      side: "sell",
      type: "market",
      lots: "1000",
      stopLoss: "1.0900",
      takeProfit: "1.0700",
    }));
    const request = http.calls[0];
    assert.equal(request && new URL(request.url).host, "api-fxpractice.oanda.com");
    assert.equal(request?.headers?.authorization, "Bearer practice-token-value");
    const body = JSON.parse(request?.body ?? "{}") as { order: { units: string; stopLossOnFill: { price: string }; takeProfitOnFill: { price: string } } };
    assert.equal(body.order.units, "-1000");
    assert.equal(body.order.stopLossOnFill.price, "1.0900");
    assert.equal(body.order.takeProfitOnFill.price, "1.0700");
    assert.equal(ack.fill?.source, "demo");
    assert.equal(ack.fill?.price, "1.0850");
    assert.equal(ack.fill?.realizedPnl, "-0.2");
    assert.equal(ack.fill?.ambiguous, false);
    assert.equal(ack.transmitted, true);
  });

  it("does not call the venue when the credential is missing", async () => {
    const http = recording(() => json(201, {}));
    const broker = createBroker({ venue: "oanda", symbol: "EURUSD", http: http.client, credentials: {} });
    const before = JSON.stringify(broker.snapshot());
    const result = await broker.place({ clientOrderId: "eu-1", side: "buy", type: "market", lots: "1" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "credential_required");
    assert.equal(http.calls.length, 0);
    assert.equal(JSON.stringify(broker.snapshot()), before);
  });

  it("builds an Alpaca authorize URL without the secret and posts a paper bracket", async () => {
    const authorize = alpacaAuthorizeUrl({ clientId: "client-public", redirectUri: "https://localhost/callback", state: "state-1" });
    assert.equal(new URL(authorize).host, "app.alpaca.markets");
    assert.equal(authorize.includes("client-secret-value"), false);
    const tokenHttp = recording(() => json(200, { access_token: "paper-access-token" }));
    const token = await exchangeAlpacaCode(tokenHttp.client, {
      code: "auth-code",
      clientId: "client-public",
      clientSecret: "client-secret-value",
      redirectUri: "https://localhost/callback",
    });
    assert.equal(token.accessToken, "paper-access-token");
    assert.equal(tokenHttp.calls[0]?.url, "https://api.alpaca.markets/oauth/token");
    const http = recording(() => json(200, { id: "ord-1", status: "filled", filled_qty: "1", filled_avg_price: "190.5", filled_at: NOW }));
    const broker = createBroker({
      venue: "alpaca",
      mode: "paper",
      symbol: "SPY",
      now: NOW,
      credentials: { accessToken: token.accessToken },
      http: http.client,
    });
    const ack = ok(await broker.place({
      clientOrderId: "spy-1",
      side: "buy",
      type: "market",
      lots: "1",
      stopLoss: "180",
      takeProfit: "200",
    }));
    assert.equal(new URL(http.calls[0]?.url ?? "").host, "paper-api.alpaca.markets");
    const body = JSON.parse(http.calls[0]?.body ?? "{}") as { order_class: string; stop_loss: { stop_price: string } };
    assert.equal(body.order_class, "bracket");
    assert.equal(body.stop_loss.stop_price, "180");
    assert.equal(ack.fill?.source, "demo");
  });

  it("places a Tradier sandbox OTOCO and refuses protections on a market order", async () => {
    const http = recording(() => json(200, { order: { id: 55, status: "ok", avg_fill_price: "130.00", exec_quantity: "10", transaction_date: NOW } }));
    const broker = createBroker({
      venue: "tradier",
      symbol: "AAPL",
      now: NOW,
      credentials: { accountId: "6YA00001", accessToken: "sandbox-token-value" },
      http: http.client,
    });
    const ack = ok(await broker.place({
      clientOrderId: "aapl-1",
      side: "buy",
      type: "limit",
      lots: "10",
      limitPrice: "130",
      stopLoss: "120",
      takeProfit: "150",
    }));
    const params = new URLSearchParams(http.calls[0]?.body ?? "");
    assert.equal(new URL(http.calls[0]?.url ?? "").host, "sandbox.tradier.com");
    assert.equal(params.get("class"), "otoco");
    assert.equal(params.get("preview"), "false");
    assert.equal(params.get("type[1]"), "limit");
    assert.equal(params.get("price[1]"), "150");
    assert.equal(params.get("type[2]"), "stop");
    assert.equal(params.get("stop[2]"), "120");
    assert.equal(ack.fill?.venue, "tradier");
    const before = http.calls.length;
    const rejected = await broker.place({
      clientOrderId: "mkt-1",
      side: "buy",
      type: "market",
      lots: "10",
      stopLoss: "120",
      takeProfit: "150",
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.code, "protection_not_supported");
    assert.equal(http.calls.length, before);
  });

  it("logs in to TradeLocker demo and sends absolute protection", async () => {
    const loginHttp = recording(() => json(200, { accessToken: "jwt-access" }));
    const login = await loginTradeLockerDemo(loginHttp.client, { email: "trader@example.com", password: "desk-password", server: "demo" });
    assert.equal(loginHttp.calls[0]?.url, "https://demo.tradelocker.com/backend-api/auth/jwt/token");
    const http = recording(() => json(200, { d: { orderId: "77", avgPrice: "1.085" } }));
    const broker = createBroker({
      venue: "tradelocker",
      symbol: "EURUSD",
      now: NOW,
      credentials: { accountId: "1", accNum: "1", accessToken: login.accessToken },
      routes: { EURUSD: { tradableInstrumentId: 42, routeId: 7 } },
      http: http.client,
    });
    ok(await broker.place({
      clientOrderId: "eu-demo",
      side: "buy",
      type: "market",
      lots: "0.1",
      stopLoss: "1.08",
      takeProfit: "1.09",
    }));
    const sent = JSON.parse(http.calls[0]?.body ?? "{}") as { stopLossType: string; takeProfit: number; validity: string };
    assert.equal(new URL(http.calls[0]?.url ?? "").host, "demo.tradelocker.com");
    assert.equal(sent.stopLossType, "absolute");
    assert.equal(sent.takeProfit, 1.09);
    assert.equal(sent.validity, "IOC");
  });

  it("arms CCXT demo hosts and does not call Kraken", async () => {
    assert.deepEqual(ccxtDemoTarget("binance"), { hostIncludes: "demo-api.binance.com" });
    assert.deepEqual(ccxtDemoTarget("bybit"), { hostIncludes: "api-demo" });
    assert.deepEqual(ccxtDemoTarget("okx"), { header: ["x-simulated-trading", "1"] });

    const binance = fakeCcxt("binance", { id: "99", status: "closed", filled: 0.01, average: 60000, fee: { cost: 0.1 }, timestamp: Date.parse(NOW) });
    const broker = createBroker({ venue: "binance", symbol: "BTC/USDT", now: NOW, ccxt: binance, credentials: { apiKey: "key-value-12345678", secret: "secret-value-12345678" } });
    const ack = ok(await broker.place({ clientOrderId: "btc-1", side: "buy", type: "market", lots: "0.01" }));
    assert.equal(JSON.stringify(binance.urls).includes("demo-api.binance.com"), true);
    assert.equal(binance.calls.length, 1);
    assert.equal(ack.fill?.venue, "binance");
    assert.equal(ack.fill?.source, "demo");
    const hidden = await broker.place({ clientOrderId: "btc-2", side: "buy", type: "market", lots: "0.01", stopLoss: "50000" });
    assert.equal(hidden.ok, false);
    if (!hidden.ok) assert.equal(hidden.code, "protection_not_supported");
    assert.equal(binance.calls.length, 1);
    assert.equal(protectionsVisible("binance", "market").stopLoss, false);
    assert.equal(protectionsVisible("tradier", "market").takeProfit, false);
    assert.equal(protectionsVisible("tradier", "limit").stopLoss, true);

    const protectedOrder = { clientOrderId: "btc-3", side: "buy" as const, type: "market" as const, lots: "0.01", limitPrice: null, stopPrice: null, stopLoss: "58000", takeProfit: "64000", confirmRealMoney: false };
    assert.deepEqual(buildCcxtOrder("bybit", protectedOrder, "BTC/USDT").params.stopLoss, { triggerPrice: 58000 });
    assert.deepEqual(buildCcxtOrder("okx", protectedOrder, "BTC/USDT").params.takeProfit, { triggerPrice: 64000 });

    const kraken = fakeCcxt("kraken", { id: "1" });
    const refused = createBroker({ venue: "kraken", symbol: "BTC/USDT", ccxt: kraken, credentials: { apiKey: "key-value-12345678", secret: "secret-value-12345678" } });
    const krakenResult = await refused.place({ clientOrderId: "k-1", side: "buy", type: "market", lots: "0.01" });
    assert.equal(krakenResult.ok, false);
    if (!krakenResult.ok) assert.equal(krakenResult.code, "demo_unavailable");
    assert.equal(kraken.calls.length, 0);
    armCcxtDemo(binance);
    assert.throws(() => armCcxtDemo(kraken), (error: unknown) => error instanceof BrokerError && error.code === "demo_unavailable");
  });

  it("returns the original ack for a repeated client order id and can retry a rejection", async () => {
    let attempts = 0;
    const http = recording(() => {
      attempts += 1;
      if (attempts === 1) return { status: 500, body: "unavailable" };
      return json(201, { orderCreateTransaction: { id: "10" }, orderFillTransaction: { id: "11", price: "1.1", units: "1", time: NOW, commission: "0" } });
    });
    const broker = createBroker({
      venue: "oanda",
      symbol: "EURUSD",
      now: NOW,
      credentials: { accountId: "abc", token: "practice-token-value" },
      http: http.client,
    });
    const failed = await broker.place({ clientOrderId: "eu-1", side: "buy", type: "market", lots: "1" });
    assert.equal(failed.ok, false);
    if (!failed.ok) assert.equal(failed.code, "venue_rejected");
    const first = ok(await broker.place({ clientOrderId: "eu-1", side: "buy", type: "market", lots: "1" }));
    const second = ok(await broker.place({ clientOrderId: "eu-1", side: "buy", type: "market", lots: "9" }));
    assert.equal(second.orderId, first.orderId);
    assert.equal(http.calls.length, 2);
    assert.equal(broker.snapshot().fills.length, 1);
  });
});

describe("live confirmation", () => {
  it("sends nothing until confirmRealMoney and the process lock are both set", async () => {
    assert.equal(REAL_MONEY_CONFIRMATION_DEFAULT, false);
    const http = recording(() => json(201, { orderCreateTransaction: { id: "1" }, orderFillTransaction: { id: "2", price: "1.1", units: "1", time: NOW, commission: "0" } }));
    const credentials = { accountId: "abc", token: "practice-token-value" };
    const locked = createBroker({ venue: "oanda", symbol: "EURUSD", mode: "live", now: NOW, credentials, http: http.client, env: {} });
    const unconfirmed = await locked.place({ clientOrderId: "live-1", side: "buy", type: "market", lots: "1" });
    assert.equal(unconfirmed.ok, false);
    if (!unconfirmed.ok) assert.equal(unconfirmed.code, "real_money_confirmation_required");
    const confirmed = await locked.place({ clientOrderId: "live-1", side: "buy", type: "market", lots: "1", confirmRealMoney: true });
    assert.equal(confirmed.ok, false);
    if (!confirmed.ok) assert.equal(confirmed.code, "live_network_locked");
    const wrong = createBroker({ venue: "oanda", symbol: "EURUSD", mode: "live", now: NOW, credentials, http: http.client, env: { FLOWCHART_ALLOW_LIVE_NETWORK: "true" } });
    const stillLocked = await wrong.place({ clientOrderId: "live-1", side: "buy", type: "market", lots: "1", confirmRealMoney: true });
    assert.equal(stillLocked.ok, false);
    if (!stillLocked.ok) assert.equal(stillLocked.code, "live_network_locked");
    assert.equal(http.calls.length, 0);

    const open = createBroker({
      venue: "oanda",
      symbol: "EURUSD",
      mode: "live",
      now: NOW,
      credentials,
      http: http.client,
      env: { FLOWCHART_ALLOW_LIVE_NETWORK: "1" },
    });
    ok(await open.place({ clientOrderId: "live-1", side: "buy", type: "market", lots: "1", confirmRealMoney: true }));
    assert.equal(new URL(http.calls[0]?.url ?? "").host, "api-fxtrade.oanda.com");
    assert.equal(ok(await open.place({ clientOrderId: "live-1", side: "buy", type: "market", lots: "1" })).transmitted, true);
    assert.equal(http.calls.length, 1);
  });

  it("refuses a live CCXT order even when both gates are open", async () => {
    const client = fakeCcxt("okx", { id: "1" });
    const broker = createBroker({
      venue: "okx",
      symbol: "BTC/USDT",
      mode: "live",
      ccxt: client,
      credentials: { apiKey: "key-value-12345678", secret: "secret-value-12345678", passphrase: "passphrase-value" },
      env: { FLOWCHART_ALLOW_LIVE_NETWORK: "1" },
    });
    const unconfirmed = await broker.place({ clientOrderId: "btc-1", side: "buy", type: "market", lots: "0.01" });
    assert.equal(unconfirmed.ok, false);
    if (!unconfirmed.ok) assert.equal(unconfirmed.code, "real_money_confirmation_required");
    const refused = await broker.place({ clientOrderId: "btc-1", side: "buy", type: "market", lots: "0.01", confirmRealMoney: true });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.code, "demo_session_required");
    assert.equal(client.calls.length, 0);
  });

  it("allows demo hosts and OAuth token paths, and refuses a live host without the lock", async () => {
    const inner = { async request(req: HttpRequest): Promise<HttpResponse> { return { status: 200, body: req.url }; } };
    const guarded = createGuardedClient(inner, { env: {} });
    await guarded.request({ method: "POST", url: "https://api-fxpractice.oanda.com/v3/accounts/a/orders" });
    await guarded.request({ method: "POST", url: "https://api.alpaca.markets/oauth/token" });
    await assert.rejects(
      guarded.request({ method: "POST", url: "https://api-fxtrade.oanda.com/v3/accounts/a/orders" }),
      (error: unknown) => error instanceof BrokerError && error.code === "live_network_locked",
    );
    const open = createGuardedClient(inner, { allowLive: true, env: { FLOWCHART_ALLOW_LIVE_NETWORK: "1" } });
    const response = await open.request({ method: "POST", url: "https://api-fxtrade.oanda.com/v3/accounts/a/orders" });
    assert.equal(response.status, 200);
  });
});

describe("venues", () => {
  it("names OANDA, cTrader, TradeLocker, MT5, IBKR, Alpaca, Tradovate, and CCXT", () => {
    const names: readonly string[] = VENUE_CATALOG.map((row) => row.name);
    for (const name of ["OANDA", "cTrader", "TradeLocker", "MT5", "IBKR", "Alpaca", "Tradovate", "CCXT"]) {
      assert.equal(names.includes(name), true, name);
    }
    assert.throws(() => createBroker({ venue: "metaapi", symbol: "EURUSD" }), (error: unknown) => error instanceof BrokerError && error.code === "adapter_rejected");
    assert.throws(() => createBroker({ venue: "rithmic", symbol: "EURUSD" }), (error: unknown) => error instanceof BrokerError && error.code === "adapter_rejected");
    assert.throws(() => createBroker({ venue: "cqg", symbol: "EURUSD" }), (error: unknown) => error instanceof BrokerError && error.code === "adapter_rejected");
  });

  it("maps cTrader and does not open a socket", async () => {
    const message = toCtraderNewOrder(
      { clientOrderId: "ct-1", side: "buy", type: "limit", lots: "1.5", limitPrice: "1.08", stopPrice: null, stopLoss: "1.07", takeProfit: "1.09", confirmRealMoney: false },
      "EURUSD",
      { accountId: "1001", symbols: { EURUSD: "1" } },
    );
    assert.equal(message.payloadType, "PROTO_OA_NEW_ORDER_REQ");
    assert.equal(message.volume, "150");
    assert.equal(message.stopLoss, "1.07");
    let sends = 0;
    let fetched = false;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      fetched = true;
      throw new Error("fetch");
    };
    try {
      const broker = createBroker({
        venue: "ctrader",
        symbol: "EURUSD",
        credentials: { accountId: "1001" },
        ctraderSymbols: { EURUSD: "1" },
        ctraderTransport: { async send() { sends += 1; }, openedSocket: () => false },
      });
      const ack = ok(await broker.place({ clientOrderId: "ct-1", side: "buy", type: "market", lots: "1" }));
      assert.equal(ack.transmitted, false);
      assert.equal(ack.status, "mapped");
      assert.equal((ack.request as { payloadType: string }).payloadType, "PROTO_OA_NEW_ORDER_REQ");
      assert.equal(broker.snapshot().orders.length, 0);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(fetched, false);
    assert.equal(sends, 1);
  });

  it("maps an IBKR bracket and does not submit it", async () => {
    const request = toIbkrOrderRequest(
      { clientOrderId: "aapl-1", side: "buy", type: "limit", lots: "10", limitPrice: "130", stopPrice: null, stopLoss: "120", takeProfit: "150", confirmRealMoney: false },
      { accountId: "DU123456", conid: 265598 },
    );
    assert.equal(request.orders.length, 3);
    assert.equal(request.orders[0]?.orderType, "LMT");
    assert.equal(request.orders[1]?.parentId, "aapl-1");
    assert.equal(request.orders[2]?.orderType, "STP");
    assert.equal(request.orders[2]?.auxPrice, 120);
    assert.equal(new URL(request.url).hostname, "localhost");
    assert.equal(new URL(request.url).port, "5000");
    let fetched = false;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      fetched = true;
      throw new Error("fetch");
    };
    const http = recording(() => json(200, {}));
    try {
      const broker = createBroker({ venue: "ibkr", symbol: "AAPL", http: http.client, ibkr: { accountId: "DU123456", conid: 265598 } });
      const result = await broker.place({
        clientOrderId: "aapl-1",
        side: "buy",
        type: "limit",
        lots: "10",
        limitPrice: "130",
        stopLoss: "120",
        takeProfit: "150",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "interface_only");
      assert.equal(broker.snapshot().orders.length, 0);
    } finally {
      globalThis.fetch = original;
    }
    assert.equal(fetched, false);
    assert.equal(http.calls.length, 0);
  });

  it("keeps MT5 and Tradovate documented and fills a backtest locally", async () => {
    const http = recording(() => json(200, {}));
    for (const venue of ["mt5", "tradovate"]) {
      const broker = createBroker({ venue, symbol: "EURUSD", http: http.client });
      const result = await broker.place({ clientOrderId: "x", side: "buy", type: "market", lots: "1" });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "documented_only");
    }
    assert.equal(http.calls.length, 0);
    const backtest = createBroker({ venue: "backtest", symbol: "EURUSD", now: NOW, markPrice: "1.1", commission: "0.2", lotSize: "1" });
    const before = JSON.stringify(backtest.snapshot());
    const blocked = await backtest.place({ clientOrderId: "nope", side: "buy", type: "market", lots: "1", stopLoss: "1.0" });
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.code, "protection_not_supported");
    assert.equal(JSON.stringify(backtest.snapshot()), before);
    const opened = ok(await backtest.place({ clientOrderId: "bt", side: "buy", type: "market", lots: "1" }));
    assert.equal(opened.fill?.source, "backtest");
    assert.equal(opened.fill?.realizedPnl, "-0.2");
    assert.equal(opened.fill?.referencePrice, "1.1");
    assert.equal(opened.transmitted, false);
    assert.deepEqual(Object.keys(opened.fill ?? {}), [...FILL_KEYS]);
    const priced = createBroker({ venue: "backtest", symbol: "EURUSD", now: NOW, markPrice: "1.1", commission: "0", lotSize: "1" });
    ok(await priced.place({ clientOrderId: "open", side: "buy", type: "market", lots: "2" }));
    const reduced = ok(await priced.place({ clientOrderId: "cut", side: "sell", type: "limit", lots: "1", limitPrice: "1.2" }));
    assert.equal(reduced.fill?.realizedPnl, "0.1");
    assert.equal(priced.snapshot().position.lots, "1");
    assert.equal(priced.snapshot().position.averagePrice, "1.1");
    const tooMuch = await priced.close({ clientOrderId: "too", lots: "5" });
    assert.equal(tooMuch.ok, false);
    if (!tooMuch.ok) assert.equal(tooMuch.code, "invalid_size");
    const closed = ok(await priced.close({ clientOrderId: "flat" }));
    assert.equal(closed.fill?.reason, "close");
    assert.equal(priced.snapshot().position.side, "flat");
  });

  it("shares one fill shape and redacts a token from a venue error", async () => {
    const http = recording((req) => {
      if (req.body?.includes("eu-ok")) {
        return json(201, { orderFillTransaction: { id: "2", price: "1.1", units: "1", time: NOW, commission: "0.2" } });
      }
      return { status: 401, body: "bad practice-token-value" };
    });
    const broker = createBroker({
      venue: "oanda",
      symbol: "EURUSD",
      now: NOW,
      credentials: { accountId: "abc", token: "practice-token-value" },
      http: http.client,
    });
    const leaked = await broker.place({ clientOrderId: "eu-bad", side: "buy", type: "market", lots: "1" });
    assert.equal(leaked.ok, false);
    if (!leaked.ok) {
      assert.equal(leaked.message.includes("practice-token-value"), false);
      assert.equal(leaked.message.includes("[redacted]"), true);
    }
    const ack = ok(await broker.place({ clientOrderId: "eu-ok", side: "buy", type: "market", lots: "1" }));
    const backtest = ok(await createBroker({ venue: "backtest", symbol: "EURUSD", now: NOW, markPrice: "1.1", commission: "0.2" }).place({
      clientOrderId: "bt",
      side: "buy",
      type: "market",
      lots: "1",
    }));
    assert.deepEqual(Object.keys(ack.fill ?? {}).sort(), Object.keys(backtest.fill ?? {}).sort());
    assert.equal(ack.fill?.ambiguous, false);
    assert.equal(backtest.fill?.source, "backtest");
  });

  it("cancels a working order and does not amend one", async () => {
    const http = recording((req) => {
      if (req.method === "PUT") return json(200, { orderCancelTransaction: { id: "10" } });
      return json(201, { orderCreateTransaction: { id: "10" } });
    });
    const broker = createBroker({
      venue: "oanda",
      symbol: "EURUSD",
      credentials: { accountId: "abc", token: "practice-token-value" },
      http: http.client,
    });
    ok(await broker.place({ clientOrderId: "lim-1", side: "buy", type: "limit", lots: "1", limitPrice: "1.08" }));
    const amended = await broker.modify("10");
    assert.equal(amended.ok, false);
    if (!amended.ok) assert.equal(amended.code, "modify_unsupported");
    assert.equal(http.calls.length, 1);
    const missing = await broker.cancel("missing");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "order_not_working");
    ok(await broker.cancel("10"));
    assert.equal(http.calls[1]?.method, "PUT");
    assert.equal(http.calls[1]?.url.endsWith("/orders/10/cancel"), true);
    assert.equal(broker.snapshot().orders.length, 0);
  });
});

describe("credentials and FundedNext", () => {
  it("stores keys as ciphertext and keeps them out of inspect", () => {
    const vault = new CredentialVault("correct-horse");
    vault.put("oanda", { token: "super-secret-token", accountId: "101" });
    const dumped = JSON.stringify(vault);
    assert.equal(dumped.includes("super-secret-token"), false);
    assert.equal(dumped.includes("correct-horse"), false);
    assert.equal(inspect(vault).includes("super-secret-token"), false);
    assert.equal(inspect(vault).includes("correct-horse"), false);
    assert.equal(vault.get("oanda").token, "super-secret-token");
    const reopened = new CredentialVault("correct-horse", vault.exportState());
    assert.equal(reopened.get("oanda").accountId, "101");
    const wrong = new CredentialVault("other-horse-battery", vault.exportState());
    assert.throws(() => wrong.get("oanda"), (error: unknown) => error instanceof BrokerError && error.code === "credential_unreadable");
  });

  it("redacts a Tradier client secret from a failed token exchange", async () => {
    const http = recording(() => ({ status: 400, body: "invalid client-secret-value" }));
    await assert.rejects(
      exchangeTradierCode(http.client, { code: "code-1", clientId: "id-1", clientSecret: "client-secret-value" }),
      (error: unknown) => error instanceof BrokerError && !error.message.includes("client-secret-value"),
    );
  });

  it("blocks FundedNext automation on cTrader, Match-Trader, and large MT accounts", async () => {
    assert.equal(reviewFundedNext({ firm: "FundedNext", platform: "cTrader" }).allowed, false);
    assert.equal(reviewFundedNext({ firm: "FundedNext", platform: "Match-Trader" }).code, "fundednext_automation_refused");
    assert.equal(reviewFundedNext({ firm: "FundedNext", platform: "MT5", accountSizeUsd: 50_000 }).allowed, false);
    assert.equal(reviewFundedNext({ firm: "FundedNext", platform: "MT4" }).code, "fundednext_size_required");
    const small = reviewFundedNext({ firm: "FundedNext", platform: "MT5", accountSizeUsd: 49_999 });
    assert.equal(small.allowed, true);
    assert.equal(small.warnings.includes("EA fee"), true);
    assert.equal(small.warnings.includes("No Telegram or WhatsApp bridge"), true);

    const http = recording(() => json(201, { orderCreateTransaction: { id: "1" } }));
    const blocked = createBroker({
      venue: "oanda",
      symbol: "EURUSD",
      credentials: { accountId: "abc", token: "practice-token-value" },
      http: http.client,
      fundedNext: { firm: "FundedNext", platform: "cTrader" },
    });
    const result = await blocked.place({ clientOrderId: "eu-1", side: "buy", type: "market", lots: "1" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "fundednext_automation_refused");
    const large = createBroker({
      venue: "mt5",
      symbol: "EURUSD",
      fundedNext: { firm: "FundedNext", platform: "MT5", accountSizeUsd: 50_000 },
    });
    const amended = await large.modify("stop-1");
    assert.equal(amended.ok, false);
    if (!amended.ok) assert.equal(amended.code, "fundednext_automation_refused");
    assert.equal(http.calls.length, 0);

    const allowed = createBroker({
      venue: "oanda",
      symbol: "EURUSD",
      credentials: { accountId: "abc", token: "practice-token-value" },
      http: http.client,
      fundedNext: { firm: "FundedNext", platform: "MT4", accountSizeUsd: 10_000 },
    });
    const ack = ok(await allowed.place({ clientOrderId: "eu-2", side: "buy", type: "limit", lots: "1", limitPrice: "1.08" }));
    assert.equal(ack.warnings.includes("A distinct strategy"), true);
    assert.equal(http.calls.length, 1);
  });
});
