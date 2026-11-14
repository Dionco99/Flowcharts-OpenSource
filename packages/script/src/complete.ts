// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import {
  BUILTINS,
  EXPR_KEYWORDS,
  LABEL_KEYWORD,
  ON_KEYWORDS,
  ROOT_KEYWORDS,
  SCRIPT_KEYWORDS,
  SOURCES,
  type CatalogItem,
} from "./catalog.ts"
import { caretContext, tokenize, type Token } from "./lexer.ts"

export interface Completion {
  label: string
  kind: "keyword" | "builtin" | "source" | "name"
  detail: string
  start: number
  end: number
}

interface NameItem {
  label: string
  kind: "name"
  detail: string
}

type Item = CatalogItem | NameItem

type Block = "root" | "script" | "on"
type ExprOwner = "def" | "draw" | "on" | "lots" | "notify"

type Mode =
  | { type: "stmt" }
  | { type: "need-ident"; role: "script" | "param" | "def" }
  | { type: "need-eq"; role: "param" | "def" }
  | { type: "need-literal" }
  | { type: "expr"; owner: ExprOwner; paren: number; last: "none" | "value" | "op" }
  | { type: "need-text" }
  | { type: "done" }

const AND_OR: CatalogItem[] = [
  { label: "and", kind: "keyword", detail: "True when both sides are true." },
  { label: "or", kind: "keyword", detail: "True when either side is true." },
]

export function complete(source: string, offset: number): Completion[] {
  const end = Math.max(0, Math.min(offset, source.length))
  if (caretContext(source, end) !== "code") return []
  const start = partialStart(source, end)
  if (start === null) return []
  const partial = source.slice(start, end)
  const state = classify(source.slice(0, start))
  return filter(candidates(state), partial).map((item) => ({
    label: item.label,
    kind: item.kind,
    detail: item.detail,
    start,
    end,
  }))
}

function candidates(state: Classified): Item[] {
  const mode = state.mode
  if (mode.type === "stmt") return keywordsFor(state.block)
  if (mode.type === "need-literal") {
    return EXPR_KEYWORDS.filter((item) => item.label === "true" || item.label === "false")
  }
  if (mode.type !== "expr") return []
  if (mode.last === "value") {
    const items: Item[] = [...AND_OR]
    if (mode.owner === "draw" && mode.paren === 0) items.push(LABEL_KEYWORD)
    return items
  }
  return [...SOURCES, ...BUILTINS, ...state.names, ...EXPR_KEYWORDS]
}

function keywordsFor(block: Block): CatalogItem[] {
  if (block === "root") return ROOT_KEYWORDS
  if (block === "script") return SCRIPT_KEYWORDS
  return ON_KEYWORDS
}

interface Classified {
  mode: Mode
  names: NameItem[]
  block: Block
}

function classify(before: string): Classified {
  const tokens = tokenize(before, true).filter((token) => token.kind !== "eof")
  const names: NameItem[] = []
  const stack: Block[] = ["root"]
  let mode: Mode = { type: "stmt" }
  let pending = ""
  let index = 0

  const commit = (detail: "param" | "def") => {
    if (!pending) return
    names.push({ label: pending, kind: "name", detail: `${detail} ${pending}` })
    pending = ""
  }

  while (index < tokens.length) {
    const token = tokens[index]!
    if (token.kind === "error") {
      mode = { type: "stmt" }
      pending = ""
      index += 1
      continue
    }
    if (mode.type === "expr") {
      const signal = feedExpr(mode, token)
      if (signal === "stay") {
        index += 1
        continue
      }
      if (mode.owner === "def") commit("def")
      if (mode.owner === "on") stack.push("on")
      if (signal === "label") {
        mode = { type: "need-text" }
        index += 1
        continue
      }
      mode = { type: "stmt" }
      if (signal === "end") index += 1
      continue
    }
    mode = take(mode, token, stack, names, () => pending, (value) => {
      pending = value
    }, commit)
    index += 1
  }

  return { mode, names, block: stack[stack.length - 1] ?? "root" }
}

