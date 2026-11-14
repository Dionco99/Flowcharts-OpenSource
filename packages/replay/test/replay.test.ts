// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReplayError, ReplaySession, applyReplayKey, closedBarTime } from "../src/index";

const MINUTE = 60_000;
const FIRST = Date.parse("2024-06-02T00:00:00.000Z");
const LAST = Date.parse("2024-06-10T22:00:00.000Z");

function session(cursor = FIRST, timeframeMinutes = 15) {
  return new ReplaySession({
    symbol: "EURUSD",
    tape: { firstClose: FIRST, lastClose: LAST },
    timeframeMinutes,
    cursor,
    timeZone: "UTC",
  });
}

function codeOf(run: () => void): string {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof ReplayError);
    return error.code;
  }
  assert.fail("expected ReplayError");
}

describe("transport", () => {
  it("starts paused and reveals bars at the selected speed", () => {
    const desk = session();
    assert.equal(desk.clock.status, "paused");
    assert.equal(desk.clock.speed, 1);
    desk.clock.play();
    assert.equal(desk.clock.status, "playing");
    assert.equal(desk.clock.advance(999), 0);
    assert.equal(desk.clock.cursor, FIRST);
    assert.equal(desk.clock.advance(1), 1);
    assert.equal(desk.clock.cursor, FIRST + 15 * MINUTE);

    desk.clock.setSpeed(2);
    assert.equal(desk.clock.advance(1000), 2);
    assert.equal(desk.clock.cursor, FIRST + 45 * MINUTE);

    desk.clock.pause();
    assert.equal(desk.clock.status, "paused");
    assert.equal(desk.clock.advance(5_000), 0);
    assert.equal(desk.clock.cursor, FIRST + 45 * MINUTE);
  });

  it("keeps banked wall time when the speed changes", () => {
    const desk = session(FIRST, 1);
    desk.clock.play();
    assert.equal(desk.clock.advance(500), 0);
    desk.clock.setSpeed(2);
    assert.equal(desk.clock.advance(0), 1);
    assert.equal(desk.clock.cursor, FIRST + MINUTE);
  });

  it("rejects a speed that is not a positive finite number and leaves the old speed", () => {
    const desk = session();
    for (const speed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(codeOf(() => desk.clock.setSpeed(speed)), "bad_speed");
    }
    assert.equal(desk.clock.speed, 1);
  });

  it("pauses when playback reaches the last bar the tape can reveal", () => {
    const desk = session(LAST - 15 * MINUTE, 15);
    desk.clock.play();
    assert.equal(desk.clock.advance(5_000), 1);
    assert.equal(desk.clock.cursor, LAST);
    assert.equal(desk.clock.status, "paused");
    desk.clock.play();
    assert.equal(desk.clock.status, "paused");
  });
});

describe("step", () => {
  it("moves one bar of the trading timeframe, not one minute", () => {
    const desk = session(FIRST, 15);
    assert.equal(desk.clock.step(1), FIRST + 15 * MINUTE);
    assert.equal(closedBarTime(desk.clock.cursor, 15, desk.clock.tape), FIRST + 15 * MINUTE);
    assert.equal(desk.clock.step(-1), FIRST);
    assert.equal(codeOf(() => desk.clock.step(-1)), "tape_started");
    assert.equal(desk.clock.cursor, FIRST);
  });

  it("does not move past the last close in the tape", () => {
    const desk = session(LAST, 15);
    assert.equal(codeOf(() => desk.clock.step(1)), "tape_ended");
    assert.equal(desk.clock.cursor, LAST);
  });

  it("lands on the upcoming close when the cursor is mid-bar", () => {
    const desk = session(FIRST + 7 * MINUTE, 15);
    assert.equal(closedBarTime(desk.clock.cursor, 15, desk.clock.tape), FIRST);
    assert.equal(desk.clock.step(), FIRST + 15 * MINUTE);
  });
});

