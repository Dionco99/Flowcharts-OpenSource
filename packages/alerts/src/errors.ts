// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export type AlertErrorCode =
  | "invalid_argument"
  | "invalid_bar"
  | "invalid_rule"
  | "invalid_drawing"
  | "window_leak"
  | "unknown_alert"
  | "unknown_watchlist";

export class AlertsError extends Error {
  readonly code: AlertErrorCode;

  constructor(code: AlertErrorCode, message: string) {
    super(message);
    this.name = "AlertsError";
    this.code = code;
  }
}
