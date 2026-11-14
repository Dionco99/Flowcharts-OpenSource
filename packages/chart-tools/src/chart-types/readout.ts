// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.js";

export interface CrosshairReadout {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  pointerPrice: number;
}

/**
 * The bar that contains a timestamp.
 * A time equal to a bar's close belongs to the next bar when that bar has opened,
 * and to the closing bar when nothing later has opened.
 */
export function barCovering(bars: readonly Bar[], timestamp: number): Bar | null {
  if (!Number.isFinite(timestamp)) {
    throw new Error("timestamp must be finite");
  }
  let closedAt: Bar | null = null;
  for (const bar of bars) {
    if (bar.openTime <= timestamp && timestamp < bar.closeTime) {
      return bar;
    }
    if (timestamp === bar.closeTime) {
      closedAt = bar;
    }
  }
  return closedAt;
}

/** Open, high, low, close, volume, and the pointer price for one bar. */
export function crosshair(bar: Bar, pointerPrice: number): CrosshairReadout {
  if (!Number.isFinite(pointerPrice)) {
    throw new Error("pointer price must be finite");
  }
  return {
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    pointerPrice,
  };
}

/** The latest close, or null when the window is empty. */
export function lastPrice(bars: readonly Bar[]): number | null {
  const last = bars[bars.length - 1];
  return last === undefined ? null : last.close;
}

/** Milliseconds until the bar close, or zero once that time has passed. */
export function countdownToClose(closeTime: number, now: number): number {
  if (!Number.isFinite(closeTime) || !Number.isFinite(now)) {
    throw new Error("times must be finite");
  }
  return Math.max(0, closeTime - now);
}