describe("seek", () => {
  it("jumps to a timestamp inside the tape and refuses one outside it", () => {
    const desk = session();
    desk.clock.step();
    const target = Date.parse("2024-06-03T09:07:00.000Z");
    assert.equal(desk.clock.seek(target), target);
    assert.equal(codeOf(() => desk.clock.seek(FIRST - MINUTE)), "outside_tape");
    assert.equal(codeOf(() => desk.clock.seek(LAST + MINUTE)), "outside_tape");
    assert.equal(desk.clock.cursor, target);
    assert.equal(desk.clock.seek(FIRST), FIRST);
    assert.equal(desk.clock.seek(LAST), LAST);
  });
});

describe("next session", () => {
  it("jumps to the next Asia, London, or New York open in the viewer zone", () => {
    const monday = session(Date.parse("2024-06-03T07:00:00.000Z"));
    assert.deepEqual(monday.clock.nextSession(), {
      cursor: Date.parse("2024-06-03T08:00:00.000Z"),
      name: "London",
    });
    assert.deepEqual(monday.clock.nextSession(), {
      cursor: Date.parse("2024-06-03T13:00:00.000Z"),
      name: "New York",
    });

    const atAsia = session(Date.parse("2024-06-03T00:00:00.000Z"));
    assert.equal(atAsia.clock.nextSession().name, "London");

    const friday = session(Date.parse("2024-06-07T13:00:00.000Z"));
    assert.deepEqual(friday.clock.nextSession(), {
      cursor: Date.parse("2024-06-10T00:00:00.000Z"),
      name: "Asia",
    });
  });

  it("uses the viewer's timezone across a daylight-saving change", () => {
    const tape = {
      firstClose: Date.parse("2026-03-01T00:00:00.000Z"),
      lastClose: Date.parse("2026-03-20T00:00:00.000Z"),
    };
    const before = new ReplaySession({
      symbol: "EURUSD",
      tape,
      timeZone: "America/New_York",
      sessions: [{ name: "New York", openMinute: 9 * 60 + 30 }],
      cursor: Date.parse("2026-03-06T14:00:00.000Z"),
    });
    assert.equal(before.clock.nextSession().cursor, Date.parse("2026-03-06T14:30:00.000Z"));

    const after = new ReplaySession({
      symbol: "EURUSD",
      tape,
      timeZone: "America/New_York",
      sessions: [{ name: "New York", openMinute: 9 * 60 + 30 }],
      cursor: Date.parse("2026-03-09T13:00:00.000Z"),
    });
    assert.equal(after.clock.nextSession().cursor, Date.parse("2026-03-09T13:30:00.000Z"));
  });

  it("leaves the cursor when the next open is past the tape", () => {
    const cursor = Date.parse("2024-06-07T21:00:00.000Z");
    const desk = new ReplaySession({
      symbol: "EURUSD",
      tape: { firstClose: FIRST, lastClose: Date.parse("2024-06-07T22:00:00.000Z") },
      cursor,
      timeZone: "UTC",
    });
    assert.equal(codeOf(() => desk.clock.nextSession()), "no_session");
    assert.equal(desk.clock.cursor, cursor);
  });
});

describe("keys", () => {
  it("steps on ArrowRight and pauses on Space", () => {
    const desk = session(FIRST, 1);
    const stepped = applyReplayKey(desk.clock, { key: "ArrowRight" });
    assert.equal(stepped.command, "step");
    assert.equal(desk.clock.cursor, FIRST + MINUTE);

    desk.clock.play();
    const paused = applyReplayKey(desk.clock, { key: " ", code: "Space" });
    assert.equal(paused.command, "pause");
    assert.equal(desk.clock.status, "paused");
    assert.equal(desk.clock.advance(2_000), 0);

    const played = applyReplayKey(desk.clock, { code: "Space", key: " " });
    assert.equal(played.command, "play");
    assert.equal(desk.clock.status, "playing");
  });

  it("ignores a repeated Space and a modified arrow", () => {
    const desk = session();
    desk.clock.play();
    const held = applyReplayKey(desk.clock, { key: " ", repeat: true });
    assert.equal(held.handled, false);
    assert.equal(desk.clock.status, "playing");
    const chord = applyReplayKey(desk.clock, { key: "ArrowRight", ctrlKey: true });
    assert.equal(chord.handled, false);
    assert.equal(desk.clock.cursor, FIRST);
  });

  it("reports the tape end without moving the cursor", () => {
    const desk = session(LAST, 1);
    const result = applyReplayKey(desk.clock, { key: "ArrowRight" });
    assert.deepEqual(result, { handled: true, command: "step", ok: false, code: "tape_ended" });
    assert.equal(desk.clock.cursor, LAST);
  });
});

