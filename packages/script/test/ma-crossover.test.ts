// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { run, type AlertEvent, type Bar, type OrderIntent } from "../src/index.ts"
import { barsFromCloses } from "./support/helpers.ts"

const source = readFileSync(new URL("../examples/ma-cross.flow", import.meta.url), "utf8")

// Closes chosen so sma(close, 2) crosses sma(close, 4) up on bar 5 and down on bar 9.
const closes = [1, 1, 1, 1, 1, 2, 3, 4, 1, 1]

test("moving-average crossover emits a long, a short, plots, and alerts", () => {
  const orders: OrderIntent[] = []
  const alerts: AlertEvent[] = []
  const seenBars: Bar[] = []
  const result = run(source, barsFromCloses(closes), {
    params: { fast: 2, slow: 4, size: 1 },
    backtest: {
      onOrder(order, bar) {
        orders.push(order)
        seenBars.push(bar)
      },
    },
    alert: {
      onAlert(alert) {
        alerts.push(alert)
      },
    },
  })

  assert.equal(result.name, "ma_cross")
  assert.deepEqual(
    result.orders.map((order) => ({ barIndex: order.barIndex, side: order.side, lots: order.lots })),
    [
      { barIndex: 5, side: "long", lots: 1 },
      { barIndex: 9, side: "short", lots: 1 },
    ],
  )
  assert.deepEqual(
    result.alerts.map((alert) => ({ barIndex: alert.barIndex, message: alert.message })),
    [
      { barIndex: 5, message: "fast crossed above slow" },
      { barIndex: 9, message: "fast crossed below slow" },
    ],
  )
  assert.deepEqual(orders, result.orders)
  assert.deepEqual(alerts, result.alerts)
  assert.equal(seenBars[0]?.close, 2)
  assert.equal(seenBars[1]?.close, 1)

  const fast = result.plots.find((plot) => plot.label === "Fast")
  const slow = result.plots.find((plot) => plot.label === "Slow")
  assert.ok(fast && slow)
  assert.equal(fast.values[0], null)
  assert.equal(slow.values[0], null)
  assert.equal(fast.values[5], 1.5)
  assert.equal(slow.values[5], 1.25)
  assert.equal(fast.values[8], 2.5)
  assert.equal(slow.values[8], 2.5)
  assert.equal(fast.values[9], 1)
  assert.equal(slow.values[9], 2.25)

  assert.deepEqual(
    result.fills.map((fill) => ({ barIndex: fill.barIndex, side: fill.side, lots: fill.lots, price: fill.price })),
    [
      { barIndex: 5, side: "long", lots: 1, price: 2 },
      { barIndex: 9, side: "short", lots: 1, price: 1 },
    ],
  )
  assert.deepEqual(result.position, { side: "short", lots: 1, averagePrice: 1 })
})

test("the sample windows stay quiet until both averages exist", () => {
  const result = run(source, barsFromCloses(closes))
  assert.equal(result.orders.length, 0)
  assert.equal(result.alerts.length, 0)
  assert.equal(result.position.side, "flat")
  const fast = result.plots.find((plot) => plot.label === "Fast")
  const slow = result.plots.find((plot) => plot.label === "Slow")
  assert.ok(fast && slow)
  assert.deepEqual(fast.values.slice(0, 9), Array(9).fill(null))
  assert.equal(fast.values[9], 1.6)
  assert.ok(slow.values.every((value) => value === null))
})

test("earlier bars do not change when later bars arrive", () => {
  const bars = barsFromCloses(closes)
  const full = run(source, bars, { params: { fast: 2, slow: 4 } })
  const prefix = run(source, bars.slice(0, 6), { params: { fast: 2, slow: 4 } })
  assert.deepEqual(
    prefix.plots.map((plot) => plot.values),
    full.plots.map((plot) => plot.values.slice(0, 6)),
  )
  assert.deepEqual(prefix.orders, [full.orders[0]])
  assert.equal(prefix.position.side, "long")
})
