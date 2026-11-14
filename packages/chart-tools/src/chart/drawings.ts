// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import type { OverlayCreate, OverlayMode } from "klinecharts";

/** Overlay names built into KLineChart 10.1.0. A test checks this list against the library. */
export const OVERLAY_NAMES = [
  "brush",
  "fibonacciLine",
  "horizontalRayLine",
  "horizontalSegment",
  "horizontalStraightLine",
  "parallelStraightLine",
  "priceChannelLine",
  "priceLine",
  "rayLine",
  "segment",
  "simpleAnnotation",
  "simpleTag",
  "straightLine",
  "verticalRayLine",
  "verticalSegment",
  "verticalStraightLine",
] as const;

export type OverlayName = (typeof OVERLAY_NAMES)[number];

/** Percents used by KLineChart's fibonacciLine. 1 is the first point and 0 is the second. */
export const FIBONACCI_LINE_PERCENTS = [1, 0.786, 0.618, 0.5, 0.382, 0.236, 0] as const;

const POINT_COUNT: Record<OverlayName, number> = {
  brush: 1,
  fibonacciLine: 2,
  horizontalRayLine: 2,
  horizontalSegment: 2,
  horizontalStraightLine: 1,
  parallelStraightLine: 3,
  priceChannelLine: 3,
  priceLine: 1,
  rayLine: 2,
  segment: 2,
  simpleAnnotation: 1,
  simpleTag: 1,
  straightLine: 2,
  verticalRayLine: 2,
  verticalSegment: 2,
  verticalStraightLine: 1,
};

export interface Anchor {
  time: number;
  price: number;
}

export interface DeskDrawing {
  id: string;
  name: OverlayName;
  points: Anchor[];
  text?: string;
  lock?: boolean;
  mode?: OverlayMode;
}

export function fibonacciLinePrices(firstPrice: number, secondPrice: number): { percent: number; price: number }[] {
  const span = firstPrice - secondPrice;
  return FIBONACCI_LINE_PERCENTS.map((percent) => ({
    percent,
    price: secondPrice + span * percent,
  }));
}

export function toOverlay(drawing: DeskDrawing): OverlayCreate {
  if (!OVERLAY_NAMES.includes(drawing.name)) {
    throw new Error(`unsupported overlay: ${drawing.name}`);
  }
  const minimum = drawing.name === "brush" ? 1 : POINT_COUNT[drawing.name];
  if (drawing.points.length < minimum) {
    throw new Error(`${drawing.name} needs ${minimum} point${minimum === 1 ? "" : "s"}`);
  }
  const overlay: OverlayCreate = {
    id: drawing.id,
    name: drawing.name,
    lock: drawing.lock ?? false,
    points: drawing.points.map((point) => ({ timestamp: point.time, value: point.price })),
  };
  if (drawing.mode) {
    overlay.mode = drawing.mode;
  }
  if (drawing.text != null) {
    overlay.extendData = drawing.text;
  }
  return overlay;
}

export interface DrawingDoc {
  items: DeskDrawing[];
  past: DeskDrawing[][];
  future: DeskDrawing[][];
}

export function emptyDrawingDoc(): DrawingDoc {
  return { items: [], past: [], future: [] };
}

function snapshot(items: readonly DeskDrawing[]): DeskDrawing[] {
  return items.map((item) => ({ ...item, points: item.points.map((point) => ({ ...point })) }));
}

export function addDrawing(doc: DrawingDoc, drawing: DeskDrawing): DrawingDoc {
  if (doc.items.some((item) => item.id === drawing.id)) {
    throw new Error(`drawing id already exists: ${drawing.id}`);
  }
  toOverlay(drawing);
  return { items: [...doc.items, drawing], past: [...doc.past, snapshot(doc.items)], future: [] };
}

export function removeDrawing(doc: DrawingDoc, id: string): DrawingDoc {
  if (!doc.items.some((item) => item.id === id)) {
    throw new Error(`unknown drawing: ${id}`);
  }
  return {
    items: doc.items.filter((item) => item.id !== id),
    past: [...doc.past, snapshot(doc.items)],
    future: [],
  };
}

export function undoDrawing(doc: DrawingDoc): DrawingDoc {
  const previous = doc.past[doc.past.length - 1];
  if (!previous) return doc;
  return { items: previous, past: doc.past.slice(0, -1), future: [...doc.future, snapshot(doc.items)] };
}

export function redoDrawing(doc: DrawingDoc): DrawingDoc {
  const next = doc.future[doc.future.length - 1];
  if (!next) return doc;
  return { items: next, past: [...doc.past, snapshot(doc.items)], future: doc.future.slice(0, -1) };
}
