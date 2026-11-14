// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export class ScriptError extends Error {
  readonly line: number
  readonly column: number

  constructor(message: string, line = 1, column = 1) {
    super(message)
    this.name = "ScriptError"
    this.line = line
    this.column = column
  }
}
