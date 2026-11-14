// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export { languageCatalog } from "./catalog.ts"
export type { CatalogItem } from "./catalog.ts"
export { complete } from "./complete.ts"
export type { Completion } from "./complete.ts"
export { ScriptError } from "./errors.ts"
export { run, runProgram } from "./evaluate.ts"
export type {
  AlertEvent,
  AlertHook,
  BacktestHook,
  Bar,
  Fill,
  OrderIntent,
  PlotSeries,
  Position,
  RunOptions,
  RunResult,
} from "./evaluate.ts"
export { parse } from "./parser.ts"
export type { Program } from "./ast.ts"
