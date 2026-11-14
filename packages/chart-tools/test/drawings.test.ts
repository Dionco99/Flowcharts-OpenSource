// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { Bar } from "../src/bar.js";
import {
  parallelChannel,
  pitchfork,
} from "../src/figures/channels.js";
import {
  applyAnchorEdit,
  drawingsAfterSeek,
  setLock,
  snapPrice,
  type EditableDrawing,
} from "../src/figures/edits.js";
import {
  fibonacciExtension,
  fibonacciFan,
  fibonacciRetracement,
  fibonacciTimeZones,
  fibonacciZoneOffsets,
} from "../src/figures/fibonacci.js";
import { chartLabel } from "../src/figures/labels.js";
import {
  horizontalPrice,
  linePrice,
  verticalCoverage,
  verticalCoversPrice,
} from "../src/figures/lines.js";
import { positionPlan } from "../src/figures/position.js";
import { brushHits, inEllipse, inRectangle, inTriangle } from "../src/figures/shapes.js";

const a = { time: 0, price: 0 };
const b = { time: 10, price: 10 };

describe("lines", () => {
  it("prices a segment, a ray, and an extended line", () => {
    expect(linePrice(a, b, 5, "segment")).toBe(5);
    expect(linePrice(a, b, 11, "segment")).toBeNull();
    expect(linePrice(a, b, -1, "segment")).toBeNull();
    expect(linePrice(a, b, 20, "ray")).toBe(20);
    expect(linePrice(a, b, -1, "ray")).toBeNull();
    expect(linePrice(a, b, -10, "extended")).toBe(-10);
    expect(linePrice(b, a, -10, "ray")).toBe(-10);
  });
});

describe("horizontal and vertical", () => {
  it("prices horizontal lines, rays, and segments", () => {
    const start = { time: 5, price: 10 };
    expect(horizontalPrice(start, null, 0, "horizontal")).toBe(10);
    expect(horizontalPrice(start, { time: 8, price: 4 }, 100, "horizontalRay")).toBe(10);
    expect(horizontalPrice(start, { time: 8, price: 4 }, 4, "horizontalRay")).toBeNull();
    expect(horizontalPrice(start, { time: 2, price: 4 }, 0, "horizontalRay")).toBe(10);
    expect(horizontalPrice(start, { time: 2, price: 4 }, 9, "horizontalRay")).toBeNull();
    expect(horizontalPrice(start, { time: 9, price: 1 }, 7, "horizontalSegment")).toBe(10);
    expect(horizontalPrice(start, { time: 9, price: 1 }, 4, "horizontalSegment")).toBeNull();
  });

  it("covers vertical lines, rays, and segments", () => {
    const start = { time: 5, price: 10 };
    const line = verticalCoverage(start, null, "vertical");
    expect(line.time).toBe(5);
    expect(verticalCoversPrice(line, -100)).toBe(true);
    const ray = verticalCoverage(start, { time: 5, price: 14 }, "verticalRay");
    expect(verticalCoversPrice(ray, 10)).toBe(true);
    expect(verticalCoversPrice(ray, 12)).toBe(true);
    expect(verticalCoversPrice(ray, 9)).toBe(false);
    const segment = verticalCoverage(start, { time: 8, price: 14 }, "verticalSegment");
    expect(segment.time).toBe(5);
    expect(verticalCoversPrice(segment, 12)).toBe(true);
    expect(verticalCoversPrice(segment, 15)).toBe(false);
  });
});

describe("fibonacci", () => {
  it("puts 100% on the first retracement anchor and projects the extension, fan, and time zones", () => {
    const levels = fibonacciRetracement({ time: 0, price: 110 }, { time: 1, price: 100 });
    expect(levels.find((level) => level.ratio === 1)?.price).toBe(110);
    expect(levels.find((level) => level.ratio === 0)?.price).toBe(100);
    expect(levels.find((level) => level.ratio === 0.5)?.price).toBe(105);

    const extension = fibonacciExtension(
      { time: 0, price: 100 },
      { time: 1, price: 110 },
      { time: 2, price: 105 },
    );
    expect(extension.find((level) => level.ratio === 1)?.price).toBe(115);
    expect(extension.find((level) => level.ratio === 1.618)?.price).toBeCloseTo(121.18);

    const fan = fibonacciFan(a, b, 10);
    expect(fan.find((level) => level.ratio === 0.5)?.price).toBe(5);

    expect(fibonacciZoneOffsets(6)).toEqual([0, 1, 2, 3, 5, 8]);
    expect(fibonacciTimeZones(1_000, 60_000, 4)).toEqual([1_000, 61_000, 121_000, 181_000]);
  });
});

