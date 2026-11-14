// SPDX-License-Identifier: Apache-2.0

export const ERROR_CODES = [
  "invalid_argument",
  "invalid_plugin",
  "api_version",
  "duplicate_id",
  "unknown_plugin",
  "window_leak",
  "indicator_result",
] as const;

export type FlowchartErrorCode = (typeof ERROR_CODES)[number];

export class FlowchartError extends Error {
  readonly code: FlowchartErrorCode;

  constructor(code: FlowchartErrorCode, message: string) {
    super(message);
    this.name = "FlowchartError";
    this.code = code;
  }
}
