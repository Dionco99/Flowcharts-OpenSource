// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { type Bar, type Tape, assertBars } from "./bars.ts";
import { Decimal } from "./decimal.ts";
import { AlertsError } from "./errors.ts";
import { addMinutes } from "./time.ts";

export interface GenerateOptions {
  symbol?: string;
  seed?: number;
  count?: number;
  start?: string;
  startPrice?: string;
  tickSize?: string;
  driftTicks?: number;
  noiseTicks?: number;
  baseVolume?: string;
  lastVolume?: string;
  timezone?: string;
}

/**
 * A synthetic tape. The path is a seeded walk in ticks.
 * Nothing here is a market-data file.
 */
export function generateTape(options: GenerateOptions = {}): Tape {
  const symbol = (options.symbol ?? "EURUSD").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,32}$/.test(symbol)) {
    throw new AlertsError("invalid_argument", "symbol must be 1 to 32 letters, digits, dots, or dashes");
  }
  const count = options.count ?? 32;
  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new AlertsError("invalid_argument", "count must be from 1 to 5000");
  }
  const tickSize = options.tickSize ?? "0.00001";
  const tick = Decimal.parse(tickSize);
  if (tick.cmp(Decimal.zero()) <= 0) throw new AlertsError("invalid_argument", "tickSize must be positive");
  const drift = options.driftTicks ?? 0;
  const noise = options.noiseTicks ?? 0;
  if (!Number.isInteger(drift) || !Number.isInteger(noise) || noise < 0) {
    throw new AlertsError("invalid_argument", "driftTicks and noiseTicks must be integers");
  }
  const start = options.start ?? "2024-06-03T13:00:00Z";
  const startPrice = Decimal.parse(options.startPrice ?? "1.10000");
  const baseVolume = Decimal.parse(options.baseVolume ?? "100");
  const lastVolume = options.lastVolume === undefined ? null : Decimal.parse(options.lastVolume);
  const random = mulberry32(options.seed ?? 20240602);
  let close = startPrice;
  const bars: Bar[] = [];
  for (let i = 0; i < count; i += 1) {
    const open = close;
    if (i > 0) {
      const wobble = noise === 0 ? 0 : Math.floor(random() * (noise * 2 + 1)) - noise;
      close = close.add(tick.mul(Decimal.int(BigInt(drift + wobble))));
    } else if (noise > 0) {
      random();
    }
    const high = Decimal.max(open, close).add(tick);
    const low = Decimal.min(open, close).sub(tick);
    const volume = i === count - 1 && lastVolume ? lastVolume : baseVolume;
    const openTime = addMinutes(start, i);
    bars.push({
      openTime,
      closeTime: addMinutes(start, i + 1),
      open: open.toString(),
      high: high.toString(),
      low: low.toString(),
      close: close.toString(),
      volume: volume.toString(),
    });
  }
  const tape: Tape = {
    format: "flowchart.tape",
    version: 1,
    spec: { symbol, tickSize, timezone: options.timezone ?? "America/New_York" },
    bars: assertBars(bars),
  };
  return tape;
}

function mulberry32(seed: number): () => number {
  if (!Number.isInteger(seed)) throw new AlertsError("invalid_argument", "seed must be an integer");
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
