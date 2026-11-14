// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { BrokerRequestError } from "../orders/errors.js";
import { redactText } from "../secrets/redact.js";

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
  /** When set, only these paths are allowed on an otherwise live host. */
  paths?: RegExp;
}

const DEMO_RULES: readonly HostRule[] = [
  { host: "api-fxpractice.oanda.com" },
  { host: "paper-api.alpaca.markets" },
  { host: "sandbox.tradier.com" },
  { host: "demo.tradelocker.com" },
  { host: "api.alpaca.markets", paths: /^\/oauth\/token$/ },
  { host: "api.tradier.com", paths: /^\/v1\/oauth\/(?:accesstoken|authorize|refreshtoken)$/ },
];

const LIVE_HOSTS = new Set([
  "api-fxtrade.oanda.com",
  "api.alpaca.markets",
  "api.tradier.com",
  "live.tradelocker.com",
]);

export function assertDemoRequest(url: string, allowLive: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BrokerRequestError("Refusing a request with an unreadable URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new BrokerRequestError("Refusing a non-HTTPS broker request.");
  }
  if (parsed.username || parsed.password || parsed.search.includes("token") || parsed.search.includes("key")) {
    throw new BrokerRequestError("Refusing a broker URL that carries credentials.");
  }
  const demo = DEMO_RULES.find((rule) => rule.host === parsed.host);
  if (demo) {
    if (!demo.paths || demo.paths.test(parsed.pathname)) return;
  }
  if (allowLive && LIVE_HOSTS.has(parsed.host)) return;
  throw new BrokerRequestError(`Refusing a request to ${parsed.host}. Demo and paper hosts only.`);
}

export function createGuardedClient(inner: HttpClient, opts?: { allowLive?: boolean }): HttpClient {
  return {
    async request(req) {
      const allowLive = opts?.allowLive === true && process.env.FLOWCHART_ALLOW_LIVE_NETWORK === "1";
      assertDemoRequest(req.url, allowLive);
      try {
        return await inner.request(req);
      } catch (error) {
        const message = error instanceof Error ? error.message : "request failed";
        throw new BrokerRequestError(redactText(message, []));
      }
    },
  };
}

export function fetchHttpClient(): HttpClient {
  return {
    async request(req) {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      return { status: response.status, body: await response.text() };
    },
  };
}

export function httpError(status: number, body: string, secrets: readonly string[]): BrokerRequestError {
  const snippet = body.slice(0, 300);
  return new BrokerRequestError(redactText(`Venue responded ${status}: ${snippet}`, secrets));
}
