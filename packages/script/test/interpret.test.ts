// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import test from "node:test"
import { ScriptError, parse, run } from "../src/index.ts"
import { barsFromCloses } from "./support/helpers.ts"

const one = barsFromCloses([1, 2, 3, 4, 6])

test("ema seeds with a simple average and then smooths", () => {
  const result = run(
    `
script ema_check
def line = ema(close, 3)
draw line label "Ema"
end
`,
    one,
  )
  assert.deepEqual(result.plots[0]!.values, [null, null, 2, 3, 4.5])
})

test("highest and lowest read only the rolling window", () => {
  const result = run(
    `
script range
def hi = highest(close, 3)
def lo = lowest(close, 3)
draw hi label "Hi"
draw lo label "Lo"
end
`,
    barsFromCloses([1, 5, 2, 4]),
  )
  assert.deepEqual(result.plots[0]!.values, [null, null, 5, 5])
  assert.deepEqual(result.plots[1]!.values, [null, null, 1, 2])
})

test("shift reads an earlier bar and rejects a later one", () => {
  const result = run(
    `
script lagged
def prev = shift(close, 1)
draw prev label "Prev"
end
`,
    barsFromCloses([4, 7, 9]),
  )
  assert.deepEqual(result.plots[0]!.values, [null, 4, 7])
  assert.throws(
    () =>
      run(
        `
script future
def next = shift(close, -1)
draw next label "Next"
end
`,
        barsFromCloses([1, 2]),
      ),
    (error: unknown) => error instanceof ScriptError && /later bar/.test(error.message),
  )
})

test("a warmup cross does not fire", () => {
  const result = run(
    `
script quiet
on crosses_above(sma(close, 3), 0)
  long 1
end
end
`,
    barsFromCloses([1, 1, 1, 1]),
  )
  assert.equal(result.orders.length, 0)
})

test("flat closes the position and a repeated long does not add", () => {
  const result = run(
    `
script book
on bar_index == 0
  long 2
end
on bar_index == 1
  long 2
end
on bar_index == 2
  flat
  notify "closed"
end
end
`,
    barsFromCloses([10, 11, 12]),
  )
  assert.equal(result.orders.length, 3)
  assert.deepEqual(
    result.fills.map((fill) => fill.side),
    ["long", "flat"],
  )
  assert.equal(result.fills[0]!.price, 10)
  assert.equal(result.fills[1]!.lots, 2)
  assert.equal(result.fills[1]!.price, 12)
  assert.deepEqual(result.position, { side: "flat", lots: 0, averagePrice: null })
  assert.equal(result.alerts[0]!.message, "closed")
})

test("and, or, and not gate the action", () => {
  const result = run(
    `
script logic
on close > 1 and close < 3
  long 1
end
on not (close > 2)
  short 1
end
end
`,
    barsFromCloses([1, 2, 4]),
  )
  assert.deepEqual(
    result.orders.map((order) => ({ barIndex: order.barIndex, side: order.side })),
    [
      { barIndex: 0, side: "short" },
      { barIndex: 1, side: "long" },
      { barIndex: 1, side: "short" },
    ],
  )
  assert.equal(result.position.side, "short")
})

test("param overrides replace the declared number", () => {
  const source = `
script sized
param lots = 1
on true
  long lots
end
end
`
  const result = run(source, barsFromCloses([5]), { params: { lots: 2 } })
  assert.equal(result.orders[0]!.lots, 2)
  assert.throws(() => run(source, barsFromCloses([5]), { params: { lots: "2" } }), ScriptError)
  assert.throws(() => run(source, barsFromCloses([5]), { params: { missing: 1 } }), ScriptError)
})

test("division by zero is null and a bad condition is an error", () => {
  const result = run(
    `
script divide
def q = 1 / 0
draw q label "Q"
end
`,
    barsFromCloses([1]),
  )
  assert.deepEqual(result.plots[0]!.values, [null])
  assert.throws(
    () =>
      run(
        `
script bad
on close
  long 1
end
end
`,
        barsFromCloses([1]),
      ),
    ScriptError,
  )
})

test("parse errors name the line", () => {
  assert.throws(
    () => parse("script demo\ndef close = 1\nend\n"),
    (error: unknown) => error instanceof ScriptError && error.line === 2 && /reserved/.test(error.message),
  )
  assert.throws(
    () => parse("script demo\ndef x = 1\ndef x = 2\nend\n"),
    (error: unknown) => error instanceof ScriptError && /already defined/.test(error.message),
  )
  assert.throws(() => parse("script demo\ndef x = 1\n"), (error: unknown) => error instanceof ScriptError && /end/.test(error.message))
})

test("hl2 uses the high and the low", () => {
  const result = run(
    `
script mid
def mid = hl2
draw mid label "Mid"
end
`,
    [{ open: 1, high: 4, low: 2, close: 3, volume: 8 }],
  )
  assert.deepEqual(result.plots[0]!.values, [3])
})

test("a prefix of the tape matches the full run", () => {
  const bars = barsFromCloses([1, 3, 2, 5, 4])
  const source = `
script causal
def prev = shift(close, 1)
draw prev label "Prev"
on crosses_above(close, prev)
  long 1
end
end
`
  const full = run(source, bars)
  const prefix = run(source, bars.slice(0, 3))
  assert.deepEqual(prefix.plots[0]!.values, full.plots[0]!.values.slice(0, 3))
  assert.deepEqual(prefix.orders, full.orders.filter((order) => order.barIndex < 3))
})
