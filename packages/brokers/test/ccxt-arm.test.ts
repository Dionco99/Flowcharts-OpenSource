// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ccxt from "ccxt";
import { armCcxtDemo, assertCcxtDemoArmed } from "../src/brokers/ccxt/session.js";
import { DemoUnavailable } from "../src/orders/errors.js";

describe("CCXT demo arming", () => {
  it("points Binance, Bybit, and OKX at demo and leaves Kraken on its live host untouched", () => {
    const binance = new ccxt.binance({ enableRateLimit: true });
    armCcxtDemo("binance", binance);
    assertCcxtDemoArmed("binance", binance);
    assert.match(JSON.stringify(binance.urls.api), /https:\/\/demo-api\.binance\.com/);

    const bybit = new ccxt.bybit({ enableRateLimit: true });
    armCcxtDemo("bybit", bybit);
    assertCcxtDemoArmed("bybit", bybit);
    assert.match(JSON.stringify(bybit.urls.api), /api-demo\./);

    const okx = new ccxt.okx({ enableRateLimit: true });
    armCcxtDemo("okx", okx);
    assertCcxtDemoArmed("okx", okx);
    assert.equal(okx.headers["x-simulated-trading"], "1");

    const kraken = new ccxt.kraken({ enableRateLimit: true });
    const before = JSON.stringify(kraken.urls.api);
    assert.throws(() => armCcxtDemo("kraken", kraken), DemoUnavailable);
    assert.equal(JSON.stringify(kraken.urls.api), before);
    assert.match(before, /api\.kraken\.com/);
  });
});
