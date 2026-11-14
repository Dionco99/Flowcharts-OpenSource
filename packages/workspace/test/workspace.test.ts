// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import {
  HookRegistry,
  LayoutBook,
  WorkspaceError,
  browserStore,
  bucketOf,
  buildView,
  crossStrategy,
  effectiveLocked,
  effectiveVisible,
  generateMinutes,
  groupNodes,
  marketIsOpen,
  memoryStore,
  parseLayout,
  parsePeriod,
  parseUtc,
  renameNode,
  reorderNode,
  replaceStudySettings,
  runBacktest,
  sampleSpec,
  setLocked,
  setPeriod,
  setVisible,
  smaIndicator,
  starterLayout,
  stringifyLayout,
  syncCursors,
  deleteNode,
  windowAt,
} from "../src/index.ts";
import { formatUtc } from "../src/time.ts";
import type { MinuteBar } from "../src/types.ts";

const spec = sampleSpec();

function minute(open: string, openPrice: string, high: string, low: string, close: string, volume = "1"): MinuteBar {
  const closeTime = formatUtc(parseUtc(open) + 60_000);
  return { openTime: open, closeTime, open: openPrice, high, low, close, volume };
}

function flat(open: string, price: string): MinuteBar {
  return minute(open, price, price, price, price);
}

test("parses 7m, 2h, and 3D", () => {
  assert.deepEqual(parsePeriod("7m"), { source: "7m", span: 7, unit: "m" });
  assert.deepEqual(parsePeriod("2h"), { source: "2h", span: 2, unit: "h" });
  assert.deepEqual(parsePeriod("3D"), { source: "3D", span: 3, unit: "D" });
  assert.throws(() => parsePeriod("7M"), WorkspaceError);
  assert.throws(() => parsePeriod("07m"), WorkspaceError);
});

test("15-minute bar stays open until its close", () => {
  const minutes: MinuteBar[] = [];
  for (let step = 0; step < 15; step += 1) {
    const open = formatUtc(Date.parse("2024-06-02T21:00:00Z") + step * 60_000);
    minutes.push(minute(open, "1.10000", "1.10020", "1.09990", "1.10010", "2"));
  }
  const hidden = windowAt({ spec, bars: minutes }, "2024-06-02T21:14:00Z", "15m");
  assert.equal(hidden.bars.length, 0);
  assert.equal(hidden.forming?.openTime, "2024-06-02T21:00:00Z");
  const closed = windowAt({ spec, bars: minutes }, "2024-06-02T21:15:00Z", "15m");
  assert.equal(closed.bars.length, 1);
  assert.equal(closed.bars[0]?.closeTime, "2024-06-02T21:15:00Z");
  assert.equal(closed.bars[0]?.open, "1.10000");
  assert.equal(closed.bars[0]?.close, "1.10010");
  assert.equal(closed.bars[0]?.high, "1.10020");
  assert.equal(closed.bars[0]?.low, "1.09990");
  assert.equal(closed.bars[0]?.volume, "30");
  assert.equal(closed.forming, null);
});

test("7-minute buckets line up on the market open", () => {
  const minutes = [flat("2024-06-02T21:00:00Z", "1.10000"), flat("2024-06-02T21:06:00Z", "1.10010")];
  const early = windowAt({ spec, bars: minutes }, "2024-06-02T21:06:00Z", "7m");
  assert.equal(early.bars.length, 0);
  const closed = windowAt({ spec, bars: minutes }, "2024-06-02T21:07:00Z", "7m");
  assert.equal(closed.bars.length, 1);
  assert.equal(closed.bars[0]?.openTime, "2024-06-02T21:00:00Z");
  assert.equal(closed.bars[0]?.closeTime, "2024-06-02T21:07:00Z");
  assert.equal(closed.bars[0]?.open, "1.10000");
  assert.equal(closed.bars[0]?.close, "1.10010");
});

test("the last 7-minute bucket of a session day is the leftover five minutes", () => {
  const bucket = bucketOf(Date.parse("2024-06-03T20:55:00Z"), parsePeriod("7m"), spec);
  assert.equal(formatUtc(bucket.open), "2024-06-03T20:55:00Z");
  assert.equal(formatUtc(bucket.close), "2024-06-03T21:00:00Z");
});

