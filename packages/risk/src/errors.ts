// SPDX-License-Identifier: Apache-2.0

export class RiskError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RiskError";
    this.code = code;
  }
}
