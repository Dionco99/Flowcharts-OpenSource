// SPDX-License-Identifier: Apache-2.0

function asNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export function formatPrice(value: number | string, digits = 5): string {
  const price = asNumber(value);
  if (!Number.isFinite(price)) return "—";
  return price.toFixed(digits);
}

export function formatLots(value: number | string): string {
  return (Math.round(asNumber(value) * 100) / 100).toFixed(2);
}

export function formatMoney(value: number | string): string {
  const amount = asNumber(value);
  const sign = amount < 0 ? "−" : amount > 0 ? "+" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

export function formatPips(spread: number | string, pipSize: number | string): string {
  const pips = asNumber(spread) / asNumber(pipSize);
  return `${pips.toFixed(1)} pips`;
}
