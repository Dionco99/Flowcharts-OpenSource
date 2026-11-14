// SPDX-License-Identifier: Apache-2.0

import type { Minute } from "@flowchart/bars";

export const TAPE_ID = "eurusd-generated-v1";
export const TICK = 0.00001;

/** A wide minute inside the London/New York overlap, so an ambiguous fill can be reached. */
export const SPIKE_OPEN = Date.parse("2026-11-04T13:00:00Z");
/** Hand-built OHLC for matcher tests. The fixture spike is this wide, centered on the prior close. */
export const SPIKE = { o: 1.09, h: 1.0925, l: 1.0875, c: 1.091 };
const SPIKE_HALF = 0.0025;

const START = Date.parse("2026-10-18T22:00:00Z");
const END = Date.parse("2026-11-13T22:00:00Z");

export type TapeFile = {
  tapeId: string;
  source: "generated";
  symbol: "EURUSD";
  tick: number;
  bars: Array<[number, number, number, number, number]>;
};

export type EventMark = { time: string; label: string };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function marketOpen(t: number): boolean {
  const d = new Date(t);
  const day = d.getUTCDay();
  const minute = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 6) return false;
  if (day === 0 && minute < 22 * 60) return false;
  if (day === 5 && minute >= 22 * 60) return false;
  return true;
}

function toTick(price: number): number {
  return Math.round(price / TICK);
}

function fromTick(ticks: number): number {
  return ticks * TICK;
}

/** Synthetic EURUSD minute tape. Not a vendor history file. */
export function buildFixture(seed = 20261114): { tape: TapeFile; events: EventMark[]; minutes: Minute[] } {
  const rng = mulberry32(seed);
  const raw: { t: number; o: number; h: number; l: number; c: number }[] = [];
  let price = 1.085;
  const anchor = Math.log(1.085);
  let logP = anchor;
  for (let t = START; t < END; t += 60_000) {
    if (!marketOpen(t)) continue;
    if (t === SPIKE_OPEN) {
      const open = fromTick(toTick(price));
      const bar = {
        t,
        o: open,
        h: fromTick(toTick(open + SPIKE_HALF)),
        l: fromTick(toTick(open - SPIKE_HALF)),
        c: fromTick(toTick(open + 0.001)),
      };
      raw.push(bar);
      price = bar.c;
      logP = Math.log(price);
      continue;
    }
    const hour = new Date(t).getUTCHours();
    let vol = 0.000045;
    if (hour < 7) vol *= 0.72;
    else if (hour < 12) vol *= 1.2;
    else if (hour < 16) vol *= 1.65;
    else if (hour < 21) vol *= 1.15;
    else vol *= 0.6;
    let shock = gauss(rng) * vol;
    if (rng() < 0.0022) shock += (rng() < 0.5 ? -1 : 1) * (0.0007 + rng() * 0.0016);
    logP += shock + (anchor - logP) * 0.00035;
    const close = fromTick(toTick(Math.exp(logP)));
    const open = price;
    const wick = Math.abs(gauss(rng)) * vol * (0.35 + rng());
    const high = fromTick(toTick(Math.max(open, close) + wick * rng()));
    const low = fromTick(toTick(Math.min(open, close) - wick * (1 - rng())));
    raw.push({ t, o: open, h: Math.max(high, open, close), l: Math.min(low, open, close), c: close });
    price = close;
  }
  const tape: TapeFile = {
    tapeId: TAPE_ID,
    source: "generated",
    symbol: "EURUSD",
    tick: TICK,
    bars: raw.map((bar) => [bar.t / 1000, toTick(bar.o), toTick(bar.h), toTick(bar.l), toTick(bar.c)]),
  };
  const events: EventMark[] = [
    { time: "2026-10-21T12:30:00Z", label: "CPI" },
    { time: "2026-10-28T12:30:00Z", label: "Claims" },
    { time: "2026-10-29T08:30:00Z", label: "ECB" },
    { time: "2026-11-04T18:00:00Z", label: "FOMC" },
    { time: "2026-11-06T09:00:00Z", label: "PMI" },
    { time: "2026-11-13T12:30:00Z", label: "NFP" },
  ];
  const minutes: Minute[] = raw.map((bar) => ({
    t: bar.t,
    o: bar.o.toFixed(5),
    h: bar.h.toFixed(5),
    l: bar.l.toFixed(5),
    c: bar.c.toFixed(5),
  }));
  return { tape, events, minutes };
}

export function decodeTape(tape: TapeFile): Minute[] {
  return tape.bars.map(([sec, o, h, l, c]) => ({
    t: sec * 1000,
    o: (o * tape.tick).toFixed(5),
    h: (h * tape.tick).toFixed(5),
    l: (l * tape.tick).toFixed(5),
    c: (c * tape.tick).toFixed(5),
  }));
}

export function tapeIdFor(minutes: Minute[], symbol: string): string {
  const first = minutes[0]?.t ?? 0;
  return `user:${symbol}:${first}:${minutes.length}`;
}