describe("restore", () => {
  it("reopens on the same candle with the same drawings and working orders", () => {
    const desk = session(FIRST, 15);
    desk.clock.setSpeed(4);
    desk.clock.play();
    desk.clock.advance(1000);
    desk.clock.seek(Date.parse("2024-06-03T10:07:00.000Z"));
    desk.setDrawings([
      { id: "level-1", kind: "level", price: "1.0850", locked: true },
      { id: "segment-1", kind: "segment", points: [{ time: FIRST, price: "1.0800" }] },
    ]);
    desk.setWorkingOrders([
      {
        id: "ord-1",
        clientOrderId: "limit-1",
        side: "buy",
        type: "limit",
        lots: "0.50",
        limitPrice: "1.0820",
        stopLoss: "1.0800",
        takeProfit: "1.0900",
      },
    ]);
    desk.setFills([{ id: "fill-1", time: FIRST, lots: "0.10", price: "1.0840", side: "buy" }]);
    const saved = JSON.parse(JSON.stringify(desk.exportDocument())) as ReturnType<ReplaySession["exportDocument"]>;
    const candle = closedBarTime(saved.cursor, saved.timeframeMinutes, desk.clock.tape);

    const reopened = session();
    reopened.clock.seek(LAST);
    reopened.setDrawings([{ id: "other", kind: "level" }]);
    reopened.loadDocument(saved);

    assert.equal(reopened.clock.status, "paused");
    assert.equal(reopened.clock.cursor, saved.cursor);
    assert.equal(closedBarTime(reopened.clock.cursor, reopened.clock.timeframeMinutes, reopened.clock.tape), candle);
    assert.equal(reopened.clock.speed, 4);
    assert.equal(reopened.clock.timeframeMinutes, 15);
    assert.deepEqual(reopened.drawings, saved.drawings);
    assert.deepEqual(reopened.workingOrders, saved.workingOrders);
    assert.deepEqual(reopened.fills, saved.fills);
    assert.equal(reopened.clock.advance(5_000), 0);
  });

  it("leaves the open session untouched when the file does not match", () => {
    const desk = session();
    desk.clock.seek(Date.parse("2024-06-03T09:00:00.000Z"));
    desk.setDrawings([{ id: "keep", kind: "level" }]);
    desk.setWorkingOrders([
      { id: "ord-1", clientOrderId: "keep-1", side: "sell", type: "stop", lots: "1", stopPrice: "1.0900" },
    ]);
    const intact = desk.exportDocument();

    assert.equal(codeOf(() => desk.loadDocument({ ...intact, version: 2 })), "session_version");
    assert.equal(codeOf(() => desk.loadDocument({ ...intact, symbol: "GBPUSD" })), "session_symbol");
    assert.equal(codeOf(() => desk.loadDocument({ ...intact, cursor: FIRST - MINUTE })), "session_cursor");
    assert.equal(codeOf(() => desk.loadDocument({ ...intact, timeZone: "Not/AZone" })), "bad_timezone");
    assert.equal(desk.clock.cursor, intact.cursor);
    assert.deepEqual(desk.drawings, intact.drawings);
    assert.deepEqual(desk.workingOrders, intact.workingOrders);
  });
});
