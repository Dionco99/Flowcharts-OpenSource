// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Filters, Trade } from "./types.ts";
import { SOURCES } from "./types.ts";

export function defaultFilters(): Filters {
  return {
    query: "",
    sources: { backtest: true, replay: true, live: true },
    tag: "",
    adherence: "any",
    result: "any",
  };
}

export function tradeMatches(trade: Trade, filters: Filters): boolean {
  const sourcesOn = SOURCES.filter((source) => filters.sources[source]);
  if (sourcesOn.length === 0) return false;
  if (!sourcesOn.includes(trade.source)) return false;

  if (filters.adherence !== "any" && trade.ruleAdherence !== filters.adherence) {
    return false;
  }

  if (filters.result === "win" && !(trade.rResult > 0)) return false;
  if (filters.result === "loss" && !(trade.rResult < 0)) return false;
  if (filters.result === "scratch" && trade.rResult !== 0) return false;

  const tag = filters.tag.trim().toLowerCase();
  if (tag) {
    const names = [trade.setup, ...trade.tags].map((item) => item.trim().toLowerCase());
    if (!names.includes(tag)) return false;
  }

  const query = filters.query.trim().toLowerCase();
  if (query) {
    const haystack = [
      trade.symbol,
      trade.setup,
      trade.notes,
      trade.emotions,
      trade.snapshotRef,
      trade.sessionRef,
      trade.side,
      trade.source,
      trade.ruleAdherence,
      ...trade.tags,
    ]
      .join("\n")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  return true;
}

export function filterTrades(trades: Trade[], filters: Filters): Trade[] {
  return trades.filter((trade) => tradeMatches(trade, filters)).sort(compareTrades);
}

export function compareTrades(a: Trade, b: Trade): number {
  const aKey = a.closedAt || a.openedAt || a.createdAt;
  const bKey = b.closedAt || b.openedAt || b.createdAt;
  if (aKey !== bKey) return aKey < bKey ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export function collectTags(trades: Trade[]): string[] {
  const seen = new Map<string, string>();
  for (const trade of trades) {
    for (const raw of [trade.setup, ...trade.tags]) {
      const display = raw.trim();
      const key = display.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.set(key, display);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function summarize(trades: Trade[]): {
  count: number;
  netR: number;
  averageR: number;
  followed: number;
} {
  const count = trades.length;
  const netR = roundR(trades.reduce((sum, trade) => sum + trade.rResult, 0));
  const averageR = count === 0 ? 0 : roundR(netR / count);
  const followed = trades.filter((trade) => trade.ruleAdherence === "followed").length;
  return { count, netR, averageR, followed };
}

export function roundR(value: number): number {
  return Math.round(value * 100) / 100;
}
