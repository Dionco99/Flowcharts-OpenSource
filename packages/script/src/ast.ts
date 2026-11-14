// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export type BinaryOp =
  | "or"
  | "and"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"

export interface ExprBase {
  id: number
  line: number
  column: number
}

export type Expr =
  | (ExprBase & { type: "number"; value: number })
  | (ExprBase & { type: "string"; value: string })
  | (ExprBase & { type: "bool"; value: boolean })
  | (ExprBase & { type: "name"; name: string })
  | (ExprBase & { type: "unary"; op: "-" | "not"; arg: Expr })
  | (ExprBase & { type: "binary"; op: BinaryOp; left: Expr; right: Expr })
  | (ExprBase & { type: "call"; name: string; args: Expr[] })

export interface ParamDecl {
  name: string
  value: number | string | boolean
  line: number
  column: number
}

export interface DefDecl {
  name: string
  expr: Expr
  line: number
  column: number
}

export interface DrawDecl {
  expr: Expr
  label: string
  line: number
}

export type Action =
  | { type: "long" | "short"; lots: Expr; line: number }
  | { type: "flat"; line: number }
  | { type: "notify"; message: Expr; line: number }

export interface OnDecl {
  when: Expr
  actions: Action[]
  line: number
}

export type Step =
  | { kind: "param"; decl: ParamDecl }
  | { kind: "def"; decl: DefDecl }
  | { kind: "draw"; decl: DrawDecl }
  | { kind: "on"; decl: OnDecl }

export interface Program {
  name: string
  line: number
  steps: Step[]
}
