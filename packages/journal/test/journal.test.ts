// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { collectTags, defaultFilters, filterTrades, summarize } from "../src/filter.ts";
import { formatR, normalizeTrade, parseR, tradesFromImport } from "../src/record.ts";
import type { Trade } from "../src/types.ts";

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: overrides.id ?? "t1",
    createdAt: "2024-03-12T12:00:00.000Z",
    updatedAt: "2024-03-12T12:00:00.000Z",
    source: "replay",
    symbol: "EURUSD",
    side: "short",
    openedAt: "2024-03-12T08:15:00.000Z",
    closedAt: "2024-03-12T09:40:00.000Z",
    setup: "London sweep",
    tags: ["late-entry"],
    notes: "Second touch failed.",
    emotions: "Chased it.",
    ruleAdherence: "partial",
    rResult: -0.5,
    snapshotRef: "sessions/london-short.png",
    snapshotId: null,
    sessionRef: "eurusd-2024-03-12",
    ...overrides,
  };
}

const parsed = parseR(" +1.5R ");
assert.equal(parsed, 1.5);
assert.equal(parseR("-0.25"), -0.25);
assert.equal(parseR(""), null);
assert.equal(parseR("nope"), null);
assert.equal(formatR(1.5), "+1.50R");
assert.equal(formatR(-0.5), "−0.50R");
assert.equal(formatR(0), "0.00R");

const imported = normalizeTrade({
  source: "backtest",
  symbol: "gbpusd",
  side: "long",
  setup: "Asia fade",
  tags: ["news", "news"],
  notes: "Held to target.",
  emotions: "",
  ruleAdherence: "followed",
  rResult: 2,
  snapshotRef: "runs/fade.png",
  sessionRef: "lean-14",
  openedAt: "2024-03-11T07:00:00.000Z",
  closedAt: "2024-03-11T11:00:00.000Z",
});
assert.ok(imported);
assert.equal(imported.symbol, "GBPUSD");
assert.equal(imported.source, "backtest");
assert.deepEqual(imported.tags, ["news"]);
assert.equal(imported.rResult, 2);

assert.equal(normalizeTrade({ symbol: "EURUSD", rResult: 1 }), null);
assert.equal(normalizeTrade({ symbol: "EURUSD", setup: "X", source: "live", ruleAdherence: "broken", rResult: "no" }), null);

const wrapped = tradesFromImport({
  trades: [
    imported,
    { source: "replay", symbol: "USDJPY", setup: "Open drive", ruleAdherence: "followed", rResult: -1 },
  ],
});
assert.equal(wrapped.length, 2);

const rows = [
  trade(),
  trade({
    id: "t2",
    symbol: "USDJPY",
    source: "live",
    setup: "Open drive",
    tags: ["news"],
    ruleAdherence: "followed",
    rResult: 1.4,
    closedAt: "2024-03-13T15:00:00.000Z",
    notes: "Clean.",
    emotions: "Patient.",
  }),
  trade({
    id: "t3",
    source: "backtest",
    setup: "Asia fade",
    tags: [],
    ruleAdherence: "broken",
    rResult: 0,
    closedAt: "2024-03-10T15:00:00.000Z",
  }),
];

const filters = defaultFilters();
assert.deepEqual(filterTrades(rows, filters).map((row) => row.id), ["t2", "t1", "t3"]);

const tagged = filterTrades(rows, { ...filters, tag: "late-entry" });
assert.deepEqual(tagged.map((row) => row.id), ["t1"]);

const liveWins = filterTrades(rows, {
  ...filters,
  sources: { backtest: false, replay: false, live: true },
  result: "win",
});
assert.deepEqual(liveWins.map((row) => row.id), ["t2"]);

const broken = filterTrades(rows, { ...filters, adherence: "broken" });
assert.deepEqual(broken.map((row) => row.id), ["t3"]);

const searched = filterTrades(rows, { ...filters, query: "patient" });
assert.deepEqual(searched.map((row) => row.id), ["t2"]);

assert.equal(filterTrades(rows, { ...filters, sources: { backtest: false, replay: false, live: false } }).length, 0);

const tags = collectTags(rows);
assert.ok(tags.includes("London sweep"));
assert.ok(tags.includes("late-entry"));
assert.equal(new Set(tags).size, tags.length);

const stats = summarize(tagged);
assert.equal(stats.count, 1);
assert.equal(stats.netR, -0.5);
assert.equal(stats.followed, 0);

const all = summarize(rows);
assert.equal(all.count, 3);
assert.equal(all.netR, 0.9);
assert.equal(all.followed, 1);

console.log("journal tests passed");
