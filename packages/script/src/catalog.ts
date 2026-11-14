// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export interface CatalogItem {
  label: string
  kind: "keyword" | "builtin" | "source"
  detail: string
}

export const RESERVED = new Set([
  "script",
  "param",
  "def",
  "draw",
  "on",
  "end",
  "long",
  "short",
  "flat",
  "notify",
  "and",
  "or",
  "not",
  "true",
  "false",
])

export const SOURCES: CatalogItem[] = [
  { label: "open", kind: "source", detail: "Bar open." },
  { label: "high", kind: "source", detail: "Bar high." },
  { label: "low", kind: "source", detail: "Bar low." },
  { label: "close", kind: "source", detail: "Bar close." },
  { label: "volume", kind: "source", detail: "Bar volume." },
  { label: "hl2", kind: "source", detail: "Average of high and low." },
  { label: "hlc3", kind: "source", detail: "Average of high, low, and close." },
  { label: "ohlc4", kind: "source", detail: "Average of open, high, low, and close." },
  { label: "bar_index", kind: "source", detail: "Zero-based index of the current bar." },
]

export const BUILTINS: CatalogItem[] = [
  { label: "sma", kind: "builtin", detail: "Simple moving average. sma(series, length)." },
  {
    label: "ema",
    kind: "builtin",
    detail: "Exponential moving average. The seed is a simple average. ema(series, length).",
  },
  {
    label: "shift",
    kind: "builtin",
    detail: "Value from an earlier bar. shift(series, bars). A later bar is rejected.",
  },
  { label: "highest", kind: "builtin", detail: "Highest value over the last length bars." },
  { label: "lowest", kind: "builtin", detail: "Lowest value over the last length bars." },
  {
    label: "crosses_above",
    kind: "builtin",
    detail: "True when the left series moves from at or below the right series to above it.",
  },
  {
    label: "crosses_below",
    kind: "builtin",
    detail: "True when the left series moves from at or above the right series to below it.",
  },
  { label: "abs", kind: "builtin", detail: "Absolute value." },
  { label: "max", kind: "builtin", detail: "Larger of two numbers." },
  { label: "min", kind: "builtin", detail: "Smaller of two numbers." },
]

export const ROOT_KEYWORDS: CatalogItem[] = [
  { label: "script", kind: "keyword", detail: "Open a script. script name ... end" },
]

export const SCRIPT_KEYWORDS: CatalogItem[] = [
  { label: "param", kind: "keyword", detail: "Named input. param name = value" },
  { label: "def", kind: "keyword", detail: "Name a series. def name = expression" },
  { label: "draw", kind: "keyword", detail: "Record a plot. draw expression label \"title\"" },
  { label: "on", kind: "keyword", detail: "Run actions when a condition is true. on condition ... end" },
  { label: "end", kind: "keyword", detail: "Close the script." },
]

export const ON_KEYWORDS: CatalogItem[] = [
  { label: "long", kind: "keyword", detail: "Set the position long. long lots" },
  { label: "short", kind: "keyword", detail: "Set the position short. short lots" },
  { label: "flat", kind: "keyword", detail: "Close the position." },
  { label: "notify", kind: "keyword", detail: "Emit an alert. notify \"message\"" },
  { label: "end", kind: "keyword", detail: "Close this on block." },
]

export const LABEL_KEYWORD: CatalogItem = {
  label: "label",
  kind: "keyword",
  detail: "Name a plot. label \"title\"",
}

export const EXPR_KEYWORDS: CatalogItem[] = [
  { label: "not", kind: "keyword", detail: "True when the value is not true." },
  { label: "true", kind: "keyword", detail: "Boolean true." },
  { label: "false", kind: "keyword", detail: "Boolean false." },
]

const SOURCE_NAMES = new Set(SOURCES.map((item) => item.label))
const BUILTIN_NAMES = new Set(BUILTINS.map((item) => item.label))

export function isSource(name: string): boolean {
  return SOURCE_NAMES.has(name)
}

export function isBuiltin(name: string): boolean {
  return BUILTIN_NAMES.has(name)
}

export function builtinArity(name: string): number {
  if (name === "abs") return 1
  return 2
}

export function languageCatalog(): {
  keywords: CatalogItem[]
  sources: CatalogItem[]
  builtins: CatalogItem[]
} {
  return {
    keywords: [...ROOT_KEYWORDS, ...SCRIPT_KEYWORDS, ...ON_KEYWORDS, LABEL_KEYWORD, ...EXPR_KEYWORDS],
    sources: SOURCES,
    builtins: BUILTINS,
  }
}