describe("channels", () => {
  it("offsets a parallel channel in price and builds three pitchforks", () => {
    const channel = parallelChannel(a, b, { time: 0, price: 2 });
    expect(channel.offset).toBe(2);
    expect(channel.base(4)).toBe(4);
    expect(channel.parallel(4)).toBe(6);
    expect(channel.midline(4)).toBe(5);

    const first = { time: 0, price: 10 };
    const second = { time: 10, price: 14 };
    const third = { time: 10, price: 6 };
    const andrews = pitchfork(first, second, third, "andrews");
    expect(andrews.median(10)).toBe(10);
    expect(andrews.upper(10)).toBe(14);
    expect(andrews.lower(10)).toBe(6);
    expect(andrews.upperMid(10)).toBe(12);

    const schiff = pitchfork(first, second, third, "schiff");
    expect(schiff.origin).toEqual({ time: 5, price: 12 });
    expect(schiff.median(10)).toBe(10);
    expect(schiff.upper(10)).toBe(14);

    const modified = pitchfork(first, second, third, "modifiedSchiff");
    expect(modified.origin).toEqual({ time: 0, price: 12 });
    expect(modified.median(10)).toBeCloseTo(10);
  });
});

describe("shapes", () => {
  it("tests a rectangle, an ellipse, a triangle, and a brush", () => {
    const corner = { time: 0, price: 0 };
    const opposite = { time: 10, price: 10 };
    expect(inRectangle({ time: 10, price: 10 }, corner, opposite)).toBe(true);
    expect(inRectangle({ time: 11, price: 5 }, corner, opposite)).toBe(false);
    expect(inEllipse({ time: 5, price: 5 }, corner, opposite)).toBe(true);
    expect(inEllipse({ time: 10, price: 5 }, corner, opposite)).toBe(true);
    expect(inEllipse({ time: 10, price: 10 }, corner, opposite)).toBe(false);
    expect(inTriangle({ time: 0, price: 0 }, corner, { time: 10, price: 0 }, { time: 0, price: 10 })).toBe(true);
    expect(inTriangle({ time: 2, price: 2 }, corner, { time: 10, price: 0 }, { time: 0, price: 10 })).toBe(true);
    expect(inTriangle({ time: 6, price: 6 }, corner, { time: 10, price: 0 }, { time: 0, price: 10 })).toBe(false);

    const path = [corner, { time: 10, price: 0 }];
    expect(brushHits(path, { time: 5, price: 0.2 }, 0.3)).toBe(true);
    expect(brushHits(path, { time: 5, price: 0.2 }, 0.1)).toBe(false);
    expect(brushHits([], { time: 0, price: 0 }, 1)).toBe(false);
  });
});

describe("labels and the position tool", () => {
  it("stores text, note, callout, and price labels", () => {
    for (const kind of ["text", "note", "callout", "price"] as const) {
      const label = chartLabel(kind, kind, { time: 3, price: 1.25 }, "hello");
      expect(label.kind).toBe(kind);
      expect(label.anchor.price).toBe(1.25);
      expect(label.text).toBe("hello");
    }
  });

  it("reports R for a long and a short, and rejects a stop on the wrong side", () => {
    expect(positionPlan("long", 10, 9, 12)).toMatchObject({ risk: 1, reward: 2, r: 2 });
    expect(positionPlan("short", 10, 12, 7)).toMatchObject({ risk: 2, reward: 3, r: 1.5 });
    expect(() => positionPlan("long", 10, 11, 12)).toThrow(/stop below/);
    expect(() => positionPlan("short", 10, 9, 8)).toThrow(/stop above/);
  });
});

describe("drawing edits", () => {
  const drawing: EditableDrawing = {
    id: "level",
    locked: false,
    magnet: "normal",
    anchors: [{ time: 5, price: 10 }],
  };
  const pointerBar: Bar = {
    openTime: 0,
    closeTime: 60_000,
    open: 10,
    high: 12,
    low: 8,
    close: 11,
    volume: 1,
  };

  it("locks a drawing, snaps the magnet, and leaves anchors put across a seek", () => {
    const locked = setLock(drawing, true);
    const edited = applyAnchorEdit(locked, [{ time: 9, price: 1 }]);
    expect(edited).toBe(locked);
    expect(edited.anchors).toEqual([{ time: 5, price: 10 }]);

    const open = applyAnchorEdit(drawing, [{ time: 9, price: 1 }]);
    expect(open.anchors).toEqual([{ time: 9, price: 1 }]);
    expect(drawing.anchors).toEqual([{ time: 5, price: 10 }]);

    expect(snapPrice("normal", 13, pointerBar, 0.5)).toBe(13);
    expect(snapPrice("weak_magnet", 11.2, pointerBar, 0.5)).toBe(11);
    expect(snapPrice("weak_magnet", 13, pointerBar, 0.5)).toBe(13);
    expect(snapPrice("strong_magnet", 13, pointerBar, 0.5)).toBe(12);

    const early = drawingsAfterSeek([drawing], 0);
    const late = drawingsAfterSeek([drawing], 1_000_000);
    expect(early[0]!.anchors).toEqual(drawing.anchors);
    expect(late[0]!.anchors).toEqual(drawing.anchors);
    expect(early[0]!.anchors).not.toBe(drawing.anchors);
  });
});
