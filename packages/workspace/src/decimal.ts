// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceError } from "./errors.js";

const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function assertDecimal(value: string, label = "price"): void {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new WorkspaceError(
      "invalid_argument",
      `${label} must be a decimal string`,
    );
  }
}

export function scaleOf(value: string): number {
  assertDecimal(value);
  const dot = value.indexOf(".");
  return dot < 0 ? 0 : value.length - dot - 1;
}

export function toScaled(value: string, scale: number): bigint {
  assertDecimal(value);
  if (!Number.isInteger(scale) || scale < 0) {
    throw new WorkspaceError("invalid_argument", "scale must be a whole number");
  }
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = body.split(".");
  if (fraction.length > scale) {
    throw new WorkspaceError("invalid_argument", "decimal scale is too small");
  }
  const digits = `${whole}${fraction.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "");
  const magnitude = BigInt(digits);
  return negative ? -magnitude : magnitude;
}

export function fromScaled(value: bigint, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new WorkspaceError("invalid_argument", "scale must be a whole number");
  }
  const negative = value < 0n;
  let digits = (negative ? -value : value).toString();
  if (scale === 0) {
    return `${negative ? "-" : ""}${digits}`;
  }
  digits = digits.padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function compareDecimal(left: string, right: string): number {
  const scale = Math.max(scaleOf(left), scaleOf(right));
  const delta = toScaled(left, scale) - toScaled(right, scale);
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

export function addDecimal(left: string, right: string): string {
  const scale = Math.max(scaleOf(left), scaleOf(right));
  return fromScaled(toScaled(left, scale) + toScaled(right, scale), scale);
}

export function subDecimal(left: string, right: string): string {
  const scale = Math.max(scaleOf(left), scaleOf(right));
  return fromScaled(toScaled(left, scale) - toScaled(right, scale), scale);
}

export function mulDecimal(left: string, right: string): string {
  return fromScaled(
    toScaled(left, scaleOf(left)) * toScaled(right, scaleOf(right)),
    scaleOf(left) + scaleOf(right),
  );
}

export function divDecimal(value: string, divisor: number): string {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new WorkspaceError("invalid_argument", "divisor must be a positive whole number");
  }
  const scale = scaleOf(value);
  const extra = 6;
  const scaled = toScaled(value, scale) * 10n ** BigInt(extra);
  return fromScaled(scaled / BigInt(divisor), scale + extra);
}

export function maxDecimal(left: string, right: string): string {
  return compareDecimal(left, right) >= 0 ? left : right;
}

export function minDecimal(left: string, right: string): string {
  return compareDecimal(left, right) <= 0 ? left : right;
}

export function pricePrecision(tickSize: string): number {
  assertDecimal(tickSize, "tickSize");
  if (compareDecimal(tickSize, "0") <= 0) {
    throw new WorkspaceError("invalid_argument", "tickSize must be positive");
  }
  return scaleOf(tickSize);
}