test("2-hour bars close two real hours after the market open", () => {
  const open = bucketOf(Date.parse("2024-06-02T21:00:00Z"), parsePeriod("2h"), spec);
  assert.equal(formatUtc(open.open), "2024-06-02T21:00:00Z");
  assert.equal(formatUtc(open.close), "2024-06-02T23:00:00Z");
  const minutes = [flat("2024-06-02T22:59:00Z", "1.20000")];
  const hidden = windowAt({ spec, bars: minutes }, "2024-06-02T22:59:00Z", "2h");
  assert.equal(hidden.bars.length, 0);
  const shown = windowAt({ spec, bars: minutes }, "2024-06-02T23:00:00Z", "2h");
  assert.equal(shown.bars[0]?.closeTime, "2024-06-02T23:00:00Z");
});

test("a 2-hour bar across the spring-forward gap waits two real hours", () => {
  const bucket = bucketOf(Date.parse("2024-03-10T06:00:00Z"), parsePeriod("2h"), spec);
  assert.equal(formatUtc(bucket.open), "2024-03-10T06:00:00Z");
  assert.equal(formatUtc(bucket.close), "2024-03-10T08:00:00Z");
});

test("3D covers three session days and stays open until the third market open", () => {
  const bucket = bucketOf(Date.parse("2024-06-02T21:00:00Z"), parsePeriod("3D"), spec);
  assert.equal(bucket.close - bucket.open > 0, true);
  const openCivil = formatUtc(bucket.open);
  const closeCivil = formatUtc(bucket.close);
  assert.match(openCivil, /T21:00:00Z$/);
  assert.match(closeCivil, /T21:00:00Z$/);
  const minutes = [flat("2024-06-02T21:00:00Z", "1.10000")];
  const hidden = windowAt({ spec, bars: minutes }, formatUtc(bucket.close - 1000), "3D");
  assert.equal(hidden.bars.length, 0);
  const shown = windowAt({ spec, bars: minutes }, formatUtc(bucket.close), "3D");
  assert.equal(shown.bars.length, 1);
  assert.equal(shown.bars[0]?.openTime, formatUtc(bucket.open));
  assert.equal(shown.bars[0]?.closeTime, formatUtc(bucket.close));
  assert.equal(shown.bars[0]?.close, "1.10000");
});

test("four-hour closes follow the sample clock", () => {
  const first = bucketOf(Date.parse("2024-06-02T21:00:00Z"), parsePeriod("4h"), spec);
  const second = bucketOf(Date.parse("2024-06-03T01:00:00Z"), parsePeriod("4h"), spec);
  assert.equal(formatUtc(first.close), "2024-06-03T01:00:00Z");
  assert.equal(formatUtc(second.close), "2024-06-03T05:00:00Z");
});

test("object tree shows, hides, locks, reorders, groups, renames, and deletes", () => {
  let layout = starterLayout();
  layout = setVisible(layout, "sma", false);
  assert.equal(effectiveVisible(layout, "sma"), false);
  layout = setVisible(layout, "sma", true);
  layout = setLocked(layout, "level", true);
  assert.equal(effectiveLocked(layout, "level"), true);
  assert.throws(() => renameNode(layout, "level", "Pinned"), (error: unknown) => {
    return error instanceof WorkspaceError && error.code === "locked";
  });
  layout = setLocked(layout, "level", false);
  layout = renameNode(layout, "sma", "Average");
  assert.equal(layout.tree.find((node) => node.id === "sma")?.name, "Average");
  layout = reorderNode(layout, "sma", 1);
  const priceChildren = layout.tree
    .filter((node) => node.parentId === "price")
    .sort((left, right) => left.index - right.index)
    .map((node) => node.id);
  assert.deepEqual(priceChildren, ["level", "sma"]);
  layout = groupNodes(layout, ["level", "sma"], { id: "marks", name: "Marks" });
  assert.equal(layout.tree.find((node) => node.id === "marks")?.kind, "group");
  assert.equal(effectiveVisible(setVisible(layout, "marks", false), "sma"), false);
  layout = setLocked(layout, "sma", true);
  assert.throws(() => deleteNode(layout, "marks"), (error: unknown) => {
    return error instanceof WorkspaceError && error.code === "locked";
  });
  layout = setLocked(layout, "sma", false);
  layout = deleteNode(layout, "marks");
  assert.equal(layout.tree.some((node) => node.id === "sma"), false);
  assert.equal(layout.panes[0]?.studies.length, 0);
  assert.equal(layout.drawings.length, 0);
  layout = deleteNode(layout, "extra");
  assert.equal(layout.panes.length, 1);
  assert.throws(() => deleteNode(layout, "price"), WorkspaceError);
});

