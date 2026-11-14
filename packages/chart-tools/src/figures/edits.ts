// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.js";
import type { Anchor } from "./lines.js";

export type MagnetMode = "normal" | "weak_magnet" | "strong_magnet";

export interface EditableDrawing {
  id: string;
  locked: boolean;
  magnet: MagnetMode;
  anchors: Anchor[];
}

const MAGNETS = new Set<MagnetMode>(["normal", "weak_magnet", "strong_magnet"]);

export function setLock<T extends { locked: boolean }>(drawing: T, locked: boolean): T {
  return { ...drawing, locked };
}

export function setMagnet<T extends { magnet: MagnetMode }>(drawing: T, magnet: MagnetMode): T {
  if (!MAGNETS.has(magnet)) {
    throw new Error(`unknown magnet: ${String(magnet)}`);
  }
  return { ...drawing, magnet };
}

/** A locked drawing ignores pointer edits and is returned unchanged. */
export function applyAnchorEdit<T extends EditableDrawing>(drawing: T, anchors: readonly Anchor[]): T {
  if (drawing.locked) {
    return drawing;
  }
  return {
    ...drawing,
    anchors: anchors.map((anchor) => ({ time: anchor.time, price: anchor.price })),
  };
}

/**
 * Snap a pointer to the bar's open, high, low, or close.
 * `normal` leaves the pointer. `weak_magnet` snaps inside `threshold`.
 * `strong_magnet` always snaps to the nearest of those four prices.
 */
export function snapPrice(mode: MagnetMode, pointerPrice: number, bar: Bar, threshold: number): number {
  if (!MAGNETS.has(mode)) {
    throw new Error(`unknown magnet: ${String(mode)}`);
  }
  if (!Number.isFinite(pointerPrice) || !Number.isFinite(threshold) || threshold < 0) {
    throw new Error("pointer price and threshold must be finite, and threshold must be non-negative");
  }
  if (mode === "normal") {
    return pointerPrice;
  }
  const levels = [bar.open, bar.high, bar.low, bar.close];
  let nearest = levels[0]!;
  let best = Math.abs(pointerPrice - nearest);
  for (const level of levels) {
    const distance = Math.abs(pointerPrice - level);
    if (distance < best) {
      nearest = level;
      best = distance;
    }
  }
  if (mode === "strong_magnet" || best <= threshold) {
    return nearest;
  }
  return pointerPrice;
}

/**
 * Drawings are stored by time and price, so a seek does not move them.
 * The result is a copy. The cursor is checked and then unused.
 */
export function drawingsAfterSeek<T extends EditableDrawing>(
  drawings: readonly T[],
  cursor: number,
): T[] {
  if (!Number.isFinite(cursor)) {
    throw new Error("cursor must be a finite timestamp");
  }
  return drawings.map((drawing) => ({
    ...drawing,
    anchors: drawing.anchors.map((anchor) => ({ time: anchor.time, price: anchor.price })),
  }));
}
