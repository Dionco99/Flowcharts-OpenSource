// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FlowchartError,
  PluginHost,
  definePlugin,
  type BrokerPort,
  type Window,
} from "../src/index.ts";

const spec = {
  symbol: "EURUSD",
  tickSize: "0.00001",
  lotSize: 100_000,
  timezone: "America/New_York",
  sessions: [
    { id: "london", name: "London", open: "03:00", close: "12:00" },
  ],
};

function windowAt(cursor: string, closes: readonly string[]): Window {
  return {
    spec,
    timeframe: "1m",
    cursor,
    bars: closes.map((closeTime) => ({
      openTime: new Date(Date.parse(closeTime) - 60_000).toISOString().replace(".000Z", "Z"),
      closeTime,
      open: "1.10000",
      high: "1.10010",
      low: "1.09990",
      close: "1.10000",
      volume: 1,
    })),
  };
}

test("the host runs an indicator and rejects a bar after the cursor", () => {
  const host = new PluginHost();
  host.register(
    definePlugin({
      id: "example.probe",
      name: "Probe",
      version: "1.0.0",
      apiVersion: 1,
      indicators: [
        {
          id: "example.probe.mid",
          name: "Mid",
          overlay: true,
          parameters: [{ key: "period", label: "Period", type: "integer", default: 1, min: 1, max: 3 }],
          plots: [{ key: "mid", title: "Mid", style: "line" }],
          calculate(input) {
            return { plots: { mid: input.window.bars.map((bar) => bar.close) } };
          },
        },
      ],
    }),
  );
  const cursor = "2026-01-15T08:01:00Z";
  const result = host.runIndicator("example.probe.mid", windowAt(cursor, [cursor]));
  assert.deepEqual(result.plots.mid, ["1.10000"]);
  assert.throws(
    () => host.runIndicator("example.probe.mid", windowAt(cursor, ["2026-01-15T08:02:00Z"])),
    (error: unknown) => error instanceof FlowchartError && error.code === "window_leak",
  );
  assert.throws(
    () => host.runIndicator("example.probe.mid", windowAt(cursor, [cursor]), { period: 9 }),
    (error: unknown) => error instanceof FlowchartError && error.code === "invalid_argument",
  );
});

test("a strategy is registered separately and places only through the port", async () => {
  const host = new PluginHost();
  const placed: string[] = [];
  host.register(
    definePlugin({
      id: "example.once",
      name: "Once",
      version: "1.0.0",
      apiVersion: 1,
      strategies: [
        {
          id: "example.once",
          name: "Once",
          async onBar({ broker }) {
            await Promise.resolve(
              broker.place({
                clientOrderId: "once",
                side: "buy",
                type: "market",
                lots: "1",
              }),
            );
          },
        },
      ],
    }),
  );
  const port: BrokerPort = {
    place(order) {
      placed.push(order.clientOrderId);
      return { ok: true };
    },
    modify() {
      return { ok: false };
    },
    cancel() {
      return { ok: false };
    },
    close() {
      return { ok: false };
    },
    modifyProtection() {
      return { ok: false };
    },
    snapshot() {
      return { orders: [] };
    },
  };
  await host.getStrategy("example.once").onBar({
    window: windowAt("2026-01-15T08:01:00Z", ["2026-01-15T08:01:00Z"]),
    broker: port,
  });
  assert.deepEqual(placed, ["once"]);
  host.unregister("example.once");
  assert.throws(
    () => host.getStrategy("example.once"),
    (error: unknown) => error instanceof FlowchartError && error.code === "unknown_plugin",
  );
});

test("a foreign API version is rejected", () => {
  assert.throws(
    () =>
      definePlugin({
        id: "example.other",
        name: "Other",
        version: "1.0.0",
        apiVersion: 2 as unknown as 1,
        indicators: [
          {
            id: "example.other",
            name: "Other",
            overlay: false,
            parameters: [],
            plots: [{ key: "value", title: "Value", style: "line" }],
            calculate: () => ({ plots: { value: [] } }),
          },
        ],
      }),
    (error: unknown) => error instanceof FlowchartError && error.code === "api_version",
  );
});
