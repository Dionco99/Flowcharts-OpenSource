// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ReplayFillAdapter,
  type MinuteBar,
  type PortResult,
  type PortSuccess,
  type SymbolSpec,
} from "../src/index.ts";

const spec: SymbolSpec = {
  symbol: "EURUSD",
  tickSize: 0.0001,
  lotSize: 100_000,
  lotStep: 0.01,
};

/** `08:00` is minute 0. The desk's first completed bar closes at minute 1. */
function at(minute: number): string {
  return `2026-03-02T08:${String(minute).padStart(2, "0")}:00.000Z`;
}

function bar(minute: number, open: number, high: number, low: number, close: number): MinuteBar {
  return {
    openTime: at(minute - 1),
    closeTime: at(minute),
    open,
    high,
    low,
    close,
  };
}

function must(result: PortResult): PortSuccess {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result;
}

function desk(costs: { spread?: number; commissionPerLot?: number } = {}): ReplayFillAdapter {
  const adapter = new ReplayFillAdapter(spec, {
    spread: costs.spread ?? 0.0002,
    commissionPerLot: costs.commissionPerLot ?? 0,
  });
  must(adapter.setCursor(at(1)));
  must(adapter.onBar(bar(1, 1.1, 1.101, 1.099, 1.1)));
  return adapter;
}

function play(
  adapter: ReplayFillAdapter,
  minute: number,
  open: number,
  high: number,
  low: number,
  close: number,
): PortSuccess {
  must(adapter.setCursor(at(minute)));
  return must(adapter.onBar(bar(minute, open, high, low, close)));
}

