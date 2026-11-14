// SPDX-License-Identifier: Apache-2.0

import { buildFixture, decodeTape, TAPE_ID, tapeIdFor, type EventMark, type TapeFile } from "./generate";
import type { Minute } from "@flowchart/bars";

export type LoadedTape = {
  minutes: Minute[];
  events: { time: number; label: string }[];
  tapeId: string;
  source: string;
};

function parseEvents(events: EventMark[]): { time: number; label: string }[] {
  return events
    .map((event) => ({ time: Date.parse(event.time), label: event.label }))
    .filter((event) => Number.isFinite(event.time));
}

export async function loadDefaultTape(): Promise<LoadedTape> {
  try {
    const response = await fetch("/data/eurusd-1m.json");
    if (!response.ok) throw new Error("missing fixture");
    const tape = (await response.json()) as TapeFile;
    const eventsResponse = await fetch("/data/events.json");
    const events = eventsResponse.ok ? ((await eventsResponse.json()) as EventMark[]) : [];
    return { minutes: decodeTape(tape), events: parseEvents(events), tapeId: tape.tapeId || TAPE_ID, source: "fixture" };
  } catch {
    const built = buildFixture();
    return { minutes: built.minutes, events: parseEvents(built.events), tapeId: built.tape.tapeId, source: "generated" };
  }
}

export function parseUserTape(value: unknown): LoadedTape | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.bars) && typeof record.tick === "number") {
    const tape = record as unknown as TapeFile;
    const minutes = decodeTape(tape);
    if (minutes.length === 0) return null;
    const events = Array.isArray(record.events) ? parseEvents(record.events as EventMark[]) : [];
    return { minutes, events, tapeId: tape.tapeId || tapeIdFor(minutes, tape.symbol || "EURUSD"), source: "file" };
  }
  if (!Array.isArray(record.bars)) return null;
  const minutes: Minute[] = [];
  for (const bar of record.bars) {
    if (!bar || typeof bar !== "object") return null;
    const row = bar as Record<string, unknown>;
    const t = typeof row.t === "number" ? row.t : Date.parse(String(row.t ?? ""));
    const o = Number(row.o);
    const h = Number(row.h);
    const l = Number(row.l);
    const c = Number(row.c);
    if (![t, o, h, l, c].every(Number.isFinite)) return null;
    minutes.push({ t, o: o.toFixed(5), h: h.toFixed(5), l: l.toFixed(5), c: c.toFixed(5) });
  }
  if (minutes.length === 0) return null;
  const symbol = typeof record.symbol === "string" ? record.symbol : "EURUSD";
  return { minutes, events: [], tapeId: tapeIdFor(minutes, symbol), source: "file" };
}
