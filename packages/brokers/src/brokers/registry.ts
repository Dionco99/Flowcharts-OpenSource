// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter } from "./adapter.js";
import { createAlpacaBroker, type AlpacaConfig } from "./alpaca/adapter.js";
import { createBacktestBroker } from "./backtest.js";
import type { BrokerId } from "./capabilities.js";
import { createCcxtAdapter, createKrakenAdapter } from "./ccxt/adapter.js";
import type { CcxtSession } from "./ccxt/session.js";
import { createCTraderBroker, type CTraderConfig, type CTraderTransport } from "./ctrader/adapter.js";
import { DOCUMENTED_ONLY, EXCLUDED_FROM_CORE } from "./documented.js";
import type { HttpClient } from "./http.js";
import { createIbkrBroker } from "./ibkr/gateway.js";
import { createOandaBroker, type OandaConfig } from "./oanda/adapter.js";
import { createTradierBroker, type TradierConfig } from "./tradier/adapter.js";
import { createTradeLockerBroker, type TradeLockerConfig } from "./tradelocker/adapter.js";
import { OrderRejected } from "../orders/errors.js";
import type { FillJournal } from "../orders/journal.js";

export interface BrokerDeps {
  journal: FillJournal;
  http?: HttpClient;
  ccxt?: Partial<Record<"binance" | "bybit" | "okx", CcxtSession>>;
  oanda?: OandaConfig;
  alpaca?: AlpacaConfig;
  tradier?: TradierConfig;
  tradelocker?: TradeLockerConfig;
  ctrader?: CTraderConfig;
  ctraderTransport?: CTraderTransport;
}

function requireHttp(deps: BrokerDeps): HttpClient {
  if (!deps.http) throw new OrderRejected("This adapter needs an HTTP client.");
  return deps.http;
}

export function createBroker(id: string, deps: BrokerDeps): BrokerAdapter {
  const excluded = EXCLUDED_FROM_CORE.find((item) => item.id === id);
  if (excluded) throw new OrderRejected(`${excluded.id} is not part of Flowchart core. ${excluded.reason}`);
  const documented = DOCUMENTED_ONLY.find((item) => item.id === id);
  if (documented) throw new OrderRejected(`${documented.id} is documented only. ${documented.note}`);

  switch (id as BrokerId) {
    case "binance":
    case "bybit":
    case "okx": {
      const session = deps.ccxt?.[id as "binance" | "bybit" | "okx"];
      if (!session) throw new OrderRejected(`${id} needs a demo-armed CCXT session.`);
      return createCcxtAdapter(session, deps.journal);
    }
    case "kraken":
      return createKrakenAdapter(deps.journal);
    case "ctrader": {
      if (!deps.ctrader) throw new OrderRejected("cTrader needs an account id and symbol map.");
      return createCTraderBroker(deps.ctrader, deps.journal, deps.ctraderTransport);
    }
    case "oanda": {
      if (!deps.oanda) throw new OrderRejected("OANDA needs an account id and token.");
      return createOandaBroker(deps.oanda, deps.journal, requireHttp(deps));
    }
    case "alpaca": {
      if (!deps.alpaca) throw new OrderRejected("Alpaca needs an OAuth access token.");
      return createAlpacaBroker(deps.alpaca, deps.journal, requireHttp(deps));
    }
    case "ibkr":
      return createIbkrBroker(deps.journal);
    case "tradier": {
      if (!deps.tradier) throw new OrderRejected("Tradier needs an account id and token.");
      return createTradierBroker(deps.tradier, deps.journal, requireHttp(deps));
    }
    case "tradelocker": {
      if (!deps.tradelocker) throw new OrderRejected("TradeLocker needs a demo session.");
      return createTradeLockerBroker(deps.tradelocker, deps.journal, requireHttp(deps));
    }
    case "backtest":
      return createBacktestBroker(deps.journal);
    default:
      throw new OrderRejected(`Unknown broker ${id}.`);
  }
}
