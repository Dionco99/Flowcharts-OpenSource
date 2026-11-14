// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

/** A rejected broker call. The port catches it and leaves the book unchanged. */
export class BrokerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BrokerError";
    this.code = code;
  }
}

export type BrokerResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };
