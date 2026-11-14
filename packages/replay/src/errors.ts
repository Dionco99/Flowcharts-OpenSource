// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

/** A rejected replay action. The clock and the session file stay as they were. */
export class ReplayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReplayError";
    this.code = code;
  }
}
