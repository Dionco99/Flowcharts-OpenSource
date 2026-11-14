// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export type PriceScale = "linear" | "logarithmic" | "percentage";

/** Axis names stored on a layout and passed to the chart library. */
export const PRICE_SCALE_AXIS = {
  linear: "normal",
  logarithmic: "logarithm",
  percentage: "percentage",
} as const;

export type PriceScaleAxis = (typeof PRICE_SCALE_AXIS)[PriceScale];

/**
 * Map a price into the chosen scale.
 * Percentage is the percent change from `base`. Logarithmic is the natural log.
 */
export function scalePrice(price: number, scale: PriceScale, base?: number): number {
  if (!Number.isFinite(price)) {
    throw new Error("price must be finite");
  }
  if (scale === "linear") {
    return price;
  }
  if (scale === "logarithmic") {
    if (price <= 0) {
      throw new Error("logarithmic scale requires a positive price");
    }
    return Math.log(price);
  }
  if (scale === "percentage") {
    if (base === undefined || !Number.isFinite(base) || base === 0) {
      throw new Error("percentage scale requires a non-zero finite base");
    }
    return ((price - base) / base) * 100;
  }
  throw new Error(`unknown price scale: ${String(scale)}`);
}
