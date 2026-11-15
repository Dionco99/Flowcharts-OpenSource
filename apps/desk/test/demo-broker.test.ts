// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { DESK_VENUE, fillOnBacktest, venueRows } from "../src/demo-broker.ts";

test("the desk venue is the local backtest adapter", () => {
  const rows = venueRows("market");
  const backtest = rows.find((row) => row.venue === DESK_VENUE);
  const oanda = rows.find((row) => row.venue === "oanda");
  assert.equal(backtest?.placement, "local");
  assert.equal(backtest?.protections, false);
  assert.equal(oanda?.placement, "demo");
  assert.equal(rows.some((row) => row.placement === "local" && row.venue !== DESK_VENUE), false);
});

test("a backtest fill is not transmitted", async () => {
  const fill = await fillOnBacktest({
    clientOrderId: "desk-1",
    side: "buy",
    type: "market",
    lots: "0.10",
    markPrice: "1.08500",
    now: "2024-06-03T07:00:00.000Z",
  });
  assert.equal(fill.ok, true);
  if (!fill.ok) return;
  assert.equal(fill.venue, "backtest");
  assert.equal(fill.transmitted, false);
  assert.equal(fill.price, "1.08500");
  assert.equal(fill.status, "filled");
});

test("a backtest order without its price is refused", async () => {
  const fill = await fillOnBacktest({
    clientOrderId: "desk-2",
    side: "sell",
    type: "limit",
    lots: "0.10",
    markPrice: "1.08500",
    now: "2024-06-03T07:00:00.000Z",
  });
  assert.deepEqual(fill, { ok: false, code: "invalid_order" });
});
