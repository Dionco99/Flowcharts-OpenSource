// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { BrokerRequestError, DemoUnavailable, OrderRejected } from "../../orders/errors.js";
import { errorText, redactText } from "../../secrets/redact.js";

export interface CcxtCredentials {
  apiKey: string;
  secret: string;
  password?: string;
}

export interface CcxtOrderInput {
  symbol: string;
  type: "market" | "limit";
  side: "buy" | "sell";
  amount: string;
  price?: string;
  params: Record<string, unknown>;
}

export interface CcxtOrderResult {
  id: string;
  status?: string;
  filled?: number;
  average?: number;
  price?: number;
  feeCost?: number;
  timestamp?: number;
}

export interface CcxtSession {
  readonly id: "binance" | "bybit" | "okx";
  readonly demoArmed: true;
  createOrder(input: CcxtOrderInput): Promise<CcxtOrderResult>;
  cancelOrder(orderId: string, symbol: string): Promise<void>;
}

export interface ArmableExchange {
  urls?: { api?: unknown };
  headers?: Record<string, string>;
  enableDemoTrading?: (enable: boolean) => void;
  setSandboxMode?: (enable: boolean) => void;
}

const KRAKEN_DEMO =
  "Kraken spot has no self-service CCXT demo. Refusing to open a client that would use api.kraken.com.";

export function armCcxtDemo(venue: "binance" | "bybit" | "okx" | "kraken", exchange: ArmableExchange): void {
  if (venue === "kraken") throw new DemoUnavailable(KRAKEN_DEMO);
  if (venue === "okx") {
    if (typeof exchange.setSandboxMode !== "function") {
      throw new DemoUnavailable("OKX client cannot enable demo trading.");
    }
    exchange.setSandboxMode(true);
    return;
  }
  if (typeof exchange.enableDemoTrading !== "function") {
    throw new DemoUnavailable(`${venue} client cannot enable demo trading.`);
  }
  exchange.enableDemoTrading(true);
}

export function assertCcxtDemoArmed(venue: "binance" | "bybit" | "okx", exchange: ArmableExchange): void {
  const blob = JSON.stringify(exchange.urls?.api ?? "");
  if (venue === "binance" && !blob.includes("https://demo-api.binance.com")) {
    throw new DemoUnavailable("Binance client is not on the demo host.");
  }
  if (venue === "bybit" && !blob.includes("api-demo.")) {
    throw new DemoUnavailable("Bybit client is not on the demo host.");
  }
  if (venue === "okx" && exchange.headers?.["x-simulated-trading"] !== "1") {
    throw new DemoUnavailable("OKX client is missing the simulated-trading header.");
  }
}

interface ExchangeCalls {
  createOrder(
    symbol: string,
    type: string,
    side: string,
    amount: number,
    price: number | undefined,
    params: Record<string, unknown>,
  ): Promise<{
    id?: string;
    status?: string;
    filled?: number;
    average?: number;
    price?: number;
    fee?: { cost?: number };
    timestamp?: number;
  }>;
  cancelOrder(id: string, symbol?: string): Promise<unknown>;
}

export async function openCcxtDemoSession(
  venue: "binance" | "bybit" | "okx" | "kraken",
  credentials: CcxtCredentials,
): Promise<CcxtSession> {
  if (venue === "kraken") throw new DemoUnavailable(KRAKEN_DEMO);
  if (!credentials.apiKey || !credentials.secret) {
    throw new OrderRejected("A CCXT demo session requires an api key and secret.");
  }
  if (venue === "okx" && !credentials.password) {
    throw new OrderRejected("OKX demo trading requires a passphrase.");
  }
  const mod = await import("ccxt");
  const Ctor = mod.default[venue] as new (args: Record<string, unknown>) => ArmableExchange & ExchangeCalls;
  const exchange = new Ctor({
    apiKey: credentials.apiKey,
    secret: credentials.secret,
    password: credentials.password,
    enableRateLimit: true,
  });
  armCcxtDemo(venue, exchange);
  assertCcxtDemoArmed(venue, exchange);
  const secrets = [credentials.apiKey, credentials.secret, credentials.password ?? ""];
  return {
    id: venue,
    demoArmed: true,
    async createOrder(input) {
      try {
        const placed = await exchange.createOrder(
          input.symbol,
          input.type,
          input.side,
          Number(input.amount),
          input.price === undefined ? undefined : Number(input.price),
          input.params,
        );
        if (!placed.id) throw new BrokerRequestError("CCXT demo order did not return an id.");
        return {
          id: String(placed.id),
          status: placed.status,
          filled: placed.filled,
          average: placed.average,
          price: placed.price,
          feeCost: placed.fee?.cost,
          timestamp: placed.timestamp,
        };
      } catch (error) {
        if (error instanceof BrokerRequestError) throw error;
        throw new BrokerRequestError(redactText(errorText(error), secrets));
      }
    },
    async cancelOrder(orderId, symbol) {
      try {
        await exchange.cancelOrder(orderId, symbol);
      } catch (error) {
        throw new BrokerRequestError(redactText(errorText(error), secrets));
      }
    },
  };
}