test("saved layouts round-trip and load returns a copy", () => {
  const book = new LayoutBook(memoryStore());
  const layout = starterLayout();
  book.save(layout);
  const loaded = book.load("Desk");
  loaded.period = "7m";
  assert.equal(book.load("Desk").period, "2h");
  assert.equal(parseLayout(stringifyLayout(layout)).name, "Desk");
  const storage = fakeStorage();
  const local = new LayoutBook(browserStore(storage));
  local.save(layout);
  assert.equal(local.list().join(","), "Desk");
  assert.equal(storage.getItem("flowchart.layout.Desk")?.includes("flowchart.layout"), true);
});

test("indicator settings and the strategy backtest hook see only closed bars", () => {
  const hooks = new HookRegistry();
  hooks.registerIndicator(smaIndicator);
  hooks.registerStrategy(crossStrategy);
  assert.throws(() => hooks.registerIndicator(smaIndicator), WorkspaceError);
  const minutes = Array.from({ length: 8 }, (_, index) =>
    flat(formatUtc(Date.parse("2024-06-02T21:00:00Z") + index * 60_000), index % 2 === 0 ? "1.10000" : "1.20000"),
  );
  const sealed = windowAt({ spec, bars: minutes }, "2024-06-02T21:08:00Z", "1m");
  const oneMinute = setPeriod(starterLayout(), "1m");
  const view = buildView({ spec, bars: minutes }, "2024-06-02T21:08:00Z", oneMinute, hooks);
  const study = view.panes[0]?.studies[0];
  assert.equal(study?.plots.sma.length, sealed.bars.length);
  assert.equal(study?.plots.sma[4] === null, false);
  const changed = replaceStudySettings(oneMinute, "sma", { period: 3 });
  const again = buildView({ spec, bars: minutes }, "2024-06-02T21:08:00Z", changed, hooks);
  assert.equal(again.panes[0]?.studies[0]?.plots.sma[2] === null, false);
  const result = runBacktest(crossStrategy, sealed, { period: 3, lots: 1 });
  assert.equal(result.summary.tradeCount, result.trades.length);
  const leaked = { ...sealed, bars: [...sealed.bars, { ...sealed.bars[0]!, closeTime: "2024-06-02T22:00:00Z" }] };
  assert.throws(() => runBacktest(crossStrategy, leaked, { period: 3, lots: 1 }), (error: unknown) => {
    return error instanceof WorkspaceError && error.code === "window_leak";
  });
});

test("crosshair sync writes one time, and a private cursor does not", () => {
  const records = [
    { paneId: "price", time: null },
    { paneId: "extra", time: "2024-06-02T21:00:00Z" },
  ];
  const synced = syncCursors(records, "2024-06-02T22:00:00Z", true, "price");
  assert.deepEqual(
    synced.map((record) => record.time),
    ["2024-06-02T22:00:00Z", "2024-06-02T22:00:00Z"],
  );
  const alone = syncCursors(records, "2024-06-02T22:00:00Z", false, "price");
  assert.equal(alone[0]?.time, "2024-06-02T22:00:00Z");
  assert.equal(alone[1]?.time, "2024-06-02T21:00:00Z");
});

test("the synthetic tape stays inside the market week", () => {
  const bars = generateMinutes(spec, "2024-06-02T21:00:00Z", "2024-06-04T21:00:00Z", 20240602);
  assert.equal(bars[0]?.openTime, "2024-06-02T21:00:00Z");
  assert.equal(bars.every((bar) => marketIsOpen(parseUtc(bar.openTime), spec)), true);
  assert.equal(bars.some((bar) => bar.openTime.startsWith("2024-06-02T20")), false);
  const saturday = Date.parse("2024-06-08T16:00:00Z");
  assert.equal(marketIsOpen(saturday, spec), false);
});

test("layout text rejects a numeric price", () => {
  const text = stringifyLayout(starterLayout()).replace('"1.08500"', "1.085");
  assert.throws(() => parseLayout(text), WorkspaceError);
});

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}
