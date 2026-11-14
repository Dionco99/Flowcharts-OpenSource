// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Bar } from "../bar.js";

export interface KagiPoint {
  time: number;
  price: number;
}

export interface LineBreakBar {
  time: number;
  open: number;
  close: number;
  direction: "up" | "down";
}

export interface FigureColumn {
  time: number;
  direction: "up" | "down";
  /** Box prices in the order they print. An up column rises. A down column falls. */
  boxes: number[];
}

export interface RangeBar {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface RangeBarResult {
  bars: RangeBar[];
  /** The unfinished tail, when the last path has not traveled a full range. */
  forming: RangeBar | null;
}

function positive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function brickBar(open: number, close: number, time: number, volume: number): Bar {
  return {
    openTime: time,
    closeTime: time,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume,
  };
}

/**
 * Close-based bricks. One brick of movement against the last brick starts a
 * reversal. One close can print several bricks. The first close is the base
 * and is not itself a brick.
 */
export function renko(bars: readonly Bar[], brick: number): Bar[] {
  positive("brick size", brick);
  if (bars.length === 0) {
    return [];
  }
  const out: Bar[] = [];
  let level = bars[0]!.close;
  let direction: 1 | -1 | 0 = 0;

  const emit = (dir: 1 | -1, time: number, volume: number) => {
    const close = level + dir * brick;
    out.push(brickBar(level, close, time, volume));
    level = close;
  };

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const price = bar.close;
    if (direction === 0) {
      const steps = Math.floor(Math.abs(price - level) / brick);
      if (steps < 1) {
        continue;
      }
      direction = price > level ? 1 : -1;
      for (let step = 0; step < steps; step += 1) {
        emit(direction, bar.closeTime, bar.volume);
      }
      continue;
    }
    const same = Math.floor((direction === 1 ? price - level : level - price) / brick);
    if (same >= 1) {
      for (let step = 0; step < same; step += 1) {
        emit(direction, bar.closeTime, bar.volume);
      }
      continue;
    }
    const opposite = Math.floor((direction === 1 ? level - price : price - level) / brick);
    if (opposite >= 1) {
      direction = direction === 1 ? -1 : 1;
      for (let step = 0; step < opposite; step += 1) {
        emit(direction, bar.closeTime, bar.volume);
      }
    }
  }
  return out;
}

/**
 * The line extends to a new extreme and reverses only after the reversal amount.
 * Points are the start, each committed extreme, and the live end.
 */
export function kagi(bars: readonly Bar[], reversal: number): KagiPoint[] {
  positive("reversal amount", reversal);
  if (bars.length === 0) {
    return [];
  }
  const first = bars[0]!;
  const points: KagiPoint[] = [{ time: first.closeTime, price: first.close }];
  let direction: 1 | -1 | 0 = 0;
  let extreme = first.close;

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const price = bar.close;
    if (direction === 0) {
      if (Math.abs(price - extreme) < reversal) {
        continue;
      }
      direction = price > extreme ? 1 : -1;
      extreme = price;
      points.push({ time: bar.closeTime, price });
      continue;
    }
    if ((price - extreme) * direction > 0) {
      extreme = price;
      points[points.length - 1] = { time: bar.closeTime, price };
      continue;
    }
    if ((extreme - price) * direction >= reversal) {
      direction = direction === 1 ? -1 : 1;
      extreme = price;
      points.push({ time: bar.closeTime, price });
    }
  }
  return points;
}

/**
 * A continuation prints when close breaks the last line in the same direction.
 * A reversal prints when close breaks the extreme of the last `count` lines.
 */
export function lineBreak(bars: readonly Bar[], count: number): LineBreakBar[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("line count must be a positive integer");
  }
  const lines: LineBreakBar[] = [];
  if (bars.length === 0) {
    return lines;
  }
  const origin = bars[0]!.close;
  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const price = bar.close;
    const last = lines[lines.length - 1];
    if (last === undefined) {
      if (price === origin) {
        continue;
      }
      lines.push({
        time: bar.closeTime,
        open: origin,
        close: price,
        direction: price > origin ? "up" : "down",
      });
      continue;
    }
    if (last.direction === "up" && price > last.close) {
      lines.push({ time: bar.closeTime, open: last.close, close: price, direction: "up" });
      continue;
    }
    if (last.direction === "down" && price < last.close) {
      lines.push({ time: bar.closeTime, open: last.close, close: price, direction: "down" });
      continue;
    }
    const window = lines.slice(-count);
    if (last.direction === "up") {
      const extreme = Math.min(...window.map((line) => Math.min(line.open, line.close)));
      if (price < extreme) {
        lines.push({ time: bar.closeTime, open: last.close, close: price, direction: "down" });
      }
    } else {
      const extreme = Math.max(...window.map((line) => Math.max(line.open, line.close)));
      if (price > extreme) {
        lines.push({ time: bar.closeTime, open: last.close, close: price, direction: "up" });
      }
    }
  }
  return lines;
}

