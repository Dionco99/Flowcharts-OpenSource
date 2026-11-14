// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Expr, Program, Step } from "./ast.ts"
import { builtinArity, isBuiltin, isSource } from "./catalog.ts"
import { ScriptError } from "./errors.ts"
import { parse } from "./parser.ts"

export interface Bar {
  open: number
  high: number
  low: number
  close: number
  volume: number
  time?: string
}

export interface OrderIntent {
  barIndex: number
  time?: string
  side: "long" | "short" | "flat"
  lots: number
}

export interface AlertEvent {
  barIndex: number
  time?: string
  message: string
}

export interface Fill {
  barIndex: number
  time?: string
  side: "long" | "short" | "flat"
  lots: number
  price: number
}

export interface Position {
  side: "long" | "short" | "flat"
  lots: number
  averagePrice: number | null
}

export interface PlotSeries {
  label: string
  values: Array<number | null>
}

export interface RunResult {
  name: string
  plots: PlotSeries[]
  orders: OrderIntent[]
  alerts: AlertEvent[]
  fills: Fill[]
  position: Position
}

export interface BacktestHook {
  onOrder(order: OrderIntent, bar: Bar): void
}

export interface AlertHook {
  onAlert(alert: AlertEvent, bar: Bar): void
}

export interface RunOptions {
  /** Replaces declared params by name. The value must be the same kind as the declaration. */
  params?: Record<string, number | string | boolean>
  backtest?: BacktestHook
  alert?: AlertHook
}

type Value = number | boolean | string | null

interface Ctx {
  bars: Bar[]
  params: Map<string, number | string | boolean>
  defs: Map<string, Value[]>
  memo: Map<number, Map<number, Value>>
  active: Set<string>
}

export function run(source: string, bars: readonly Bar[], options: RunOptions = {}): RunResult {
  return runProgram(parse(source), bars, options)
}

export function runProgram(program: Program, bars: readonly Bar[], options: RunOptions = {}): RunResult {
  checkBars(bars)
  const params = resolveParams(program, options.params)
  const defs = new Map<string, Value[]>()
  const plots: PlotSeries[] = []
  for (const step of program.steps) {
    if (step.kind === "def") defs.set(step.decl.name, [])
    if (step.kind === "draw") plots.push({ label: step.decl.label, values: [] })
  }

  const ctx: Ctx = { bars: [...bars], params, defs, memo: new Map(), active: new Set() }
  const orders: OrderIntent[] = []
  const alerts: AlertEvent[] = []
  const fills: Fill[] = []
  let position: Position = { side: "flat", lots: 0, averagePrice: null }

  for (let index = 0; index < ctx.bars.length; index += 1) {
    const bar = ctx.bars[index]!
    let drawIndex = 0
    for (const step of program.steps) {
      if (step.kind === "def") {
        const value = evalExpr(step.decl.expr, index, ctx)
        defs.get(step.decl.name)!.push(value)
        continue
      }
      if (step.kind === "draw") {
        plots[drawIndex]!.values.push(expectPlot(evalExpr(step.decl.expr, index, ctx), step))
        drawIndex += 1
        continue
      }
      if (step.kind !== "on") continue
      const cond = evalExpr(step.decl.when, index, ctx)
      if (cond === null || cond === false) continue
      if (cond !== true) {
        throw new ScriptError("A condition expects true or false.", step.decl.when.line, step.decl.when.column)
      }
      for (const action of step.decl.actions) {
        if (action.type === "notify") {
          const message = evalExpr(action.message, index, ctx)
          if (typeof message !== "string") {
            throw new ScriptError("Notify expects text.", action.message.line, action.message.column)
          }
          const alert: AlertEvent = { ...stamp(index, bar), message }
          alerts.push(alert)
          options.alert?.onAlert(alert, bar)
          continue
        }
        const order: OrderIntent =
          action.type === "flat"
            ? { ...stamp(index, bar), side: "flat", lots: 0 }
            : { ...stamp(index, bar), side: action.type, lots: expectLots(evalExpr(action.lots, index, ctx), action.lots) }
        orders.push(order)
        options.backtest?.onOrder(order, bar)
        position = applyFill(order, bar, position, fills)
      }
    }
  }

  return { name: program.name, plots, orders, alerts, fills, position }
}

