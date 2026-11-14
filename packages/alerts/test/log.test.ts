// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { AlertLog, recordingPorts, type Rule } from "../src/index.ts";
import { bars } from "./helpers.ts";

const rule: Rule = {
  type: "cross",
  left: { kind: "price", source: "close" },
  right: { kind: "level", value: "2" },
  direction: "up",
};

test("the log arms, fires once, expires, and does not send twice", async () => {
  const recorded = recordingPorts();
  const log = new AlertLog(recorded.ports);
  const series = bars([{ close: "1" }, { close: "3" }, { close: "1" }, { close: "3" }]);
  log.arm({
    id: "cross",
    symbol: "EURUSD",
    name: "Cross",
    rule,
    armedAt: series[0].openTime,
    delivery: {
      webhook: { url: "https://example.com/flowchart/alerts" },
      email: { to: "desk@example.com" },
      push: { token: "device-1" },
      sound: { cue: "chime" },
    },
  });
  const first = await log.advance([{ symbol: "EURUSD", bars: series }], series[0].closeTime);
  assert.equal(first.length, 0);
  assert.equal(log.get("cross").status, "armed");
  const fired = await log.advance([{ symbol: "EURUSD", bars: series }], series[1].closeTime);
  assert.equal(fired.length, 1);
  assert.equal(log.get("cross").status, "fired");
  assert.equal(log.get("cross").price, "3");
  const kinds = recorded.outbox.map((item) => item.kind).sort();
  assert.deepEqual(kinds, ["email", "push", "sound", "webhook"]);
  assert.equal(recorded.outbox.find((item) => item.kind === "webhook")?.body.includes("EURUSD"), true);
  const again = await log.advance([{ symbol: "EURUSD", bars: series }], series[3].closeTime);
  assert.equal(again.length, 0);
  assert.equal(recorded.outbox.length, 4);

  const back = await log.advance([{ symbol: "EURUSD", bars: series }], series[0].closeTime);
  assert.equal(back.length, 0);
  assert.equal(log.get("cross").status, "armed");
  log.expire("cross", series[0].closeTime);
  const held = await log.advance([{ symbol: "EURUSD", bars: series }], series[3].closeTime);
  assert.equal(held.length, 0);
  assert.equal(log.get("cross").status, "expired");
  assert.equal(log.get("cross").held, true);
});

test("repeat alerts fire on every new edge", async () => {
  const log = new AlertLog();
  const series = bars([{ close: "1" }, { close: "3" }, { close: "1" }, { close: "3" }]);
  log.arm({
    id: "repeat",
    symbol: "EURUSD",
    name: "Repeat",
    rule,
    armedAt: series[0].openTime,
    once: false,
  });
  const fired = await log.advance([{ symbol: "EURUSD", bars: series }], series[3].closeTime);
  assert.deepEqual(fired.map((item) => item.event.cursor), [series[1].closeTime, series[3].closeTime]);
});

test("a saved log does not deliver the same fire again", async () => {
  const series = bars([{ close: "1" }, { close: "3" }]);
  const firstPorts = recordingPorts();
  const log = new AlertLog(firstPorts.ports);
  log.arm({
    id: "cross",
    symbol: "EURUSD",
    name: "Cross",
    rule,
    armedAt: series[0].openTime,
    delivery: { webhook: { url: "https://example.com/flowchart/alerts" } },
  });
  await log.advance([{ symbol: "EURUSD", bars: series }], series[1].closeTime);
  const restored = AlertLog.fromJSON(log.toJSON(), recordingPorts().ports);
  const again = await restored.advance([{ symbol: "EURUSD", bars: series }], series[1].closeTime);
  assert.equal(again.length, 0);
  assert.equal(restored.get("cross").status, "fired");
});

test("delivery recording does not call fetch", async () => {
  const recorded = recordingPorts();
  const log = new AlertLog(recorded.ports);
  const series = bars([{ close: "1" }, { close: "3" }]);
  log.arm({
    id: "cross",
    symbol: "EURUSD",
    name: "Cross",
    rule,
    armedAt: series[0].openTime,
    delivery: {
      webhook: { url: "https://example.com/flowchart/alerts" },
      email: { to: "desk@example.com" },
      push: { token: "device-1" },
    },
  });
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    called = true;
    throw new Error("network");
  };
  try {
    await log.advance([{ symbol: "EURUSD", bars: series }], series[1].closeTime);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(called, false);
  assert.equal(recorded.outbox.length, 3);
});
