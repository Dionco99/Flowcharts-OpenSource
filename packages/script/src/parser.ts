// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Action, BinaryOp, DefDecl, DrawDecl, Expr, OnDecl, ParamDecl, Program, Step } from "./ast.ts"
import { RESERVED, isBuiltin, isSource } from "./catalog.ts"
import { ScriptError } from "./errors.ts"
import { tokenize, type Token, type TokenKind } from "./lexer.ts"

export function parse(source: string): Program {
  return new Parser(tokenize(source)).parse()
}

class Parser {
  private index = 0
  private nextId = 1
  private readonly taken = new Set<string>()
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): Program {
    this.skipNewlines()
    const keyword = this.expectIdent("script")
    const name = this.expectFresh("script", false)
    const steps = this.parseScriptBody()
    this.skipNewlines()
    const extra = this.peek()
    if (extra.kind !== "eof") {
      throw new ScriptError("The script already ended.", extra.line, extra.column)
    }
    return { name: name.value, line: keyword.line, steps }
  }

  private parseScriptBody(): Step[] {
    const steps: Step[] = []
    for (;;) {
      this.skipNewlines()
      const token = this.peek()
      if (token.kind === "eof") {
        throw new ScriptError("Expected end to close the script.", token.line, token.column)
      }
      if (token.kind === "ident" && token.value === "end") {
        this.take()
        break
      }
      steps.push(this.parseScriptStep())
    }
    return steps
  }

  private parseScriptStep(): Step {
    const token = this.peek()
    if (token.kind !== "ident") {
      throw new ScriptError("Expected param, def, draw, or on.", token.line, token.column)
    }
    if (token.value === "param") return { kind: "param", decl: this.parseParam() }
    if (token.value === "def") return { kind: "def", decl: this.parseDef() }
    if (token.value === "draw") return { kind: "draw", decl: this.parseDraw() }
    if (token.value === "on") return { kind: "on", decl: this.parseOn() }
    throw new ScriptError(`'${token.value}' is not a script statement.`, token.line, token.column)
  }

  private parseParam(): ParamDecl {
    const keyword = this.expectIdent("param")
    const name = this.expectFresh("param", true)
    this.expectKind("eq", "=")
    const value = this.parseParamValue()
    return { name: name.value, value, line: keyword.line, column: keyword.column }
  }

  private parseParamValue(): number | string | boolean {
    const token = this.peek()
    if (token.kind === "minus") {
      this.take()
      const number = this.expectKind("number", "a number")
      return -Number(number.value)
    }
    if (token.kind === "number") {
      this.take()
      return Number(token.value)
    }
    if (token.kind === "string") {
      this.take()
      return token.value
    }
    if (token.kind === "ident" && (token.value === "true" || token.value === "false")) {
      this.take()
      return token.value === "true"
    }
    throw new ScriptError("A param needs a number, text, true, or false.", token.line, token.column)
  }

  private parseDef(): DefDecl {
    const keyword = this.expectIdent("def")
    const name = this.expectFresh("def", true)
    this.expectKind("eq", "=")
    const expr = this.parseExpr()
    return { name: name.value, expr, line: keyword.line, column: keyword.column }
  }

  private parseDraw(): DrawDecl {
    const keyword = this.expectIdent("draw")
    const expr = this.parseExpr()
    this.expectIdent("label")
    const text = this.expectKind("string", "plot text")
    return { expr, label: text.value, line: keyword.line }
  }

  private parseOn(): OnDecl {
    const keyword = this.expectIdent("on")
    const when = this.parseExpr()
    const actions: Action[] = []
    for (;;) {
      this.skipNewlines()
      const token = this.peek()
      if (token.kind === "eof") {
        throw new ScriptError("Expected end to close on.", token.line, token.column)
      }
      if (token.kind === "ident" && token.value === "end") {
        this.take()
        break
      }
      actions.push(this.parseAction())
    }
    return { when, actions, line: keyword.line }
  }

  private parseAction(): Action {
    const token = this.peek()
    if (token.kind !== "ident") {
      throw new ScriptError("Expected long, short, flat, or notify.", token.line, token.column)
    }
    if (token.value === "long" || token.value === "short") {
      this.take()
      const lots = this.parseExpr()
      return { type: token.value, lots, line: token.line }
    }
    if (token.value === "flat") {
      this.take()
      return { type: "flat", line: token.line }
    }
    if (token.value === "notify") {
      this.take()
      const message = this.parseExpr()
      return { type: "notify", message, line: token.line }
    }
    throw new ScriptError(`'${token.value}' is not an action.`, token.line, token.column)
  }

  private parseExpr(): Expr {
    return this.parseOr()
  }

  private parseOr(): Expr {
    let left = this.parseAnd()
    while (this.peek().kind === "ident" && this.peek().value === "or") {
      const op = this.take()
      left = this.binary("or", left, this.parseAnd(), op)
    }
    return left
  }

  private parseAnd(): Expr {
    let left = this.parseCmp()
    while (this.peek().kind === "ident" && this.peek().value === "and") {
      const op = this.take()
      left = this.binary("and", left, this.parseCmp(), op)
    }
    return left
  }

  private parseCmp(): Expr {
    const left = this.parseAdd()
    const op = this.peek()
    const kind = cmpOp(op)
    if (!kind) return left
    this.take()
    const right = this.parseAdd()
    if (cmpOp(this.peek())) {
      const extra = this.peek()
      throw new ScriptError("Comparisons do not chain. Use and.", extra.line, extra.column)
    }
    return this.binary(kind, left, right, op)
  }

  private parseAdd(): Expr {
    let left = this.parseMul()
    for (;;) {
      const op = this.peek()
      if (op.kind !== "plus" && op.kind !== "minus") break
      this.take()
      const kind: BinaryOp = op.kind === "plus" ? "+" : "-"
      left = this.binary(kind, left, this.parseMul(), op)
    }
    return left
  }

  private parseMul(): Expr {
    let left = this.parseUnary()
    for (;;) {
      const op = this.peek()
      if (op.kind !== "star" && op.kind !== "slash") break
      this.take()
      const kind: BinaryOp = op.kind === "star" ? "*" : "/"
      left = this.binary(kind, left, this.parseUnary(), op)
    }
    return left
  }

  private parseUnary(): Expr {
    const token = this.peek()
    if (token.kind === "minus") {
      this.take()
      const arg = this.parseUnary()
      return { id: this.nextId++, type: "unary", op: "-", arg, line: token.line, column: token.column }
    }
    if (token.kind === "ident" && token.value === "not") {
      this.take()
      const arg = this.parseUnary()
      return { id: this.nextId++, type: "unary", op: "not", arg, line: token.line, column: token.column }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Expr {
    const token = this.peek()
    if (token.kind === "number") {
      this.take()
      return { id: this.nextId++, type: "number", value: Number(token.value), line: token.line, column: token.column }
    }
    if (token.kind === "string") {
      this.take()
      return { id: this.nextId++, type: "string", value: token.value, line: token.line, column: token.column }
    }
    if (token.kind === "ident" && (token.value === "true" || token.value === "false")) {
      this.take()
      return {
        id: this.nextId++,
        type: "bool",
        value: token.value === "true",
        line: token.line,
        column: token.column,
      }
    }
    if (token.kind === "ident") {
      this.take()
      if (this.peek().kind === "lparen") {
        this.take()
        const args = this.parseArgs()
        this.expectKind("rparen", ")")
        return { id: this.nextId++, type: "call", name: token.value, args, line: token.line, column: token.column }
      }
      return { id: this.nextId++, type: "name", name: token.value, line: token.line, column: token.column }
    }
    if (token.kind === "lparen") {
      this.take()
      this.skipNewlines()
      const expr = this.parseExpr()
      this.skipNewlines()
      this.expectKind("rparen", ")")
      return expr
    }
    throw new ScriptError("Expected a value.", token.line, token.column)
  }

  private parseArgs(): Expr[] {
    const args: Expr[] = []
    this.skipNewlines()
    if (this.peek().kind === "rparen") return args
    args.push(this.parseExpr())
    while (this.peek().kind === "comma") {
      this.take()
      this.skipNewlines()
      args.push(this.parseExpr())
    }
    this.skipNewlines()
    return args
  }

  private binary(op: BinaryOp, left: Expr, right: Expr, token: Token): Expr {
    return { id: this.nextId++, type: "binary", op, left, right, line: token.line, column: token.column }
  }

  private expectFresh(role: string, occupy: boolean): Token {
    const token = this.expectKind("ident", `a ${role} name`)
    const name = token.value
    if (RESERVED.has(name) || isSource(name) || isBuiltin(name)) {
      throw new ScriptError(`'${name}' is a reserved name.`, token.line, token.column)
    }
    if (occupy) {
      if (this.taken.has(name)) {
        throw new ScriptError(`'${name}' is already defined.`, token.line, token.column)
      }
      this.taken.add(name)
    }
    return token
  }

  private expectIdent(value: string): Token {
    const token = this.peek()
    if (token.kind !== "ident" || token.value !== value) {
      throw new ScriptError(`Expected ${value}.`, token.line, token.column)
    }
    return this.take()
  }

  private expectKind(kind: TokenKind, label: string): Token {
    const token = this.peek()
    if (token.kind !== kind) {
      throw new ScriptError(`Expected ${label}.`, token.line, token.column)
    }
    return this.take()
  }

  private skipNewlines(): void {
    while (this.peek().kind === "newline" || this.peek().kind === "error") {
      const token = this.peek()
      if (token.kind === "error") {
        throw new ScriptError(token.value || "Bad token.", token.line, token.column)
      }
      this.take()
    }
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!
  }

  private take(): Token {
    const token = this.peek()
    if (this.index < this.tokens.length) this.index += 1
    return token
  }
}

function cmpOp(token: Token): BinaryOp | null {
  switch (token.kind) {
    case "eqeq":
      return "=="
    case "neq":
      return "!="
    case "lt":
      return "<"
    case "lte":
      return "<="
    case "gt":
      return ">"
    case "gte":
      return ">="
    default:
      return null
  }
}
