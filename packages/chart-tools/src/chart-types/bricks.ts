// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.ts";

export interface Brick {
  time: number;
  open: number;
  close: number;
  direction: "up" | "down";
}

function requirePositive(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new Error(`${name} must be positive`);
}

/**
 * Close-based bricks. A reversal of one brick starts a brick the other way.
 * Several bricks can print from one close when it travels more than one brick.
 */
export function renko(bars: readonly Bar[], brickSize: number): Brick[] {
  requirePositive(brickSize, "brickSize");
  if (bars.length === 0) return [];
  const out: Brick[] = [];
  let level = bars[0].close;
  for (let index = 1; index < bars.length; index += 1) {
    const close = bars[index].close;
    while (close - level >= brickSize) {
      const next = level + brickSize;
      out.push({ time: bars[index].time, open: level, close: next, direction: "up" });
      level = next;
    }
    while (level - close >= brickSize) {
      const next = level - brickSize;
      out.push({ time: bars[index].time, open: level, close: next, direction: "down" });
      level = next;
    }
  }
  return out;
}

export interface KagiLine {
  time: number;
  from: number;
  to: number;
  direction: "up" | "down";
  thick: boolean;
}

/** Kagi lines reverse only after price moves `reversal` against the current extreme. */
export function kagi(bars: readonly Bar[], reversal: number): KagiLine[] {
  requirePositive(reversal, "reversal");
  if (bars.length === 0) return [];
  const out: KagiLine[] = [];
  let direction: "up" | "down" | "flat" = "flat";
  let extreme = bars[0].close;
  let shoulder = bars[0].close;
  for (let index = 1; index < bars.length; index += 1) {
    const price = bars[index].close;
    if (direction !== "down" && price >= extreme) {
      extreme = price;
      direction = "up";
      continue;
    }
    if (direction !== "up" && price <= extreme) {
      extreme = price;
      direction = "down";
      continue;
    }
    if (direction === "up" && extreme - price >= reversal) {
      out.push({ time: bars[index].time, from: shoulder, to: extreme, direction: "up", thick: extreme >= shoulder });
      shoulder = extreme;
      extreme = price;
      direction = "down";
    } else if (direction === "down" && price - extreme >= reversal) {
      out.push({ time: bars[index].time, from: shoulder, to: extreme, direction: "down", thick: extreme <= shoulder });
      shoulder = extreme;
      extreme = price;
      direction = "up";
    }
  }
  if (direction === "up" || direction === "down") {
    out.push({ time: bars[bars.length - 1].time, from: shoulder, to: extreme, direction, thick: direction === "up" ? extreme >= shoulder : extreme <= shoulder });
  }
  return out;
}

export interface LineBreak {
  time: number;
  open: number;
  close: number;
  direction: "up" | "down";
}

/**
 * A new line prints when close breaks the last line in the same direction,
 * or breaks the extreme of the previous `lines` lines in the other direction.
 */
export function lineBreak(bars: readonly Bar[], lines = 3): LineBreak[] {
  if (!Number.isInteger(lines) || lines < 1) throw new Error("lines must be a positive integer");
  const out: LineBreak[] = [];
  for (const bar of bars) {
    const close = bar.close;
    if (out.length === 0) {
      out.push({ time: bar.time, open: bars[0].open, close, direction: close >= bars[0].open ? "up" : "down" });
      continue;
    }
    const last = out[out.length - 1];
    const recent = out.slice(-lines);
    const highest = Math.max(...recent.map((line) => Math.max(line.open, line.close)));
    const lowest = Math.min(...recent.map((line) => Math.min(line.open, line.close)));
    if (close > highest) {
      out.push({ time: bar.time, open: last.close, close, direction: "up" });
    } else if (close < lowest) {
      out.push({ time: bar.time, open: last.close, close, direction: "down" });
    }
  }
  return out;
}

export interface PointFigureColumn {
  time: number;
  direction: "up" | "down";
  from: number;
  to: number;
  boxes: number;
}

/**
 * Box columns. A reversal column starts one box back from the prior extreme
 * and needs `reversal` boxes of movement.
 */
export function pointAndFigure(bars: readonly Bar[], boxSize: number, reversal = 3): PointFigureColumn[] {
  requirePositive(boxSize, "boxSize");
  if (!Number.isInteger(reversal) || reversal < 1) throw new Error("reversal must be a positive integer");
  if (bars.length === 0) return [];
  const out: PointFigureColumn[] = [];
  let direction: "up" | "down" = bars.length > 1 && bars[1].close < bars[0].close ? "down" : "up";
  let extreme = bars[0].close;
  let start = bars[0].close;
  let time = bars[0].time;
  const push = (): void => {
    const boxes = Math.round(Math.abs(extreme - start) / boxSize);
    if (boxes > 0) out.push({ time, direction, from: start, to: extreme, boxes });
  };
  for (let index = 1; index < bars.length; index += 1) {
    const close = bars[index].close;
    if (direction === "up") {
      if (close >= extreme + boxSize) {
        extreme = start + Math.floor((close - start) / boxSize) * boxSize;
        time = bars[index].time;
      } else if (extreme - close >= reversal * boxSize) {
        push();
        start = extreme - boxSize;
        extreme = start - Math.floor((start - close) / boxSize) * boxSize;
        direction = "down";
        time = bars[index].time;
      }
    } else if (close <= extreme - boxSize) {
      extreme = start - Math.floor((start - close) / boxSize) * boxSize;
      time = bars[index].time;
    } else if (close - extreme >= reversal * boxSize) {
      push();
      start = extreme + boxSize;
      extreme = start + Math.floor((close - start) / boxSize) * boxSize;
      direction = "up";
      time = bars[index].time;
    }
  }
  push();
  return out;
}

function pathOf(bar: Bar): number[] {
  return bar.close >= bar.open ? [bar.open, bar.low, bar.high, bar.close] : [bar.open, bar.high, bar.low, bar.close];
}

/** Range bars built by walking each bar's open-extreme path. */
export function rangeBars(bars: readonly Bar[], range: number): Bar[] {
  requirePositive(range, "range");
  const out: Bar[] = [];
  let open = bars[0]?.open;
  let high = open;
  let low = open;
  let cursor = open;
  let time = bars[0]?.time ?? 0;
  let volume = 0;
  const emit = (close: number, at: number): void => {
    out.push({ time, open, high: Math.max(high, close), low: Math.min(low, close), close, volume });
    open = close;
    high = close;
    low = close;
    cursor = close;
    time = at;
    volume = 0;
  };
  for (const bar of bars) {
    if (open == null || cursor == null || high == null || low == null) {
      open = bar.open;
      high = bar.open;
      low = bar.open;
      cursor = bar.open;
      time = bar.time;
    }
    const points = pathOf(bar);
    volume += bar.volume;
    for (let index = 1; index < points.length; index += 1) {
      let target = points[index];
      while (cursor != null && Math.abs(target - cursor) >= range - 1e-9) {
        const step = Math.sign(target - cursor) * range;
        const close = cursor + step;
        high = Math.max(high ?? close, close, cursor);
        low = Math.min(low ?? close, close, cursor);
        emit(close, bar.time);
        target = points[index];
      }
      if (cursor != null) {
        high = Math.max(high ?? target, target, cursor);
        low = Math.min(low ?? target, target, cursor);
        cursor = target;
      }
    }
  }
  return out;
}
