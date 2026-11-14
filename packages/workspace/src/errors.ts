// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export type WorkspaceErrorCode =
  | "invalid_argument"
  | "invalid_bar"
  | "invalid_layout"
  | "invalid_period"
  | "invalid_settings"
  | "locked"
  | "unknown_hook"
  | "window_leak";

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;

  constructor(code: WorkspaceErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}
