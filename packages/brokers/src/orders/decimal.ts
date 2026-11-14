// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { OrderRejected } from "./errors.js";

const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function assertPositiveDecimal(value: string, field: string): void {
  if (typeof value !== "string" || !DECIMAL.test(value) || Number(value) <= 0) {
    throw new OrderRejected(`${field} must be a positive decimal string`);
  }
}

export function isWholeShares(value: string): boolean {
  return /^[1-9]\d*$/.test(value);
}

/** cTrader Open API volume is units × 100 (0.01 of a unit). */
export function toCTraderVolume(qty: string): string {
  assertPositiveDecimal(qty, "qty");
  const [whole, frac = ""] = qty.split(".");
  if (frac.length > 2) {
    throw new OrderRejected("cTrader quantity supports at most two decimal places");
  }
  const digits = `${whole}${frac.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");
  return digits;
}

/** Opening fills realize minus the commission, as a signed decimal string. */
export function negateDecimal(value: string): string {
  if (value === "0") return "0";
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

export function zeroOrPositive(value: string | undefined, field: string): string {
  if (value === undefined || value.trim() === "" || Number(value) === 0) return "0";
  assertPositiveDecimal(value, field);
  return value;
}

export function assertNoNewlines(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new OrderRejected(`${field} contains a newline`);
  }
}
