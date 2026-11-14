// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WatchlistBook,
  memoryStore,
  searchSymbols,
  WATCHLIST_STORAGE_KEY,
} from "../src/index.ts";
import { bars } from "./helpers.ts";

const catalog = [
  { symbol: "EURUSD", name: "Euro / US Dollar", venue: "FX" },
  { symbol: "GBPUSD", name: "Pound / US Dollar", venue: "FX" },
  { symbol: "USDJPY", name: "US Dollar / Yen", venue: "FX" },
];

test("watchlists add, remove, search, and quote", () => {
  const book = new WatchlistBook();
  book.create("Main", "main");
  book.add("main", { symbol: "eurusd", label: "Euro" });
  book.add("main", { symbol: "GBPUSD", label: "Cable" });
  book.add("main", { symbol: "EURUSD", label: "Euro updated" });
  assert.equal(book.get("main").items.length, 2);
  assert.equal(book.get("main").items[0].label, "Euro updated");
  const series = bars([{ close: "1.10000" }, { close: "1.10100" }]);
  const quotes = book.quotes("main", [{ symbol: "EURUSD", bars: series }], series[1].closeTime);
  assert.equal(quotes[0].last, "1.10100");
  assert.equal(quotes[0].previous, "1.10000");
  assert.equal(quotes[0].change, "0.001");
  assert.equal(quotes[1].last, null);
  assert.deepEqual(
    searchSymbols("yen", catalog).map((row) => row.symbol),
    ["USDJPY"],
  );
  assert.deepEqual(
    book.search("pound", catalog).map((row) => row.symbol),
    ["GBPUSD"],
  );
  book.remove("main", "GBPUSD");
  assert.deepEqual(book.get("main").items.map((item) => item.symbol), ["EURUSD"]);
  const restored = WatchlistBook.fromJSON(book.toJSON());
  assert.equal(restored.get("main").name, "Main");
  const store = memoryStore();
  store.set(WATCHLIST_STORAGE_KEY, book.toJSON());
  assert.equal(store.get(WATCHLIST_STORAGE_KEY)?.includes("EURUSD"), true);
});
