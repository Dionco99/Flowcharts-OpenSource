// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { AlertsError } from "./errors.ts";

const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function assertUtc(value: string, label = "timestamp"): string {
  if (!UTC.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new AlertsError("invalid_argument", `${label} must be UTC YYYY-MM-DDTHH:MM:SSZ`);
  }
  return value;
}

export function epochMs(value: string): number {
  return Date.parse(assertUtc(value));
}

export function addMinutes(value: string, minutes: number): string {
  if (!Number.isInteger(minutes)) {
    throw new AlertsError("invalid_argument", "minutes must be an integer");
  }
  const next = new Date(epochMs(value) + minutes * 60_000);
  return next.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function cmpTime(a: string, b: string): -1 | 0 | 1 {
  const left = epochMs(a);
  const right = epochMs(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
