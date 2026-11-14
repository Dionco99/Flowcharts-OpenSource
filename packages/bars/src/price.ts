// SPDX-License-Identifier: Apache-2.0

/** Prices are decimal strings so a tick of 0.00001 stays exact in JSON. */

export function scaleOf(tick: string): number {
  const dot = tick.indexOf(".");
  return dot < 0 ? 0 : tick.length - dot - 1;
}

export function toUnits(value: string, tick: string): number {
  const scale = scaleOf(tick);
  const tickUnits = Number(tick) === 0 ? 1 : Math.round(Number(tick) * 10 ** scale);
  return Math.round(Number(value) * 10 ** scale) / tickUnits;
}

export function fromUnits(units: number, tick: string): string {
  const scale = scaleOf(tick);
  const tickUnits = Math.round(Number(tick) * 10 ** scale);
  return ((units * tickUnits) / 10 ** scale).toFixed(scale);
}

export function roundPrice(value: string, tick: string): string {
  return fromUnits(Math.round(toUnits(value, tick)), tick);
}

export function price(units: number, precision: number): string {
  return units.toFixed(precision);
}

export function num(value: string): number {
  return Number(value);
}

export function money(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const cents = Math.round(Math.abs(amount) * 100);
  return `${sign}${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
