// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";
import { VENUE_CAPABILITIES } from "../src/brokers/capabilities.js";
import { reviewPropFirmAutomation } from "../src/brokers/prop-firm.js";
import { assertDemoRequest, createGuardedClient } from "../src/brokers/http.js";
import { createBroker } from "../src/brokers/registry.js";
import { REAL_MONEY_CONFIRMATION_DEFAULT, assertCanSend } from "../src/orders/guard.js";
import { FILL_KEYS, FillJournal, buildFill, toJournalTrade } from "../src/orders/journal.js";
import { protectionsVisible } from "../src/orders/model.js";
import { LiveNetworkDisabled, RealMoneyConfirmationRequired } from "../src/orders/errors.js";
import { redactText } from "../src/secrets/redact.js";
import { CredentialVault, MemorySecretStore } from "../src/secrets/vault.js";

describe("order model and journal", () => {
  it("hides stop-loss and take-profit when the venue cannot attach them", () => {
    assert.deepEqual(protectionsVisible(VENUE_CAPABILITIES.binance, "market"), {
      stopLoss: false,
      takeProfit: false,
    });
    assert.deepEqual(protectionsVisible(VENUE_CAPABILITIES.kraken, "limit"), {
      stopLoss: false,
      takeProfit: false,
    });
    assert.deepEqual(protectionsVisible(VENUE_CAPABILITIES.tradier, "market"), {
      stopLoss: false,
      takeProfit: false,
    });
    assert.deepEqual(protectionsVisible(VENUE_CAPABILITIES.tradier, "limit"), {
      stopLoss: true,
      takeProfit: true,
    });
    assert.deepEqual(protectionsVisible(VENUE_CAPABILITIES.bybit, "market"), {
      stopLoss: true,
      takeProfit: true,
    });
  });

  it("writes one plain fill shape for live, demo, and backtest", () => {
    const lines: string[] = [];
    const journal = new FillJournal((line) => lines.push(line));
    const sources = ["live", "demo", "backtest"] as const;
    for (const source of sources) {
      journal.append(
        buildFill({
          id: source,
          source,
          adapterId: "oanda",
          venue: "oanda",
          symbol: "EUR/USD",
          side: "buy",
          lots: "1000",
          price: "1.1000",
          time: "2024-03-12T08:15:00.000Z",
          orderId: "1",
          clientOrderId: "c1",
          reason: "market",
          commission: "0.00000",
          spread: "0.00012",
        }),
      );
    }
    const keys = journal.records.map((record) => Object.keys(record).sort().join());
    assert.equal(keys[0], [...FILL_KEYS].sort().join());
    assert.equal(keys[0], keys[1]);
    assert.equal(keys[1], keys[2]);
    assert.equal(journal.records[0]?.commission, "0");
    assert.equal(JSON.parse(lines[0] ?? "{}").schema, "flowchart.fill.v1");
    const replay = buildFill({
      id: "replay",
      source: "replay",
      adapterId: "replay",
      venue: "replay",
      symbol: "EUR/USD",
      side: "sell",
      lots: "1",
      price: "1.2",
      time: "2024-03-12T09:40:00.000Z",
      orderId: "2",
      clientOrderId: "c2",
      reason: "close",
    });
    assert.deepEqual(Object.keys(replay).sort(), Object.keys(journal.records[0] ?? {}).sort());
  });

  it("projects a closed backtest into the journal trade and keeps demo on the fill stream", () => {
    const open = buildFill({
      id: "o",
      source: "backtest",
      adapterId: "backtest",
      venue: "backtest",
      symbol: "EURUSD",
      side: "sell",
      lots: "1",
      price: "1.08",
      time: "2024-03-12T08:15:00.000Z",
      orderId: "o",
      clientOrderId: "o",
      reason: "market",
    });
    const close = {
      ...open,
      id: "c",
      side: "buy" as const,
      time: "2024-03-12T09:40:00.000Z",
      price: "1.07",
      referencePrice: "1.07",
      reason: "close" as const,
    };
    const trade = toJournalTrade(open, close, {
      setup: "London sweep",
      tags: ["late-entry"],
      notes: "Second touch failed.",
      emotions: "Chased it.",
      ruleAdherence: "partial",
      rResult: -0.5,
      snapshotRef: "sessions/london-short.png",
      sessionRef: "eurusd-2024-03-12",
    });
    assert.equal(trade.source, "backtest");
    assert.equal(trade.side, "short");
    assert.throws(() => toJournalTrade({ ...open, source: "demo" }, { ...close, source: "demo" }, {
      setup: "",
      tags: [],
      notes: "",
      emotions: "",
      ruleAdherence: "followed",
      rResult: 0,
      snapshotRef: "",
      sessionRef: "",
    }), /fill stream/);
  });
});

