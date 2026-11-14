// SPDX-License-Identifier: Apache-2.0

export const BILLING_ERROR_CODES = [
  "invalid_argument",
  "invalid_signature",
  "invalid_payload",
  "stale_timestamp",
] as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[number];

export class BillingError extends Error {
  readonly code: BillingErrorCode;

  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}