describe("place", () => {
  it("fills a market long and a market short at the last close, with spread", () => {
    const long = desk();
    const bought = must(long.place({ type: "market", side: "buy", lots: 1 }));
    assert.equal(bought.fills.length, 1);
    assert.equal(bought.fills[0].reason, "market");
    assert.equal(bought.fills[0].side, "buy");
    assert.equal(bought.fills[0].referencePrice, 1.1);
    assert.equal(bought.fills[0].price, 1.1001);
    assert.equal(bought.fills[0].spread, 0.0002);
    assert.equal(bought.fills[0].spreadCost, 0.0001);
    assert.equal(bought.fills[0].ambiguous, false);
    assert.equal(bought.fills[0].time, at(1));
    assert.equal(bought.fills[0].barCloseTime, at(1));
    assert.equal(bought.position.side, "long");
    assert.equal(bought.position.lots, 1);
    assert.equal(bought.position.averagePrice, 1.1001);
    assert.equal(long.snapshot().unrealizedPnl, -10);
    assert.equal(long.snapshot().orders.length, 0);

    const view = long.snapshot();
    view.position.lots = 99;
    assert.equal(long.snapshot().position.lots, 1);

    const short = desk();
    const sold = must(short.place({ type: "market", side: "sell", lots: 1 }));
    assert.equal(sold.fills[0].price, 1.0999);
    assert.equal(sold.position.side, "short");
    assert.equal(sold.position.averagePrice, 1.0999);
  });

  it("rounds an odd spread to a tick against the trader", () => {
    const adapter = new ReplayFillAdapter(
      { symbol: "EURUSD", tickSize: 0.00001, lotSize: 100_000, lotStep: 0.01 },
      { spread: 0.00003, commissionPerLot: 0 },
    );
    must(adapter.setCursor(at(1)));
    must(adapter.onBar(bar(1, 1.1, 1.1001, 1.0999, 1.1)));
    const bought = must(adapter.place({ type: "market", side: "buy", lots: 1 }));
    assert.equal(bought.fills[0].price, 1.10002);
    assert.equal(bought.fills[0].spreadCost, 0.00002);
    const sold = must(adapter.place({ type: "market", side: "sell", lots: 2 }));
    assert.equal(sold.fills[0].price, 1.09998);
    assert.equal(sold.position.side, "short");
    assert.equal(sold.position.lots, 1);
  });

  it("fills a marketable limit at the close and rests a limit that is not through it", () => {
    const adapter = desk();
    const crossed = must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.101 }));
    assert.equal(crossed.fills[0].reason, "limit");
    assert.equal(crossed.fills[0].referencePrice, 1.1);
    assert.equal(crossed.fills[0].price, 1.1001);
    assert.equal(adapter.snapshot().orders.length, 0);

    const rested = must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.095 }));
    assert.equal(rested.fills.length, 0);
    assert.equal(rested.order?.status, "working");
    const filled = play(adapter, 2, 1.1, 1.1005, 1.094, 1.099);
    assert.equal(filled.fills.length, 1);
    assert.equal(filled.fills[0].referencePrice, 1.095);
    assert.equal(filled.fills[0].price, 1.0951);
    assert.equal(filled.position.lots, 2);
  });

  it("gives a limit the open when the minute gaps through it", () => {
    const adapter = desk();
    must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.095 }));
    const filled = play(adapter, 2, 1.09, 1.092, 1.089, 1.091);
    assert.equal(filled.fills[0].referencePrice, 1.09);
    assert.equal(filled.fills[0].price, 1.0901);
  });

  it("fills a resting stop at the stop, and at the open when the minute gaps through", () => {
    const atLevel = desk();
    must(atLevel.place({ type: "stop", side: "buy", lots: 1, stopPrice: 1.105 }));
    const filled = play(atLevel, 2, 1.104, 1.106, 1.1035, 1.1055);
    assert.equal(filled.fills[0].reason, "stop");
    assert.equal(filled.fills[0].referencePrice, 1.105);
    assert.equal(filled.fills[0].price, 1.1051);

    const gapped = desk();
    must(gapped.place({ type: "stop", side: "buy", lots: 1, stopPrice: 1.105 }));
    const gap = play(gapped, 2, 1.108, 1.109, 1.107, 1.1085);
    assert.equal(gap.fills[0].referencePrice, 1.108);
    assert.equal(gap.fills[0].price, 1.1081);
  });

  it("does not fill a stop from a wick on a minute that is already complete", () => {
    const adapter = desk();
    play(adapter, 2, 1.1, 1.106, 1.099, 1.1);
    const placed = must(adapter.place({ type: "stop", side: "buy", lots: 1, stopPrice: 1.105 }));
    assert.equal(placed.fills.length, 0);
    assert.equal(adapter.snapshot().orders.length, 1);
    const next = play(adapter, 3, 1.1, 1.105, 1.0995, 1.104);
    assert.equal(next.fills[0].referencePrice, 1.105);
    assert.equal(next.position.side, "long");
  });

  it("adds to a long without clearing protection, then replaces a level the new order sets", () => {
    const adapter = desk();
    must(
      adapter.place({
        type: "market",
        side: "buy",
        lots: 1,
        stopLoss: 1.09,
        takeProfit: 1.12,
      }),
    );
    const added = must(adapter.place({ type: "market", side: "buy", lots: 1 }));
    assert.equal(added.position.lots, 2);
    assert.equal(added.position.averagePrice, 1.1001);
    assert.equal(added.position.stopLoss, 1.09);
    assert.equal(added.position.takeProfit, 1.12);

    const replaced = must(adapter.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.095 }));
    assert.equal(replaced.position.lots, 3);
    assert.equal(replaced.position.averagePrice, 1.1001);
    assert.equal(replaced.position.stopLoss, 1.095);
    assert.equal(replaced.position.takeProfit, 1.12);
  });

  it("nets a larger opposite order into a short remainder", () => {
    const adapter = desk();
    must(adapter.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.09, takeProfit: 1.13 }));
    play(adapter, 2, 1.101, 1.106, 1.1, 1.105);
    const flipped = must(
      adapter.place({
        type: "market",
        side: "sell",
        lots: 2,
        stopLoss: 1.11,
        takeProfit: 1.09,
      }),
    );
    assert.equal(flipped.fills[0].lots, 2);
    assert.equal(flipped.fills[0].price, 1.1049);
    assert.equal(flipped.fills[0].realizedPnl, 480);
    assert.equal(flipped.position.side, "short");
    assert.equal(flipped.position.lots, 1);
    assert.equal(flipped.position.averagePrice, 1.1049);
    assert.equal(flipped.position.stopLoss, 1.11);
    assert.equal(flipped.position.takeProfit, 1.09);
  });

  it("returns the original order when the client order id is repeated", () => {
    const adapter = desk();
    const first = must(
      adapter.place({ type: "market", side: "buy", lots: 1, clientOrderId: "entry-1" }),
    );
    const again = must(
      adapter.place({ type: "market", side: "sell", lots: 1, clientOrderId: "entry-1" }),
    );
    assert.equal(again.fills.length, 0);
    assert.equal(again.order?.id, first.order?.id);
    assert.equal(again.position.lots, 1);
    assert.equal(again.position.side, "long");
    assert.equal(adapter.snapshot().fills.length, 1);
  });

  it("rejects a market before any minute, a stop on the wrong side, and a missing cursor", () => {
    const bare = new ReplayFillAdapter(spec, { spread: 0.0002, commissionPerLot: 0 });
    const noCursor = bare.place({ type: "market", side: "buy", lots: 1 });
    assert.equal(noCursor.ok, false);
    if (!noCursor.ok) assert.equal(noCursor.code, "cursor_not_set");

    must(bare.setCursor(at(1)));
    const noBar = bare.place({ type: "market", side: "buy", lots: 1 });
    assert.equal(noBar.ok, false);
    if (!noBar.ok) assert.equal(noBar.code, "no_completed_bar");
    assert.equal(bare.snapshot().position.side, "flat");

    const adapter = desk();
    const badStop = adapter.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.11 });
    assert.equal(badStop.ok, false);
    if (!badStop.ok) assert.equal(badStop.code, "invalid_protection");
    assert.equal(adapter.snapshot().fills.length, 0);

    must(adapter.setCursor(at(2)));
    const later = must(adapter.place({ type: "market", side: "buy", lots: 1 }));
    assert.equal(later.fills[0].time, at(2));
    assert.equal(later.fills[0].barCloseTime, at(1));
    assert.equal(later.fills[0].referencePrice, 1.1);
  });
});

