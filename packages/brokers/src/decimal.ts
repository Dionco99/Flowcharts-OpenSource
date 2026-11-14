// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { BrokerError } from "./errors.ts";

const SCALE = 12n;
const BASE = 10n ** SCALE;
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function assertDecimal(value: string, label: string): string {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new BrokerError("invalid_order", `${label} must be a decimal string.`);
  }
  return value;
}

export function cmp(left: string, right: string): -1 | 0 | 1 {
  const delta = scale(left) - scale(right);
  if (delta < 0n) return -1;
  if (delta > 0n) return 1;
  return 0;
}

export function add(left: string, right: string): string {
  return unscale(scale(left) + scale(right));
}

export function sub(left: string, right: string): string {
  return unscale(scale(left) - scale(right));
}

export function mul(left: string, right: string): string {
  return unscale((scale(left) * scale(right)) / BASE);
}

export function div(numerator: string, denominator: string): string {
  return unscale((scale(numerator) * BASE) / scale(denominator));
}

export function neg(value: string): string {
  return unscale(-scale(value));
}

export function isPositive(value: string): boolean {
  return scale(value) > 0n;
}

export function min(left: string, right: string): string {
  return cmp(left, right) <= 0 ? left : right;
}

function scale(value: string): bigint {
  assertDecimal(value, "number");
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole, frac = ""] = raw.split(".");
  if (frac.length > Number(SCALE)) {
    throw new BrokerError("invalid_order", "That number has more than 12 decimal places.");
  }
  const scaled = BigInt(whole) * BASE + BigInt(frac.padEnd(Number(SCALE), "0"));
  return negative ? -scaled : scaled;
}

function unscale(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / BASE;
  const frac = (abs % BASE).toString().padStart(Number(SCALE), "0").replace(/0+$/, "");
  const text = frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
  if (negative && text !== "0") return `-${text}`;
  return text;
}
