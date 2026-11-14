// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export const ACCOUNTS_ERROR_CODES = [
  "invalid_account",
  "account_exists",
  "unknown_account",
  "bad_passphrase",
  "signed_out",
  "invalid_record",
  "conflict",
  "invalid_revision",
] as const;

export type AccountsErrorCode = (typeof ACCOUNTS_ERROR_CODES)[number];

export class AccountsError extends Error {
  readonly code: AccountsErrorCode;
  /** Set when `code` is `conflict`. The row's current revision, or 0 when it does not exist. */
  readonly revision: number | null;

  constructor(code: AccountsErrorCode, message: string, revision: number | null = null) {
    super(message);
    this.name = "AccountsError";
    this.code = code;
    this.revision = revision;
  }
}