function resolveParams(
  program: Program,
  overrides: RunOptions["params"],
): Map<string, number | string | boolean> {
  const params = new Map<string, number | string | boolean>()
  for (const step of program.steps) {
    if (step.kind === "param") params.set(step.decl.name, step.decl.value)
  }
  for (const [name, value] of Object.entries(overrides ?? {})) {
    if (!params.has(name)) throw new ScriptError(`Unknown param '${name}'.`)
    const declared = params.get(name)!
    if (typeof declared !== typeof value) {
      throw new ScriptError(`Param '${name}' expects ${typeName(declared)}.`)
    }
    params.set(name, value)
  }
  return params
}

function checkBars(bars: readonly Bar[]): void {
  if (!Array.isArray(bars)) throw new ScriptError("Bars must be a list.")
  bars.forEach((bar, index) => {
    for (const key of ["open", "high", "low", "close", "volume"] as const) {
      const value = bar?.[key]
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ScriptError(`Bar ${index} has a bad ${key}.`)
      }
    }
  })
}

function applyFill(order: OrderIntent, bar: Bar, position: Position, fills: Fill[]): Position {
  if (order.side === "flat") {
    if (position.side === "flat") return position
    fills.push({ ...stamp(order.barIndex, bar), side: "flat", lots: position.lots, price: bar.close })
    return { side: "flat", lots: 0, averagePrice: null }
  }
  if (position.side === order.side && position.lots === order.lots) return position
  fills.push({ ...stamp(order.barIndex, bar), side: order.side, lots: order.lots, price: bar.close })
  return { side: order.side, lots: order.lots, averagePrice: bar.close }
}

function stamp(barIndex: number, bar: Bar): { barIndex: number; time?: string } {
  return bar.time === undefined ? { barIndex } : { barIndex, time: bar.time }
}

function expectPlot(value: Value, step: Step): number | null {
  if (value === null) return null
  if (typeof value === "number") return value
  const line = step.kind === "draw" ? step.decl.line : 1
  throw new ScriptError("Draw expects a number.", line, 1)
}

function expectLots(value: Value, expr: Expr): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ScriptError("Lots must be a positive number.", expr.line, expr.column)
  }
  return value
}

function evalExpr(expr: Expr, index: number, ctx: Ctx): Value {
  const row = memoRow(ctx, expr.id)
  const cached = row.get(index)
  if (cached !== undefined) return cached
  const key = `${expr.id}:${index}`
  if (ctx.active.has(key)) {
    throw new ScriptError("This value refers to its own current bar.", expr.line, expr.column)
  }
  ctx.active.add(key)
  try {
    const value = compute(expr, index, ctx)
    row.set(index, value)
    return value
  } finally {
    ctx.active.delete(key)
  }
}

function compute(expr: Expr, index: number, ctx: Ctx): Value {
  switch (expr.type) {
    case "number":
    case "string":
    case "bool":
      return expr.value
    case "name":
      return readName(expr.name, index, ctx, expr)
    case "unary":
      return evalUnary(expr, index, ctx)
    case "binary":
      return evalBinary(expr, index, ctx)
    case "call":
      return evalCall(expr, index, ctx)
    default:
      return assertNever(expr)
  }
}

function evalUnary(expr: Extract<Expr, { type: "unary" }>, index: number, ctx: Ctx): Value {
  const value = evalExpr(expr.arg, index, ctx)
  if (expr.op === "-") {
    if (value === null) return null
    if (typeof value !== "number") throw new ScriptError("Expected a number.", expr.line, expr.column)
    return -value
  }
  if (value === null) return false
  if (typeof value !== "boolean") throw new ScriptError("Expected true or false.", expr.line, expr.column)
  return !value
}

function evalBinary(expr: Extract<Expr, { type: "binary" }>, index: number, ctx: Ctx): Value {
  if (expr.op === "and") {
    if (evalExpr(expr.left, index, ctx) !== true) return false
    return evalExpr(expr.right, index, ctx) === true
  }
  if (expr.op === "or") {
    if (evalExpr(expr.left, index, ctx) === true) return true
    return evalExpr(expr.right, index, ctx) === true
  }
  const left = evalExpr(expr.left, index, ctx)
  const right = evalExpr(expr.right, index, ctx)
  if (expr.op === "+" || expr.op === "-" || expr.op === "*" || expr.op === "/") {
    if (left === null || right === null) return null
    if (typeof left !== "number" || typeof right !== "number") {
      throw new ScriptError("Expected a number.", expr.line, expr.column)
    }
    if (expr.op === "+") return left + right
    if (expr.op === "-") return left - right
    if (expr.op === "*") return left * right
    return right === 0 ? null : left / right
  }
  if (left === null || right === null) return false
  if (typeof left === "number" && typeof right === "number") {
    if (expr.op === "==") return left === right
    if (expr.op === "!=") return left !== right
    if (expr.op === "<") return left < right
    if (expr.op === "<=") return left <= right
    if (expr.op === ">") return left > right
    return left >= right
  }
  if ((expr.op === "==" || expr.op === "!=") && typeof left === typeof right) {
    return expr.op === "==" ? left === right : left !== right
  }
  throw new ScriptError("Expected a number.", expr.line, expr.column)
}

function evalCall(expr: Extract<Expr, { type: "call" }>, index: number, ctx: Ctx): Value {
  if (!isBuiltin(expr.name)) {
    throw new ScriptError(`Unknown function '${expr.name}'.`, expr.line, expr.column)
  }
  const arity = builtinArity(expr.name)
  if (expr.args.length !== arity) {
    throw new ScriptError(`'${expr.name}' needs ${arity} arguments.`, expr.line, expr.column)
  }
  if (expr.name === "abs") return foldNumber(evalExpr(expr.args[0]!, index, ctx), Math.abs, expr)
  if (expr.name === "max" || expr.name === "min") {
    const left = evalExpr(expr.args[0]!, index, ctx)
    const right = evalExpr(expr.args[1]!, index, ctx)
    if (left === null || right === null) return null
    if (typeof left !== "number" || typeof right !== "number") {
      throw new ScriptError("Expected a number.", expr.line, expr.column)
    }
    return expr.name === "max" ? Math.max(left, right) : Math.min(left, right)
  }
  if (expr.name === "sma" || expr.name === "highest" || expr.name === "lowest") {
    const length = requireLength(expr.args[1]!, ctx)
    const values = windowValues(expr.args[0]!, length, index, ctx)
    if (!values) return null
    if (expr.name === "sma") return values.reduce((sum, value) => sum + value, 0) / length
    return expr.name === "highest" ? Math.max(...values) : Math.min(...values)
  }
  if (expr.name === "ema") return ema(expr, index, ctx)
  if (expr.name === "shift") return shift(expr, index, ctx)
  if (expr.name === "crosses_above" || expr.name === "crosses_below") return cross(expr, index, ctx)
  throw new ScriptError(`Unknown function '${expr.name}'.`, expr.line, expr.column)
}

function ema(expr: Extract<Expr, { type: "call" }>, index: number, ctx: Ctx): Value {
  const length = requireLength(expr.args[1]!, ctx)
  const alpha = 2 / (length + 1)
  const row = memoRow(ctx, expr.id)
  let cursor = 0
  while (cursor < index && row.has(cursor)) cursor += 1
  let prev: Value = cursor === 0 ? null : row.get(cursor - 1)!
  for (let bar = cursor; bar <= index; bar += 1) {
    prev = emaStep(expr.args[0]!, length, alpha, bar, prev, ctx)
    row.set(bar, prev)
  }
  return row.get(index)!
}

function emaStep(arg: Expr, length: number, alpha: number, index: number, prev: Value, ctx: Ctx): Value {
  if (index < length - 1) return null
  const current = evalExpr(arg, index, ctx)
  if (typeof current !== "number") return null
  if (typeof prev !== "number") {
    const seed = windowValues(arg, length, index, ctx)
    return seed ? seed.reduce((sum, value) => sum + value, 0) / length : null
  }
  return alpha * current + (1 - alpha) * prev
}

function shift(expr: Extract<Expr, { type: "call" }>, index: number, ctx: Ctx): Value {
  const barsBack = fixedNumber(expr.args[1]!, ctx, "shift bars must be a whole number.")
  if (!Number.isInteger(barsBack)) {
    throw new ScriptError("shift bars must be a whole number.", expr.args[1]!.line, expr.args[1]!.column)
  }
  if (barsBack < 0) {
    throw new ScriptError("shift cannot read a later bar.", expr.args[1]!.line, expr.args[1]!.column)
  }
  if (index < barsBack) return null
  return evalExpr(expr.args[0]!, index - barsBack, ctx)
}

