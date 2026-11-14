// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import test from "node:test"
import { complete } from "../src/index.ts"
import { caret } from "./support/helpers.ts"

function labels(source: string): string[] {
  const { text, offset } = caret(source)
  return complete(text, offset).map((item) => item.label)
}

test("a partial function name suggests the moving-average builtin", () => {
  const source = "script demo\ndef fast_ma = sm|"
  const { text, offset } = caret(source)
  const items = complete(text, offset)
  assert.deepEqual(
    items.map((item) => item.label),
    ["sma"],
  )
  assert.equal(text.slice(items[0]!.start, items[0]!.end), "sm")
  assert.equal(items[0]!.kind, "builtin")
})

test("the script body suggests statements", () => {
  assert.deepEqual(labels("script demo\n|"), ["def", "draw", "end", "on", "param"])
})

test("an on block suggests actions", () => {
  assert.deepEqual(labels("script demo\non close > open\n|"), ["end", "flat", "long", "notify", "short"])
})

test("names in scope are suggested and the definition being typed is not", () => {
  const found = labels(`
script demo
param length = 5
def fast_ma = sma(close, length)
def slow_ma = |
`)
  assert.ok(found.includes("length"))
  assert.ok(found.includes("fast_ma"))
  assert.ok(found.includes("close"))
  assert.ok(found.includes("sma"))
  assert.equal(found.includes("slow_ma"), false)
  assert.equal(found.includes("long"), false)
})

test("draw suggests label after a finished value", () => {
  assert.deepEqual(labels("script demo\ndraw close lab|"), ["label"])
})

test("the top of a file suggests script", () => {
  assert.deepEqual(labels("|"), ["script"])
})

test("text and comments do not suggest", () => {
  assert.deepEqual(labels('script demo\non close > open\nnotify "sm|'), [])
  assert.deepEqual(labels("script demo\n// sm|\nparam length = 1\nend\n"), [])
})

test("a call argument suggests sources and earlier names", () => {
  const found = labels("script demo\nparam length = 5\ndef fast_ma = sma(|")
  assert.ok(found.includes("close"))
  assert.ok(found.includes("length"))
  assert.equal(found[0], "bar_index")
})

test("text after the caret does not change the suggestion", () => {
  assert.deepEqual(labels("script demo\ndef fast_ma = sm|a(close, 1)\nend\n"), ["sma"])
})
