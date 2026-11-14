// SPDX-License-Identifier: Apache-2.0

import { EURUSD, type Minute } from "@flowchart/bars";
import assert from "node:assert/strict";
import test from "node:test";
import { runReplay, type OrderRecord } from "../src/index";

const OPEN = Date.parse("2026-11-04T12:00:00.000Z");

function minute(index: number, c = "1.09000"): Minute {
  return { t: OPEN + index * 60_000, o: c, h: "1.09020", l: "1.08980", c };
}

function run(minutes: Minute[], cursor: number, orders: OrderRecord[] = []) {
  return runReplay({ minutes, cursor, spec: EURUSD, tradingTimeframe: "1m", orders, cancels: [], strategy: null });
}

test("a market buy pays the spread and a market sell does not", () => {
  const minutes = [minute(0)];
  const cursor = minutes[0].t + 60_000;
  const buy = run(minutes, cursor, [{ id: "b", side: "buy", type: "market", lots: "0.10", submittedAt: cursor, source: "manual" }]);
  assert.equal(buy.fills[0].price, "1.09008");
  assert.equal(buy.fills[0].commission, "0.35");
  const sell = run(minutes, cursor, [{ id: "s", side: "sell", type: "market", lots: "0.10", submittedAt: cursor, source: "manual" }]);
  assert.equal(sell.fills[0].price, "1.09000");
  assert.equal(sell.position.lots, "-0.10");
});

test("one minute through both a stop and a target fills the stop and marks it ambiguous", () => {
  const minutes = Array.from({ length: 12 }, (_, index) => minute(index));
  minutes[10] = { t: OPEN + 10 * 60_000, o: "1.09000", h: "1.09250", l: "1.08750", c: "1.09100" };
  const order: OrderRecord = {
    id: "m1",
    side: "buy",
    type: "market",
    lots: "0.10",
    stopLoss: "1.08800",
    takeProfit: "1.09200",
    submittedAt: minutes[5].t + 60_000,
    source: "manual",
  };
  const after = run(minutes, minutes[10].t + 60_000, [order]);
  assert.equal(after.fills.length, 2);
  assert.equal(after.fills[1].price, "1.08800");
  assert.equal(after.fills[1].ambiguous, true);
  assert.equal(after.position.lots, "0.00");
  assert.equal(after.orders.length, 0);
});
