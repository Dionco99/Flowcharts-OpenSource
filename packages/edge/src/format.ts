// SPDX-License-Identifier: Apache-2.0

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** Signed R to two decimals: `+0.32R`, `-1.00R`, `0.00R`. */
export function formatR(value: number): string {
  const rounded = roundTo(value, 2);
  const body = Math.abs(rounded).toFixed(2);
  if (rounded > 0) return `+${body}R`;
  if (rounded < 0) return `-${body}R`;
  return "0.00R";
}

/** Unsigned R magnitude: `0.32R`. */
export function formatMagnitude(value: number): string {
  return `${Math.abs(roundTo(value, 2)).toFixed(2)}R`;
}

/**
 * A fraction as a percent. Values that would round to 0% or 100%
 * without actually being there are written as bounds.
 */
export function formatPercent(fraction: number): string {
  if (fraction <= 0) return "0.0%";
  if (fraction >= 1) return "100%";
  const tenths = Math.round(fraction * 1000) / 10;
  if (tenths <= 0) return "<0.1%";
  if (tenths >= 100) return ">99.9%";
  return `${tenths.toFixed(1)}%`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPlain(value: number, places = 2): string {
  return roundTo(value, places).toFixed(places);
}
