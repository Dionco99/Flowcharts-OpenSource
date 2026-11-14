// SPDX-License-Identifier: Apache-2.0

import { MINUTE, TF_MS, type Timeframe } from "@flowchart/bars";

export const SPEEDS = [1, 2, 4, 8] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function stepCursor(cursor: number, tf: Timeframe, direction: 1 | -1, min: number, max: number): number {
  const span = TF_MS[tf];
  if (direction > 0) {
    const next = cursor % span === 0 ? cursor + span : Math.ceil(cursor / span) * span;
    return Math.min(next, max);
  }
  const prev = cursor % span === 0 ? cursor - span : Math.floor(cursor / span) * span;
  return Math.max(prev, min);
}

export function zonedParts(ms: number, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) out[part.type] = part.value;
  if (out.hour === "24") out.hour = "00";
  return out;
}

export function formatInstant(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}  ${p.hour}:${p.minute}:${p.second}`;
}

export function formatAxis(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${p.day} ${MONTHS[Number(p.month) - 1]} ${p.hour}:${p.minute}`;
}

export function zonedInputValue(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Interpret a datetime-local value in an IANA zone. */
export function parseZonedInput(value: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return NaN;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const hh = Number(match[4]);
  const mm = Number(match[5]);
  let utc = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(utc, timeZone);
    const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    const target = Date.UTC(y, m - 1, d, hh, mm);
    const delta = target - shown;
    if (delta === 0) break;
    utc += delta;
  }
  return utc;
}

export function nextSessionOpen(cursor: number, sessions: { name: string; openMinute: number }[]): number | null {
  const day = 86_400_000;
  const start = new Date(cursor);
  const base = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  let best: number | null = null;
  for (let add = 0; add < 8; add++) {
    for (const session of sessions) {
      const open = base + add * day + session.openMinute * MINUTE;
      if (open > cursor && (best === null || open < best)) best = open;
    }
  }
  return best;
}
