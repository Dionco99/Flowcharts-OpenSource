// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { PluginHost, type Bar, type Window } from "../../../src/index.ts";
import { sessionVwapPlugin } from "../src/index.ts";

const spec = {
  symbol: "EURUSD",
  tickSize: "0.00001",
  lotSize: 100_000,
  timezone: "America/New_York",
  sessions: [
    { id: "asia", name: "Asia", open: "19:00", close: "04:00" },
    { id: "london", name: "London", open: "03:00", close: "12:00" },
    { id: "newyork", name: "New York", open: "08:00", close: "17:00" },
  ],
};

function candle(openTime: string, price: string): Bar {
  const open = Date.parse(openTime);
  const closeTime = new Date(open + 60_000).toISOString().replace(".000Z", "Z");
  return {
    openTime,
    closeTime,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: 1,
  };
}

test("session VWAP resets with London and ignores a future bar", () => {
  const outside = candle("2026-01-15T07:00:00Z", "9");
  const first = candle("2026-01-15T08:00:00Z", "1");
  const second = candle("2026-01-15T08:01:00Z", "2");
  const third = candle("2026-01-15T08:02:00Z", "3");
  const later = candle("2026-01-16T08:00:00Z", "4");
  const host = new PluginHost();
  host.register(sessionVwapPlugin);
  const cursor = third.closeTime;
  const window: Window = {
    spec,
    timeframe: "1m",
    cursor,
    bars: [outside, first, second, third],
  };
  const result = host.runIndicator("example.session-vwap", window, { session: "london" });
  assert.deepEqual(result.plots.vwap, [null, "1", "1.5", "2"]);

  const next: Window = {
    spec,
    timeframe: "1m",
    cursor: later.closeTime,
    bars: [outside, first, second, third, later],
  };
  const reset = host.runIndicator("example.session-vwap", next, { session: "london" });
  assert.equal(reset.plots.vwap?.[4], "4");
  assert.throws(() =>
    host.runIndicator("example.session-vwap", {
      ...next,
      cursor: third.closeTime,
      bars: [outside, first, second, third, later],
    }),
  );
});