function take(
  mode: Mode,
  token: Token,
  stack: Block[],
  names: NameItem[],
  readPending: () => string,
  writePending: (value: string) => void,
  commit: (detail: "param" | "def") => void,
): Mode {
  if (mode.type === "stmt") return takeStmt(token, stack)
  if (mode.type === "need-ident") {
    if (token.kind === "newline") return { type: "stmt" }
    if (token.kind !== "ident") return mode
    if (mode.role === "script") {
      stack.push("script")
      return { type: "stmt" }
    }
    writePending(token.value)
    return { type: "need-eq", role: mode.role }
  }
  if (mode.type === "need-eq") {
    if (token.kind === "newline") return { type: "stmt" }
    if (token.kind !== "eq") return mode
    if (mode.role === "param") return { type: "need-literal" }
    return { type: "expr", owner: "def", paren: 0, last: "none" }
  }
  if (mode.type === "need-literal") {
    if (token.kind === "minus") return mode
    if (
      token.kind === "number" ||
      token.kind === "string" ||
      (token.kind === "ident" && (token.value === "true" || token.value === "false"))
    ) {
      commit("param")
      return { type: "done" }
    }
    if (token.kind === "newline") return { type: "stmt" }
    return mode
  }
  if (mode.type === "need-text") {
    if (token.kind === "string") return { type: "done" }
    if (token.kind === "newline") return { type: "stmt" }
    return mode
  }
  if (mode.type === "done") {
    if (token.kind === "newline") return { type: "stmt" }
    return mode
  }
  void names
  void readPending
  return mode
}

function takeStmt(token: Token, stack: Block[]): Mode {
  if (token.kind === "newline") return { type: "stmt" }
  if (token.kind !== "ident") return { type: "stmt" }
  const block = stack[stack.length - 1] ?? "root"
  const word = token.value
  if (word === "script" && block === "root") return { type: "need-ident", role: "script" }
  if (word === "param" && block === "script") return { type: "need-ident", role: "param" }
  if (word === "def" && block === "script") return { type: "need-ident", role: "def" }
  if (word === "draw" && block === "script") return { type: "expr", owner: "draw", paren: 0, last: "none" }
  if (word === "on" && block === "script") return { type: "expr", owner: "on", paren: 0, last: "none" }
  if (word === "end") {
    if (stack.length > 1) stack.pop()
    return { type: "stmt" }
  }
  if ((word === "long" || word === "short") && block === "on") {
    return { type: "expr", owner: "lots", paren: 0, last: "none" }
  }
  if (word === "flat" && block === "on") return { type: "stmt" }
  if (word === "notify" && block === "on") return { type: "expr", owner: "notify", paren: 0, last: "none" }
  return { type: "stmt" }
}

type Signal = "stay" | "end" | "retry" | "label"

function feedExpr(mode: Extract<Mode, { type: "expr" }>, token: Token): Signal {
  if (token.kind === "newline") {
    if (mode.paren > 0) return "stay"
    return "end"
  }
  if (token.kind === "lparen") {
    mode.paren += 1
    mode.last = "op"
    return "stay"
  }
  if (token.kind === "rparen") {
    if (mode.paren > 0) mode.paren -= 1
    mode.last = "value"
    return "stay"
  }
  if (token.kind === "comma") {
    mode.last = "op"
    return "stay"
  }
  if (token.kind === "ident" && token.value === "not" && mode.last !== "value") {
    mode.last = "op"
    return "stay"
  }
  if (isJoin(token) && (mode.last === "value" || token.kind === "minus")) {
    if (mode.last !== "value" && token.kind === "minus") {
      mode.last = "op"
      return "stay"
    }
    if (mode.last === "value") {
      mode.last = "op"
      return "stay"
    }
  }
  if (
    mode.owner === "draw" &&
    mode.paren === 0 &&
    mode.last === "value" &&
    token.kind === "ident" &&
    token.value === "label"
  ) {
    return "label"
  }
  if (mode.last === "value" && mode.paren === 0) return "retry"
  if (isValue(token)) {
    mode.last = "value"
    return "stay"
  }
  if (mode.paren > 0) return "stay"
  return "retry"
}

function isJoin(token: Token): boolean {
  switch (token.kind) {
    case "plus":
    case "minus":
    case "star":
    case "slash":
    case "eqeq":
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return true
    default:
      return token.kind === "ident" && (token.value === "and" || token.value === "or")
  }
}

function isValue(token: Token): boolean {
  if (token.kind === "number" || token.kind === "string") return true
  if (token.kind !== "ident") return false
  return token.value !== "and" && token.value !== "or" && token.value !== "not"
}

function partialStart(source: string, offset: number): number | null {
  let start = offset
  while (start > 0 && isIdentChar(source[start - 1]!)) start -= 1
  if (start < offset && isDigit(source[start]!)) return null
  return start
}

function filter(items: Item[], partial: string): Item[] {
  const rank = { source: 0, builtin: 1, name: 2, keyword: 3 }
  const seen = new Set<string>()
  const unique: Item[] = []
  for (const item of items) {
    if (!item.label.startsWith(partial) || seen.has(item.label)) continue
    seen.add(item.label)
    unique.push(item)
  }
  return unique.sort((a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label))
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9"
}

function isIdentChar(ch: string): boolean {
  return isDigit(ch) || (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_"
}
