// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { hotlist, screen, type ScreenRow } from "../src/index.ts";
import { bars } from "./helpers.ts";

function book(symbol: string, closes: string[], volume?: string[]): ScreenRow {
  return {
    symbol,
    bars: bars(closes.map((close, index) => ({ close, volume: volume?.[index] ?? "10" }))),
    fundamentals: symbol === "EURUSD" ? { rate: "4.50" } : {},
    headlines: [
      { symbol, time: "2024-06-03T13:02:00Z", title: symbol === "EURUSD" ? "ECB holds" : "Quiet session" },
      { symbol, time: "2024-06-03T18:00:00Z", title: "After the cursor" },
    ],
  };
}

test("every screener filter has to pass, across symbols", () => {
  const euro = book("EURUSD", ["10", "10", "10", "12"], ["10", "10", "10", "40"]);
  const pound = book("GBPUSD", ["10", "10", "10", "9"], ["10", "10", "10", "10"]);
  const cursor = euro.bars[3].closeTime;
  const hits = screen(
    [euro, pound],
    [
      { type: "percent-change", lookback: 3, direction: "up", min: "10" },
      { type: "volume-versus-average", length: 3, min: "2" },
      { type: "close-versus-study", name: "sma", params: { length: 3 }, relation: "above" },
      { type: "study-range", name: "sma", params: { length: 3 }, min: "10", max: "12" },
      { type: "new-high" },
      { type: "fundamental", field: "rate", min: "4", max: "5" },
      { type: "headline", phrase: "ecb" },
    ],
    cursor,
  );
  assert.deepEqual(hits.map((hit) => hit.symbol), ["EURUSD"]);
  assert.equal(hits[0].metrics.headline, "ECB holds");

  const quiet = screen([euro], [{ type: "headline", phrase: "after" }], cursor);
  assert.equal(quiet.length, 0);
});

test("new low, supplied fundamentals, and hotlists", () => {
  const euro = book("EURUSD", ["12", "11", "10", "9"]);
  const pound = book("GBPUSD", ["10", "11", "12", "14"]);
  const cursor = euro.bars[3].closeTime;
  assert.deepEqual(screen([euro, pound], [{ type: "new-low" }], cursor).map((hit) => hit.symbol), ["EURUSD"]);
  assert.equal(screen([pound], [{ type: "fundamental", field: "rate", min: "1" }], cursor).length, 0);
  const gainers = hotlist([euro, pound], cursor, { by: "percent", lookback: 3, side: "gainers", limit: 1 });
  assert.equal(gainers[0].symbol, "GBPUSD");
  assert.equal(gainers[0].rank, 1);
  const losers = hotlist([euro, pound], cursor, { by: "percent", lookback: 3, side: "losers", limit: 1 });
  assert.equal(losers[0].symbol, "EURUSD");
  const active = hotlist(
    [
      book("EURUSD", ["1", "1", "1", "1"], ["10", "10", "10", "50"]),
      book("GBPUSD", ["1", "1", "1", "1"], ["10", "10", "10", "10"]),
    ],
    cursor,
    { by: "volume", length: 3, side: "active" },
  );
  assert.equal(active[0].symbol, "EURUSD");
});
