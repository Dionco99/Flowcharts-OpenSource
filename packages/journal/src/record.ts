// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { RuleAdherence, Side, Trade, TradeDraft, TradeSource } from "./types.ts";
import { ADHERENCE, SIDES, SOURCES } from "./types.ts";
import { roundR } from "./filter.ts";

const MAX_TEXT = 20000;
const MAX_SHORT = 200;
const MAX_TAGS = 24;
const MAX_TAG_LENGTH = 40;

export function parseR(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? roundR(value) : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/[Rr]/g, "").replace(/\s+/g, "");
  if (!trimmed || trimmed === "+" || trimmed === "-" || trimmed === "." || trimmed === "-." || trimmed === "+.") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return roundR(parsed);
}

export function formatR(value: number): string {
  const rounded = roundR(value);
  const body = Math.abs(rounded).toFixed(2);
  if (rounded > 0) return `+${body}R`;
  if (rounded < 0) return `−${body}R`;
  return `${body}R`;
}

export function formatWhen(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toLocalInput(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export function nowLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

export function newDraft(): TradeDraft {
  const now = new Date().toISOString();
  const local = toLocalInput(now);
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    source: "replay",
    symbol: "",
    side: "long",
    openedAt: local,
    closedAt: local,
    setup: "",
    tags: [],
    notes: "",
    emotions: "",
    ruleAdherence: "followed",
    rResult: "",
    snapshotRef: "",
    snapshotId: null,
    sessionRef: "",
  };
}

export function draftFromTrade(trade: Trade): TradeDraft {
  return {
    id: trade.id,
    createdAt: trade.createdAt,
    source: trade.source,
    symbol: trade.symbol,
    side: trade.side,
    openedAt: toLocalInput(trade.openedAt),
    closedAt: toLocalInput(trade.closedAt),
    setup: trade.setup,
    tags: [...trade.tags],
    notes: trade.notes,
    emotions: trade.emotions,
    ruleAdherence: trade.ruleAdherence,
    rResult: Number.isFinite(trade.rResult) ? String(trade.rResult) : "",
    snapshotRef: trade.snapshotRef,
    snapshotId: trade.snapshotId,
    sessionRef: trade.sessionRef,
  };
}

export function tradeFromDraft(draft: TradeDraft, now = new Date().toISOString()): { trade: Trade } | { error: string } {
  const symbol = draft.symbol.trim().toUpperCase();
  if (!symbol) return { error: "Enter a symbol." };
  const setup = draft.setup.trim();
  if (!setup) return { error: "Enter a setup or strategy." };
  const rResult = parseR(draft.rResult);
  if (rResult === null) return { error: "Enter an R result, such as 1.5 or -0.5." };
  const openedAt = fromLocalInput(draft.openedAt);
  const closedAt = fromLocalInput(draft.closedAt);
  if (!openedAt || !closedAt) return { error: "Enter an open and a close time." };

  return {
    trade: {
      id: draft.id,
      createdAt: draft.createdAt || now,
      updatedAt: now,
      source: draft.source,
      symbol,
      side: draft.side,
      openedAt,
      closedAt,
      setup,
      tags: normalizeTags(draft.tags),
      notes: clip(draft.notes, MAX_TEXT),
      emotions: clip(draft.emotions, MAX_TEXT),
      ruleAdherence: draft.ruleAdherence,
      rResult,
      snapshotRef: clip(draft.snapshotRef.trim(), MAX_SHORT),
      snapshotId: draft.snapshotId,
      sessionRef: clip(draft.sessionRef.trim(), MAX_SHORT),
    },
  };
}

export function addTag(tags: string[], raw: string): { tags: string[]; error: string } {
  const pieces = raw
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (pieces.length === 0) return { tags, error: "" };
  const next = [...tags];
  for (const piece of pieces) {
    if (piece.length > MAX_TAG_LENGTH) {
      return { tags: next, error: `Tags stay under ${MAX_TAG_LENGTH} characters.` };
    }
    if (next.length >= MAX_TAGS) {
      return { tags: next, error: `A trade keeps up to ${MAX_TAGS} tags.` };
    }
    const key = piece.toLowerCase();
    if (next.some((tag) => tag.toLowerCase() === key)) continue;
    next.push(piece);
  }
  return { tags: next, error: "" };
}

export function normalizeTrade(input: unknown): Trade | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const symbol = stringField(row.symbol, 32).toUpperCase();
  const setup = stringField(row.setup, MAX_SHORT);
  if (!symbol || !setup) return null;
  const source = oneOf(row.source, SOURCES);
  const side = oneOf(row.side, SIDES) ?? "long";
  const ruleAdherence = oneOf(row.ruleAdherence, ADHERENCE);
  const rResult = parseR(row.rResult);
  if (!source || !ruleAdherence || rResult === null) return null;

  const now = new Date().toISOString();
  const id = stringField(row.id, 80) || crypto.randomUUID();
  const createdAt = timeField(row.createdAt) || now;
  const openedAt = timeField(row.openedAt) || createdAt;
  const closedAt = timeField(row.closedAt) || openedAt;

  return {
    id,
    createdAt,
    updatedAt: timeField(row.updatedAt) || now,
    source,
    symbol,
    side,
    openedAt,
    closedAt,
    setup,
    tags: tagsField(row.tags),
    notes: stringField(row.notes, MAX_TEXT),
    emotions: stringField(row.emotions, MAX_TEXT),
    ruleAdherence,
    rResult,
    snapshotRef: stringField(row.snapshotRef, MAX_SHORT),
    snapshotId: stringField(row.snapshotId, 80) || null,
    sessionRef: stringField(row.sessionRef, MAX_SHORT),
  };
}

export function tradesFromImport(input: unknown): Trade[] {
  const rows = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { trades?: unknown }).trades)
      ? (input as { trades: unknown[] }).trades
      : null;
  if (!rows) return [];
  const trades: Trade[] = [];
  for (const row of rows) {
    const trade = normalizeTrade(row);
    if (trade) trades.push(trade);
  }
  return trades;
}

export function safeImageRef(ref: string): string | null {
  try {
    const url = new URL(ref);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

function normalizeTags(tags: string[]): string[] {
  const result = addTag([], tags.join(", "));
  return result.tags;
}

function tagsField(value: unknown): string[] {
  if (typeof value === "string") return addTag([], value).tags;
  if (!Array.isArray(value)) return [];
  return addTag([], value.filter((item) => typeof item === "string").join(", ")).tags;
}

function stringField(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return clip(value.trim(), max);
}

function timeField(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const found = allowed.find((item) => item === value);
  return found ?? null;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function sourceLabel(source: TradeSource): string {
  if (source === "backtest") return "Backtest";
  if (source === "replay") return "Replay";
  return "Live";
}

export function sideLabel(side: Side): string {
  return side === "long" ? "Long" : "Short";
}

export function adherenceLabel(adherence: RuleAdherence): string {
  if (adherence === "followed") return "Followed";
  if (adherence === "partial") return "Partial";
  return "Broken";
}
