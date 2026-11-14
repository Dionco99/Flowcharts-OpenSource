// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { ScriptError } from "./errors.ts"

export type TokenKind =
  | "ident"
  | "number"
  | "string"
  | "newline"
  | "lparen"
  | "rparen"
  | "comma"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "eq"
  | "eqeq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "eof"
  | "error"

export interface Token {
  kind: TokenKind
  value: string
  line: number
  column: number
  offset: number
}

/** Where the caret sits. A caret on the closing quote still counts as text. */
export function caretContext(source: string, offset: number): "code" | "string" | "comment" {
  const end = Math.max(0, Math.min(offset, source.length))
  let i = 0
  while (i < end) {
    const ch = source[i]!
    if (ch === "/" && source[i + 1] === "/") {
      let stop = i
      while (stop < source.length && source[stop] !== "\n" && source[stop] !== "\r") stop += 1
      if (end <= stop) return "comment"
      i = stop
      continue
    }
    if (ch === '"') {
      i += 1
      let closed = false
      while (i < end) {
        const next = source[i]!
        if (next === "\n" || next === "\r") return "string"
        if (next === "\\") {
          i += 2
          continue
        }
        if (next === '"') {
          closed = true
          i += 1
          break
        }
        i += 1
      }
      if (!closed) return "string"
      continue
    }
    i += 1
  }
  return "code"
}

export function tokenize(source: string, loose = false): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let column = 1

  const fail = (message: string, tokenLine: number, tokenColumn: number, offset: number): Token => {
    if (!loose) throw new ScriptError(message, tokenLine, tokenColumn)
    return { kind: "error", value: message, line: tokenLine, column: tokenColumn, offset }
  }

  while (i < source.length) {
    const ch = source[i]
    if (ch === " " || ch === "\t") {
      i += 1
      column += 1
      continue
    }
    if (ch === "\r") {
      if (source[i + 1] === "\n") {
        tokens.push({ kind: "newline", value: "\n", line, column, offset: i })
        i += 2
      } else {
        tokens.push({ kind: "newline", value: "\n", line, column, offset: i })
        i += 1
      }
      line += 1
      column = 1
      continue
    }
    if (ch === "\n") {
      tokens.push({ kind: "newline", value: "\n", line, column, offset: i })
      i += 1
      line += 1
      column = 1
      continue
    }
    if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n" && source[i] !== "\r") {
        i += 1
        column += 1
      }
      continue
    }
    const startLine = line
    const startColumn = column
    const offset = i

    if (ch === '"') {
      i += 1
      column += 1
      let value = ""
      let closed = false
      while (i < source.length) {
        const next = source[i]
        if (next === "\n" || next === "\r") break
        if (next === '"') {
          i += 1
          column += 1
          closed = true
          break
        }
        if (next === "\\") {
          const esc = source[i + 1]
          if (esc === undefined || esc === "\n" || esc === "\r") {
            tokens.push(fail("Unfinished text.", startLine, startColumn, offset))
            i = source.length
            closed = true
            break
          }
          if (esc === "n") value += "\n"
          else if (esc === "t") value += "\t"
          else if (esc === '"' || esc === "\\") value += esc
          else {
            tokens.push(fail(`Unknown text escape \\\\${esc}.`, startLine, startColumn, offset))
            i += 2
            column += 2
            closed = true
            break
          }
          i += 2
          column += 2
          continue
        }
        value += next
        i += 1
        column += 1
      }
      if (!closed) {
        tokens.push(fail("Unfinished text.", startLine, startColumn, offset))
        continue
      }
      if (tokens.at(-1)?.kind === "error" && tokens.at(-1)?.offset === offset) continue
      tokens.push({ kind: "string", value, line: startLine, column: startColumn, offset })
      continue
    }

    if (isDigit(ch)) {
      let text = ch
      i += 1
      column += 1
      while (i < source.length && isDigit(source[i]!)) {
        text += source[i]
        i += 1
        column += 1
      }
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        text += "."
        i += 1
        column += 1
        while (i < source.length && isDigit(source[i]!)) {
          text += source[i]
          i += 1
          column += 1
        }
      }
      tokens.push({ kind: "number", value: text, line: startLine, column: startColumn, offset })
      continue
    }

    if (isIdentStart(ch)) {
      let text = ch
      i += 1
      column += 1
      while (i < source.length && isIdentChar(source[i]!)) {
        text += source[i]
        i += 1
        column += 1
      }
      tokens.push({ kind: "ident", value: text, line: startLine, column: startColumn, offset })
      continue
    }

    const two = source.slice(i, i + 2)
    const twoKind = twoChar(two)
    if (twoKind) {
      tokens.push({ kind: twoKind, value: two, line: startLine, column: startColumn, offset })
      i += 2
      column += 2
      continue
    }
    const one = oneChar(ch)
    if (one) {
      tokens.push({ kind: one, value: ch, line: startLine, column: startColumn, offset })
      i += 1
      column += 1
      continue
    }
    tokens.push(fail(`Unexpected '${ch}'.`, startLine, startColumn, offset))
    i += 1
    column += 1
  }

  tokens.push({ kind: "eof", value: "", line, column, offset: source.length })
  return tokens
}

function twoChar(text: string): TokenKind | null {
  if (text === "==") return "eqeq"
  if (text === "!=") return "neq"
  if (text === "<=") return "lte"
  if (text === ">=") return "gte"
  return null
}

function oneChar(ch: string): TokenKind | null {
  switch (ch) {
    case "(":
      return "lparen"
    case ")":
      return "rparen"
    case ",":
      return "comma"
    case "+":
      return "plus"
    case "-":
      return "minus"
    case "*":
      return "star"
    case "/":
      return "slash"
    case "=":
      return "eq"
    case "<":
      return "lt"
    case ">":
      return "gt"
    default:
      return null
  }
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9"
}

function isIdentStart(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_"
}

function isIdentChar(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch)
}