describe("modify", () => {
  it("changes size, price, and protection, and fills only the new order", () => {
    const adapter = desk();
    const placed = must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.094 }));
    const id = placed.order!.id;
    const modified = must(
      adapter.modify({
        orderId: id,
        lots: 2,
        limitPrice: 1.09,
        stopLoss: 1.08,
        takeProfit: 1.12,
      }),
    );
    assert.equal(modified.order?.lots, 2);
    assert.equal(modified.order?.limitPrice, 1.09);
    assert.equal(modified.fills.length, 0);

    const missed = play(adapter, 2, 1.1, 1.101, 1.092, 1.098);
    assert.equal(missed.fills.length, 0);
    assert.equal(adapter.snapshot().orders[0].lots, 2);
    assert.equal(adapter.snapshot().orders[0].limitPrice, 1.09);

    const filled = play(adapter, 3, 1.093, 1.094, 1.09, 1.092);
    assert.equal(filled.fills.length, 1);
    assert.equal(filled.fills[0].lots, 2);
    assert.equal(filled.fills[0].price, 1.0901);
    assert.equal(filled.position.lots, 2);
    assert.equal(filled.position.stopLoss, 1.08);
    assert.equal(filled.position.takeProfit, 1.12);
  });

  it("does not fill a modified order against a minute already seen", () => {
    const adapter = desk();
    const placed = must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.09 }));
    const modified = must(adapter.modify({ orderId: placed.order!.id, limitPrice: 1.1 }));
    assert.equal(modified.fills.length, 0);
    assert.equal(adapter.snapshot().orders.length, 1);
    assert.equal(adapter.snapshot().position.side, "flat");
  });

  it("rejects an unknown id, a filled order, and a price off the tick grid", () => {
    const adapter = desk();
    const missing = adapter.modify({ orderId: "ord-missing", lots: 1 });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "order_not_found");

    const placed = must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.09 }));
    const bad = adapter.modify({ orderId: placed.order!.id, limitPrice: 1.09001 });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "invalid_price");
    assert.equal(adapter.snapshot().orders[0].limitPrice, 1.09);

    const bought = must(adapter.place({ type: "market", side: "buy", lots: 1 }));
    const filled = adapter.modify({ orderId: bought.order!.id, lots: 2 });
    assert.equal(filled.ok, false);
    if (!filled.ok) assert.equal(filled.code, "order_not_working");
  });
});