describe("real-money gate", () => {
  it("defaults off and blocks a live send before any network policy", () => {
    assert.equal(REAL_MONEY_CONFIRMATION_DEFAULT, false);
    assert.throws(() => assertCanSend({ mode: "live" }), RealMoneyConfirmationRequired);
    assert.throws(() => assertCanSend({ mode: "live", confirmRealMoney: false }), RealMoneyConfirmationRequired);
    assert.throws(() => assertCanSend({ mode: "live", confirmRealMoney: true }), LiveNetworkDisabled);
    assert.deepEqual(assertCanSend({ mode: "demo" }).warnings, []);
    assert.deepEqual(assertCanSend({ mode: "paper" }).warnings, []);
  });
});

describe("credentials", () => {
  it("stores keys as ciphertext and never returns them from inspect", () => {
    const store = new MemorySecretStore();
    const vault = new CredentialVault("correct horse battery", store);
    const secret = "binance-key-do-not-log";
    vault.put("binance", "binance", { apiKey: secret, secret: "binance-secret-value" });
    const sealed = store.exportAll().binance ?? "";
    assert.equal(sealed.includes(secret), false);
    assert.equal(vault.get("binance").fields.apiKey, secret);
    assert.equal(inspect(vault).includes("correct horse"), false);
    assert.equal(JSON.stringify(vault).includes(secret), false);
    assert.throws(() => {
      const other = new CredentialVault("wrong-passphrase", store);
      other.get("binance");
    }, /unable to open credential/);
    assert.equal(redactText(`failed with ${secret}`, [secret]).includes(secret), false);
  });
});

describe("network policy and registry", () => {
  it("allows demo hosts and refuses live hosts unless the process lock is on", () => {
    assert.doesNotThrow(() => assertDemoRequest("https://api-fxpractice.oanda.com/v3/accounts/a/orders", false));
    assert.doesNotThrow(() => assertDemoRequest("https://paper-api.alpaca.markets/v2/orders", false));
    assert.doesNotThrow(() => assertDemoRequest("https://sandbox.tradier.com/v1/accounts/x/orders", false));
    assert.doesNotThrow(() => assertDemoRequest("https://demo.tradelocker.com/backend-api/auth/jwt/token", false));
    assert.doesNotThrow(() => assertDemoRequest("https://api.alpaca.markets/oauth/token", false));
    assert.doesNotThrow(() => assertDemoRequest("https://api.tradier.com/v1/oauth/accesstoken", false));
    assert.throws(() => assertDemoRequest("https://api-fxtrade.oanda.com/v3/accounts/a/orders", false), /Demo and paper/);
    assert.throws(() => assertDemoRequest("https://api.alpaca.markets/v2/orders", false), /Demo and paper/);
    assert.throws(() => assertDemoRequest("https://api.tradier.com/v1/accounts/x/orders", false), /Demo and paper/);
    assert.throws(() => assertDemoRequest("https://live.tradelocker.com/backend-api/trade/accounts/1/orders", false), /Demo and paper/);
    assert.throws(() => assertDemoRequest("http://api-fxpractice.oanda.com/orders", false), /HTTPS/);
    assert.throws(() => assertDemoRequest("https://sandbox.tradier.com/orders?token=abc", false), /credentials/);
    const previous = process.env.FLOWCHART_ALLOW_LIVE_NETWORK;
    process.env.FLOWCHART_ALLOW_LIVE_NETWORK = "1";
    try {
      assert.doesNotThrow(() => assertDemoRequest("https://api-fxtrade.oanda.com/v3/accounts/a/orders", true));
    } finally {
      if (previous === undefined) delete process.env.FLOWCHART_ALLOW_LIVE_NETWORK;
      else process.env.FLOWCHART_ALLOW_LIVE_NETWORK = previous;
    }
    const guarded = createGuardedClient({
      async request() {
        return { status: 200, body: "" };
      },
    });
    return assert.rejects(guarded.request({ method: "POST", url: "https://api-fxtrade.oanda.com/v3/accounts/a/orders" }), /Demo and paper/);
  });

  it("rejects excluded and document-only venues", () => {
    const journal = new FillJournal();
    for (const id of ["metaapi", "rithmic", "cqg"]) {
      assert.throws(() => createBroker(id, { journal }), /not part of Flowchart core/);
    }
    for (const id of ["mt5-local", "schwab", "ninjatrader", "tradovate"]) {
      assert.throws(() => createBroker(id, { journal }), /documented only/);
    }
  });
});

describe("FundedNext", () => {
  it("blocks automation on cTrader, Match-Trader, and large MT accounts", () => {
    assert.equal(reviewPropFirmAutomation({ firm: "FundedNext", platform: "ctrader", automated: true }).allowed, false);
    assert.equal(reviewPropFirmAutomation({ firm: "fundednext", platform: "match-trader", automated: true }).allowed, false);
    assert.equal(
      reviewPropFirmAutomation({ firm: "fundednext", platform: "mt5", accountSizeUsd: 50_000, automated: true }).allowed,
      false,
    );
    const small = reviewPropFirmAutomation({ firm: "fundednext", platform: "mt5", accountSizeUsd: 10_000, automated: true });
    assert.equal(small.allowed, true);
    assert.match(small.warnings.join(" "), /50,000/);
    assert.equal(reviewPropFirmAutomation({ firm: "fundednext", platform: "ctrader", automated: false }).allowed, true);
  });
});