function cross(expr: Extract<Expr, { type: "call" }>, index: number, ctx: Ctx): boolean {
  if (index === 0) return false
  const leftPrev = evalExpr(expr.args[0]!, index - 1, ctx)
  const rightPrev = evalExpr(expr.args[1]!, index - 1, ctx)
  const left = evalExpr(expr.args[0]!, index, ctx)
  const right = evalExpr(expr.args[1]!, index, ctx)
  if (
    typeof leftPrev !== "number" ||
    typeof rightPrev !== "number" ||
    typeof left !== "number" ||
    typeof right !== "number"
  ) {
    return false
  }
  if (expr.name === "crosses_above") return leftPrev <= rightPrev && left > right
  return leftPrev >= rightPrev && left < right
}

function windowValues(arg: Expr, length: number, index: number, ctx: Ctx): number[] | null {
  if (index < length - 1) return null
  const values: number[] = []
  for (let bar = index - length + 1; bar <= index; bar += 1) {
    const value = evalExpr(arg, bar, ctx)
    if (typeof value !== "number") return null
    values.push(value)
  }
  return values
}

function requireLength(expr: Expr, ctx: Ctx): number {
  const length = fixedNumber(expr, ctx, "Length must be a fixed number.")
  if (!Number.isInteger(length) || length <= 0) {
    throw new ScriptError("Length must be a positive whole number.", expr.line, expr.column)
  }
  return length
}

function fixedNumber(expr: Expr, ctx: Ctx, message: string): number {
  const value = fixedValue(expr, ctx, message)
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ScriptError(message, expr.line, expr.column)
  }
  return value
}

function fixedValue(expr: Expr, ctx: Ctx, message: string): Value {
  switch (expr.type) {
    case "number":
    case "string":
    case "bool":
      return expr.value
    case "name": {
      if (!ctx.params.has(expr.name)) throw new ScriptError(message, expr.line, expr.column)
      return ctx.params.get(expr.name)!
    }
    case "unary": {
      if (expr.op !== "-") throw new ScriptError(message, expr.line, expr.column)
      const value = fixedValue(expr.arg, ctx, message)
      if (typeof value !== "number") throw new ScriptError(message, expr.line, expr.column)
      return -value
    }
    case "binary": {
      if (expr.op !== "+" && expr.op !== "-" && expr.op !== "*" && expr.op !== "/") {
        throw new ScriptError(message, expr.line, expr.column)
      }
      const left = fixedValue(expr.left, ctx, message)
      const right = fixedValue(expr.right, ctx, message)
      if (typeof left !== "number" || typeof right !== "number") {
        throw new ScriptError(message, expr.line, expr.column)
      }
      if (expr.op === "+") return left + right
      if (expr.op === "-") return left - right
      if (expr.op === "*") return left * right
      return right === 0 ? null : left / right
    }
    default:
      throw new ScriptError(message, expr.line, expr.column)
  }
}

function readName(name: string, index: number, ctx: Ctx, expr: Expr): Value {
  if (ctx.params.has(name)) return ctx.params.get(name)!
  if (isSource(name)) return readSource(name, ctx.bars[index]!, index)
  const series = ctx.defs.get(name)
  if (!series) throw new ScriptError(`Unknown name '${name}'.`, expr.line, expr.column)
  if (index < series.length) return series[index]!
  throw new ScriptError(`'${name}' is not computed yet.`, expr.line, expr.column)
}

function readSource(name: string, bar: Bar, index: number): number {
  switch (name) {
    case "open":
      return bar.open
    case "high":
      return bar.high
    case "low":
      return bar.low
    case "close":
      return bar.close
    case "volume":
      return bar.volume
    case "hl2":
      return (bar.high + bar.low) / 2
    case "hlc3":
      return (bar.high + bar.low + bar.close) / 3
    case "ohlc4":
      return (bar.open + bar.high + bar.low + bar.close) / 4
    case "bar_index":
      return index
    default:
      throw new ScriptError(`Unknown source '${name}'.`)
  }
}

function foldNumber(value: Value, fn: (value: number) => number, expr: Expr): Value {
  if (value === null) return null
  if (typeof value !== "number") throw new ScriptError("Expected a number.", expr.line, expr.column)
  return fn(value)
}

function memoRow(ctx: Ctx, id: number): Map<number, Value> {
  let row = ctx.memo.get(id)
  if (!row) {
    row = new Map()
    ctx.memo.set(id, row)
  }
  return row
}

function typeName(value: number | string | boolean): string {
  if (typeof value === "number") return "a number"
  if (typeof value === "string") return "text"
  return "true or false"
}

function assertNever(value: never): never {
  throw new ScriptError(`Unknown expression '${String(value)}'.`)
}