describe("partial close", () => {
  it("reduces a long, keeps the average and protection, then flattens the rest", () => {
    const adapter = desk({ commissionPerLot: 7 });
    must(
      adapter.place({
        type: "market",
        side: "buy",
        lots: 2,
        stopLoss: 1.09,
        takeProfit: 1.12,
      }),
    );
    assert.equal(adapter.snapshot().fills[0].commission, 14);
    assert.equal(adapter.snapshot().fills[0].realizedPnl, -14);

    play(adapter, 2, 1.101, 1.106, 1.1005, 1.105);
    const partial = must(adapter.close({ lots: 0.5 }));
    assert.equal(partial.fills[0].reason, "close");
    assert.equal(partial.fills[0].side, "sell");
    assert.equal(partial.fills[0].lots, 0.5);
    assert.equal(partial.fills[0].referencePrice, 1.105);
    assert.equal(partial.fills[0].price, 1.1049);
    assert.equal(partial.fills[0].spread, 0.0002);
    assert.equal(partial.fills[0].spreadCost, 0.0001);
    assert.equal(partial.fills[0].commission, 3.5);
    assert.equal(partial.fills[0].realizedPnl, 236.5);
    assert.equal(partial.fills[0].ambiguous, false);
    assert.equal(partial.position.side, "long");
    assert.equal(partial.position.lots, 1.5);
    assert.equal(partial.position.averagePrice, 1.1001);
    assert.equal(partial.position.stopLoss, 1.09);
    assert.equal(partial.position.takeProfit, 1.12);
    assert.equal(adapter.snapshot().realizedPnl, 222.5);

    const rest = must(adapter.close());
    assert.equal(rest.fills[0].lots, 1.5);
    assert.equal(rest.fills[0].realizedPnl, 709.5);
    assert.equal(rest.position.side, "flat");
    assert.equal(rest.position.lots, 0);
    assert.equal(rest.position.averagePrice, 0);
    assert.equal(rest.position.stopLoss, null);
    assert.equal(rest.position.takeProfit, null);
    assert.equal(adapter.snapshot().realizedPnl, 932);
    assert.equal(adapter.snapshot().commissionPaid, 28);
    assert.equal(adapter.snapshot().unrealizedPnl, 0);
  });

  it("reduces a short and realizes the quote-currency gain", () => {
    const adapter = desk();
    must(
      adapter.place({
        type: "market",
        side: "sell",
        lots: 2,
        stopLoss: 1.12,
        takeProfit: 1.08,
      }),
    );
    play(adapter, 2, 1.099, 1.1, 1.0945, 1.095);
    const partial = must(adapter.close({ lots: 0.5 }));
    assert.equal(partial.fills[0].side, "buy");
    assert.equal(partial.fills[0].price, 1.0951);
    assert.equal(partial.fills[0].realizedPnl, 240);
    assert.equal(partial.position.side, "short");
    assert.equal(partial.position.lots, 1.5);
    assert.equal(partial.position.averagePrice, 1.0999);
    assert.equal(partial.position.stopLoss, 1.12);
    assert.equal(partial.position.takeProfit, 1.08);
  });

  it("rejects a close that is larger than the position, a close when flat, and a repeated close id", () => {
    const adapter = desk();
    const flat = adapter.close();
    assert.equal(flat.ok, false);
    if (!flat.ok) assert.equal(flat.code, "position_flat");

    must(adapter.place({ type: "market", side: "buy", lots: 1 }));
    const tooBig = adapter.close({ lots: 1.5 });
    assert.equal(tooBig.ok, false);
    if (!tooBig.ok) assert.equal(tooBig.code, "close_exceeds_position");
    assert.equal(adapter.snapshot().position.lots, 1);

    const closed = must(adapter.close({ clientOrderId: "close-1" }));
    assert.equal(closed.position.side, "flat");
    const again = must(adapter.close({ clientOrderId: "close-1" }));
    assert.equal(again.fills.length, 0);
    assert.equal(again.order?.id, closed.order?.id);
    assert.equal(adapter.snapshot().fills.length, 2);
  });
});

