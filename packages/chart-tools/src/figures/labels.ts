// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Anchor } from "./lines.js";
import type { MagnetMode } from "./edits.js";

export type LabelKind = "text" | "note" | "callout" | "price";

export interface ChartLabel {
  id: string;
  kind: LabelKind;
  anchor: Anchor;
  text: string;
  locked: boolean;
  magnet: MagnetMode;
}

const KINDS = new Set<LabelKind>(["text", "note", "callout", "price"]);

/** A text record. Nothing is drawn here. A price label keeps the anchor price. */
export function chartLabel(id: string, kind: LabelKind, anchor: Anchor, text: string): ChartLabel {
  if (!KINDS.has(kind)) {
    throw new Error(`unknown label: ${String(kind)}`);
  }
  if (!Number.isFinite(anchor.time) || !Number.isFinite(anchor.price)) {
    throw new Error("label anchor needs a finite time and price");
  }
  return {
    id,
    kind,
    anchor: { time: anchor.time, price: anchor.price },
    text,
    locked: false,
    magnet: "normal",
  };
}