function boxesFrom(start: number, countBoxes: number, box: number, direction: 1 | -1): number[] {
  return Array.from({ length: countBoxes }, (_, index) => start + direction * (index + 1) * box);
}

/**
 * Box columns. A reversal column starts one box back from the prior extreme
 * and prints once price has moved `reversal` boxes the other way.
 */
export function pointAndFigure(bars: readonly Bar[], box: number, reversal: number): FigureColumn[] {
  positive("box size", box);
  if (!Number.isInteger(reversal) || reversal < 1) {
    throw new Error("reversal must be a positive integer count of boxes");
  }
  if (bars.length === 0) {
    return [];
  }
  const base = bars[0]!.close;
  const columns: FigureColumn[] = [];
  let direction: 1 | -1 | 0 = 0;
  let lastLevel = base;

  const pushColumn = (dir: 1 | -1, boxes: number[], time: number) => {
    columns.push({
      time,
      direction: dir === 1 ? "up" : "down",
      boxes,
    });
    lastLevel = boxes[boxes.length - 1]!;
    direction = dir;
  };

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const price = bar.close;
    if (direction === 0) {
      const up = Math.floor((price - base) / box);
      const down = Math.floor((base - price) / box);
      if (up >= 1) {
        pushColumn(1, boxesFrom(base, up, box, 1), bar.closeTime);
      } else if (down >= 1) {
        pushColumn(-1, boxesFrom(base, down, box, -1), bar.closeTime);
      }
      continue;
    }
    const forward = Math.floor((direction === 1 ? price - lastLevel : lastLevel - price) / box);
    if (forward >= 1) {
      const column = columns[columns.length - 1]!;
      column.boxes.push(...boxesFrom(lastLevel, forward, box, direction));
      column.time = bar.closeTime;
      lastLevel = column.boxes[column.boxes.length - 1]!;
      continue;
    }
    const against = Math.floor((direction === 1 ? lastLevel - price : price - lastLevel) / box);
    if (against >= reversal) {
      const next = direction === 1 ? -1 : 1;
      pushColumn(next, boxesFrom(lastLevel, against, box, next), bar.closeTime);
    }
  }
  return columns;
}

interface PathPoint {
  time: number;
  price: number;
}

/**
 * Bullish bars walk open, low, high, close.
 * Bearish bars walk open, high, low, close.
 * A completed bar is one range of that path, open at one end and close at the other.
 */
function pathOf(bar: Bar): PathPoint[] {
  const bullish = bar.close >= bar.open;
  const prices = bullish
    ? [bar.open, bar.low, bar.high, bar.close]
    : [bar.open, bar.high, bar.low, bar.close];
  const times = [bar.openTime, bar.openTime, bar.closeTime, bar.closeTime];
  const points: PathPoint[] = [];
  for (let i = 0; i < prices.length; i += 1) {
    const price = prices[i]!;
    const time = times[i]!;
    const last = points[points.length - 1];
    if (last !== undefined && last.price === price) {
      last.time = time;
      continue;
    }
    points.push({ time, price });
  }
  return points;
}

function wickless(open: number, close: number, openTime: number, closeTime: number): RangeBar {
  return {
    openTime,
    closeTime,
    open,
    close,
    high: Math.max(open, close),
    low: Math.min(open, close),
  };
}

/** Range bars built by walking each source bar's path until each leg has traveled `range`. */
export function rangeBars(bars: readonly Bar[], range: number): RangeBarResult {
  positive("range", range);
  const points: PathPoint[] = [];
  for (const bar of bars) {
    for (const point of pathOf(bar)) {
      const last = points[points.length - 1];
      if (last !== undefined && last.price === point.price) {
        last.time = point.time;
        continue;
      }
      points.push(point);
    }
  }
  if (points.length === 0) {
    return { bars: [], forming: null };
  }

  const completed: RangeBar[] = [];
  let origin = points[0]!.price;
  let originTime = points[0]!.time;
  let high = origin;
  let low = origin;
  let price = origin;
  let priceTime = originTime;

  for (let i = 1; i < points.length; i += 1) {
    const next = points[i]!;
    let segFrom = price;
    while (true) {
      const upLevel = origin + range;
      const downLevel = origin - range;
      if (next.price > segFrom && segFrom < upLevel && next.price >= upLevel) {
        completed.push(wickless(origin, upLevel, originTime, next.time));
        origin = upLevel;
        originTime = next.time;
        high = origin;
        low = origin;
        segFrom = upLevel;
        continue;
      }
      if (next.price < segFrom && segFrom > downLevel && next.price <= downLevel) {
        completed.push(wickless(origin, downLevel, originTime, next.time));
        origin = downLevel;
        originTime = next.time;
        high = origin;
        low = origin;
        segFrom = downLevel;
        continue;
      }
      break;
    }
    price = next.price;
    priceTime = next.time;
    high = Math.max(high, price);
    low = Math.min(low, price);
  }

  if (price === origin) {
    return { bars: completed, forming: null };
  }
  return {
    bars: completed,
    forming: {
      openTime: originTime,
      closeTime: priceTime,
      open: origin,
      high,
      low,
      close: price,
    },
  };
}