describe("stop loss and take profit", () => {
  it("exits a long at the stop and at the target on a later minute", () => {
    const stopped = desk();
    must(stopped.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.09, takeProfit: 1.12 }));
    const stop = play(stopped, 2, 1.1, 1.101, 1.089, 1.095);
    assert.equal(stop.fills.length, 1);
    assert.equal(stop.fills[0].reason, "stop_loss");
    assert.equal(stop.fills[0].price, 1.0899);
    assert.equal(stop.fills[0].ambiguous, false);
    assert.equal(stop.fills[0].realizedPnl, -1020);
    assert.equal(stop.position.side, "flat");

    const targeted = desk();
    must(targeted.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.09, takeProfit: 1.12 }));
    const target = play(targeted, 2, 1.1, 1.121, 1.099, 1.11);
    assert.equal(target.fills[0].reason, "take_profit");
    assert.equal(target.fills[0].price, 1.1199);
    assert.equal(target.fills[0].ambiguous, false);
    assert.equal(target.fills[0].realizedPnl, 1980);
  });

  it("exits a short at the stop and at the target on a later minute", () => {
    const stopped = desk();
    must(stopped.place({ type: "market", side: "sell", lots: 1, stopLoss: 1.11, takeProfit: 1.08 }));
    const stop = play(stopped, 2, 1.1, 1.111, 1.099, 1.105);
    assert.equal(stop.fills[0].reason, "stop_loss");
    assert.equal(stop.fills[0].side, "buy");
    assert.equal(stop.fills[0].price, 1.1101);
    assert.equal(stop.fills[0].ambiguous, false);
    assert.equal(stop.fills[0].realizedPnl, -1020);

    const targeted = desk();
    must(targeted.place({ type: "market", side: "sell", lots: 1, stopLoss: 1.11, takeProfit: 1.08 }));
    const target = play(targeted, 2, 1.099, 1.1, 1.079, 1.09);
    assert.equal(target.fills[0].reason, "take_profit");
    assert.equal(target.fills[0].price, 1.0801);
    assert.equal(target.fills[0].realizedPnl, 1980);
    assert.equal(target.position.side, "flat");
  });

  it("marks a minute that trades through both the stop and the target, and fills the stop", () => {
    for (const side of ["long", "short"] as const) {
      const adapter = desk();
      must(
        adapter.place({
          type: "market",
          side: side === "long" ? "buy" : "sell",
          lots: 1,
          stopLoss: side === "long" ? 1.09 : 1.11,
          takeProfit: side === "long" ? 1.12 : 1.08,
        }),
      );
      const both = play(adapter, 2, 1.1, 1.121, 1.079, 1.1);
      assert.equal(both.fills.length, 1);
      assert.equal(both.fills[0].reason, "stop_loss");
      assert.equal(both.fills[0].ambiguous, true);
      assert.equal(both.fills[0].price, side === "long" ? 1.0899 : 1.1101);
      assert.equal(both.fills[0].realizedPnl, -1020);
      assert.equal(both.position.side, "flat");
    }
  });

  it("fills a gap through the stop at the open and does not mark it ambiguous", () => {
    const long = desk();
    must(long.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.09, takeProfit: 1.12 }));
    const gap = play(long, 2, 1.08, 1.085, 1.079, 1.082);
    assert.equal(gap.fills[0].reason, "stop_loss");
    assert.equal(gap.fills[0].ambiguous, false);
    assert.equal(gap.fills[0].referencePrice, 1.08);
    assert.equal(gap.fills[0].price, 1.0799);
    assert.equal(gap.fills[0].realizedPnl, -2020);

    const short = desk();
    must(short.place({ type: "market", side: "sell", lots: 1, stopLoss: 1.11, takeProfit: 1.08 }));
    const shortGap = play(short, 2, 1.12, 1.121, 1.115, 1.118);
    assert.equal(shortGap.fills[0].ambiguous, false);
    assert.equal(shortGap.fills[0].referencePrice, 1.12);
    assert.equal(shortGap.fills[0].price, 1.1201);
  });

  it("does not apply protective levels on the same minute that opens the position", () => {
    const adapter = desk();
    must(
      adapter.place({
        type: "limit",
        side: "buy",
        lots: 1,
        limitPrice: 1.095,
        stopLoss: 1.094,
        takeProfit: 1.11,
      }),
    );
    const opened = play(adapter, 2, 1.1, 1.101, 1.093, 1.098);
    assert.equal(opened.fills.length, 1);
    assert.equal(opened.fills[0].reason, "limit");
    assert.equal(opened.position.side, "long");
    assert.equal(opened.position.stopLoss, 1.094);
    assert.equal(opened.position.averagePrice, 1.0951);

    const stopped = play(adapter, 3, 1.096, 1.097, 1.0935, 1.0945);
    assert.equal(stopped.fills[0].reason, "stop_loss");
    assert.equal(stopped.fills[0].price, 1.0939);
    assert.equal(stopped.position.side, "flat");
  });

  it("replaces a live level without rescanning the current wick", () => {
    const adapter = desk();
    must(adapter.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.09, takeProfit: 1.12 }));
    play(adapter, 2, 1.1, 1.101, 1.094, 1.1);
    assert.equal(adapter.snapshot().position.side, "long");

    const wrong = adapter.modifyProtection({ stopLoss: 1.1 });
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.code, "invalid_protection");
    assert.equal(adapter.snapshot().position.stopLoss, 1.09);

    const moved = must(adapter.modifyProtection({ stopLoss: 1.095 }));
    assert.equal(moved.fills.length, 0);
    assert.equal(moved.position.stopLoss, 1.095);
    assert.equal(adapter.snapshot().position.side, "long");

    const hit = play(adapter, 3, 1.099, 1.1, 1.0948, 1.097);
    assert.equal(hit.fills[0].reason, "stop_loss");
    assert.equal(hit.fills[0].price, 1.0949);
    assert.equal(hit.fills[0].realizedPnl, -520);
    assert.equal(hit.position.side, "flat");
  });

  it("applies protective exits before resting orders on the same minute", () => {
    const adapter = desk();
    must(adapter.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.09, takeProfit: 1.11 }));
    must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.095 }));
    const minute = play(adapter, 2, 1.1, 1.111, 1.094, 1.105);
    assert.deepEqual(
      minute.fills.map((fill) => fill.reason),
      ["take_profit", "limit"],
    );
    assert.equal(minute.fills[0].price, 1.1099);
    assert.equal(minute.fills[0].realizedPnl, 980);
    assert.equal(minute.fills[1].price, 1.0951);
    assert.equal(minute.position.side, "long");
    assert.equal(minute.position.lots, 1);
    assert.equal(minute.position.averagePrice, 1.0951);
    assert.equal(minute.position.stopLoss, null);
    assert.equal(minute.position.takeProfit, null);
  });
});

