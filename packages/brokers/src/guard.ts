// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { BrokerError } from "./errors.ts";

/** UI confirmation for a live order. Omitted and false both mean off. */
export const REAL_MONEY_CONFIRMATION_DEFAULT = false;

export type Env = Record<string, string | undefined>;

export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

interface HostRule {
  host: string;
  paths?: RegExp;
}

const DEMO_RULES: readonly HostRule[] = [
  { host: "api-fxpractice.oanda.com" },
  { host: "paper-api.alpaca.markets" },
  { host: "sandbox.tradier.com" },
  { host: "demo.tradelocker.com" },
  { host: "demo-api.binance.com" },
  { host: "api-demo.bybit.com" },
  { host: "api.alpaca.markets", paths: /^\/oauth\/token$/ },
  { host: "api.tradier.com", paths: /^\/v1\/oauth\/(?:accesstoken|authorize|refreshtoken)$/ },
  { host: "app.alpaca.markets", paths: /^\/oauth\/authorize$/ },
];

const LIVE_HOSTS = new Set([
  "api-fxtrade.oanda.com",
  "api.alpaca.markets",
  "api.tradier.com",
  "live.tradelocker.com",
]);

export function liveNetworkEnabled(env: Env): boolean {
  return env.FLOWCHART_ALLOW_LIVE_NETWORK === "1";
}

export function assertCanSendLive(confirmRealMoney: boolean | undefined, env: Env): void {
  if (confirmRealMoney !== true) {
    throw new BrokerError(
      "real_money_confirmation_required",
      "A live order waits for confirmRealMoney.",
    );
  }
  if (!liveNetworkEnabled(env)) {
    throw new BrokerError(
      "live_network_locked",
      "Set FLOWCHART_ALLOW_LIVE_NETWORK=1 before this process can send a live order.",
    );
  }
}

/**
 * Demo and paper hosts are allowed. OAuth token paths are allowed.
 * Any other host needs the process lock.
 */
export function createGuardedClient(inner: HttpClient, options?: { allowLive?: boolean; env?: Env }): HttpClient {
  const env = options?.env ?? process.env;
  return {
    async request(req) {
      const allowLive = options?.allowLive === true && liveNetworkEnabled(env);
      assertDemoRequest(req.url, allowLive);
      return inner.request(req);
    },
  };
}

export function assertDemoRequest(url: string, allowLive: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BrokerError("request_refused", "Refusing a request with an unreadable URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new BrokerError("request_refused", "Refusing a non-HTTPS broker request.");
  }
  if (parsed.username || parsed.password) {
    throw new BrokerError("request_refused", "Refusing a broker URL that carries credentials.");
  }
  const demo = DEMO_RULES.find((rule) => rule.host === parsed.host);
  if (demo && (!demo.paths || demo.paths.test(parsed.pathname))) return;
  if (allowLive && LIVE_HOSTS.has(parsed.host)) return;
  throw new BrokerError("live_network_locked", `Refusing a request to ${parsed.host}.`);
}
