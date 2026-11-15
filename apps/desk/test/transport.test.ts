// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { jumpTransport, keyTransport, openTransport, stepTransport } from "../src/transport.ts";

const first = Date.parse("2024-06-03T07:00:00Z");
const last = Date.parse("2024-06-03T08:00:00Z");

function session(cursor = first) {
  return openTransport({
    symbol: "EURUSD",
    firstClose: first,
    lastClose: last,
    cursor,
    timeframe: "5m",
    speed: 2,
    timeZone: "America/New_York",
  });
}

test("a step lands on the next trading close and stops at the tape", () => {
  const book = session(first + 3 * 60_000);
  assert.equal(stepTransport(book, 1), true);
  assert.equal(book.clock.cursor, first + 5 * 60_000);
  assert.equal(book.clock.status, "paused");

  const end = session(last);
  assert.equal(stepTransport(end, 1), false);
  assert.equal(end.clock.cursor, last);
});

test("space and arrows go through the replay key", () => {
  const book = session();
  const played = keyTransport(book, { key: " ", code: "Space" });
  assert.equal(played.command, "play");
  assert.equal(book.clock.status, "playing");
  const stepped = keyTransport(book, { key: "ArrowRight" });
  assert.equal(stepped.command, "step");
  assert.equal(book.clock.cursor, first + 5 * 60_000);
  const paused = keyTransport(book, { key: " " });
  assert.equal(paused.command, "pause");
  assert.equal(book.clock.status, "paused");
});

test("the next session open is inside the tape", () => {
  const book = openTransport({
    symbol: "EURUSD",
    firstClose: first,
    lastClose: Date.parse("2024-06-03T16:00:00Z"),
    cursor: first,
    timeframe: "5m",
    speed: 1,
    timeZone: "America/New_York",
  });
  const name = jumpTransport(book);
  assert.equal(name, "London");
  assert.ok(book.clock.cursor > first);
  assert.ok(book.clock.cursor <= Date.parse("2024-06-03T16:00:00Z"));
});