describe("cancel, cursor, and session book", () => {
  it("cancels a working order once", () => {
    const adapter = desk();
    const placed = must(adapter.place({ type: "limit", side: "sell", lots: 1, limitPrice: 1.11 }));
    const cancelled = must(adapter.cancel(placed.order!.id));
    assert.equal(cancelled.order?.status, "cancelled");
    assert.equal(adapter.snapshot().orders.length, 0);
    const again = adapter.cancel(placed.order!.id);
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.code, "order_not_working");
  });

  it("rejects a minute that closes after the cursor and does not let it fill", () => {
    const adapter = desk();
    must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.09 }));
    const future = adapter.onBar(bar(2, 1.1, 1.101, 1.08, 1.09));
    assert.equal(future.ok, false);
    if (!future.ok) assert.equal(future.code, "bar_after_cursor");
    assert.equal(adapter.snapshot().orders.length, 1);
    assert.equal(adapter.exportState().lastBar?.closeTime, at(1));

    const quiet = play(adapter, 2, 1.1, 1.101, 1.095, 1.099);
    assert.equal(quiet.fills.length, 0);
    const filled = play(adapter, 3, 1.099, 1.1, 1.09, 1.095);
    assert.equal(filled.fills[0].reason, "limit");
    assert.equal(filled.position.lots, 1);
  });

  it("restores a working order and an open position from the session book", () => {
    const adapter = desk();
    must(adapter.place({ type: "market", side: "buy", lots: 1, stopLoss: 1.09 }));
    must(adapter.place({ type: "limit", side: "buy", lots: 1, limitPrice: 1.095 }));
    const saved = adapter.exportState();

    const restored = new ReplayFillAdapter(spec, { spread: 0.0002, commissionPerLot: 0 });
    const other = restored.loadState({ ...saved, symbol: "GBPUSD" });
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.code, "invalid_state");
    assert.equal(restored.snapshot().position.side, "flat");

    must(restored.loadState(saved));
    assert.equal(restored.adapterId, "replay");
    assert.equal(restored.snapshot().position.side, "long");
    assert.equal(restored.snapshot().position.lots, 1);
    assert.equal(restored.snapshot().position.stopLoss, 1.09);
    assert.equal(restored.snapshot().orders.length, 1);
    assert.equal(restored.snapshot().fills.length, 1);

    const filled = play(restored, 2, 1.099, 1.1, 1.095, 1.097);
    assert.equal(filled.position.lots, 2);
    assert.equal(filled.position.averagePrice, 1.0976);
    assert.equal(filled.position.stopLoss, 1.09);
  });
});
