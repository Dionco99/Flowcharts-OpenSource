// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { AccountsError } from "./errors.ts";
import {
  CANDLE_TYPES,
  PRICE_SCALES,
  RULE_ADHERENCE,
  SIDES,
  TRADE_SOURCES,
  type JournalEntry,
  type LayoutDocument,
} from "./types.ts";

const MAX_JSON = 1_000_000;
const MAX_KEY = 80;
const MAX_TAGS = 24;
const MAX_TAG = 40;
const MAX_NOTES = 20_000;
const MAX_SHORT = 200;
const MAX_SYMBOL = 32;

export function readJournalEntry(value: unknown): JournalEntry {
  const row = record(value, "A journal entry");
  const snapshotId =
    row.snapshotId === null || row.snapshotId === ""
      ? null
      : syncKey(row.snapshotId, "snapshot id");
  const entry: JournalEntry = {
    id: syncKey(row.id, "journal id"),
    createdAt: timeOf(row.createdAt, "createdAt"),
    updatedAt: timeOf(row.updatedAt, "updatedAt"),
    source: oneOf(row.source, TRADE_SOURCES, "source"),
    symbol: symbolOf(row.symbol),
    side: oneOf(row.side, SIDES, "side"),
    openedAt: timeOf(row.openedAt, "openedAt"),
    closedAt: timeOf(row.closedAt, "closedAt"),
    setup: requiredText(row.setup, "setup", MAX_SHORT),
    tags: tagsOf(row.tags),
    notes: textOf(row.notes, "notes", MAX_NOTES),
    emotions: textOf(row.emotions, "emotions", MAX_NOTES),
    ruleAdherence: oneOf(row.ruleAdherence, RULE_ADHERENCE, "rule adherence"),
    rResult: rOf(row.rResult),
    snapshotRef: textOf(row.snapshotRef, "snapshotRef", MAX_SHORT),
    snapshotId,
    sessionRef: textOf(row.sessionRef, "sessionRef", MAX_SHORT),
  };
  return copyJson(entry, "journal entry");
}

export function readLayoutDocument(value: unknown): LayoutDocument {
  const row = record(value, "A layout");
  if (row.format !== "flowchart.layout") {
    throw new AccountsError("invalid_record", "A layout format must be flowchart.layout.");
  }
  if (row.version !== 1) {
    throw new AccountsError("invalid_record", "A layout version must be 1.");
  }
  const panes = arrayOf(row.panes, "panes");
  if (panes.length < 1 || panes.length > 8) {
    throw new AccountsError("invalid_record", "A layout has one to eight panes.");
  }
  if (typeof row.crosshairSync !== "boolean") {
    throw new AccountsError("invalid_record", "Crosshair sync must be true or false.");
  }
  const document: LayoutDocument = {
    format: "flowchart.layout",
    version: 1,
    name: syncKey(row.name, "layout name"),
    symbol: requiredText(row.symbol, "layout symbol", MAX_SYMBOL),
    candleType: oneOf(row.candleType, CANDLE_TYPES, "candle type"),
    period: periodOf(row.period),
    priceScale: oneOf(row.priceScale, PRICE_SCALES, "price scale"),
    timezone: requiredText(row.timezone, "timezone", MAX_KEY),
    crosshairSync: row.crosshairSync,
    panes,
    drawings: arrayOf(row.drawings, "drawings"),
    strategies: arrayOf(row.strategies, "strategies"),
    tree: arrayOf(row.tree, "tree"),
  };
  return copyJson(document, "layout");
}

export function syncKey(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new AccountsError("invalid_record", `${label} must be a string.`);
  }
  const key = value.trim();
  if (!key || key.length > MAX_KEY || /\p{C}/u.test(key)) {
    throw new AccountsError("invalid_record", `${label} must be 1 to ${MAX_KEY} characters.`);
  }
  return key;
}

export function copyJson<T>(value: T, label: string): T {
  try {
    const text = JSON.stringify(value, (_key, item) => {
      if (
        item === undefined ||
        typeof item === "function" ||
        typeof item === "symbol" ||
        typeof item === "bigint"
      ) {
        throw new TypeError("not json");
      }
      return item as unknown;
    });
    if (typeof text !== "string" || text.length > MAX_JSON) {
      throw new TypeError("size");
    }
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof AccountsError) throw error;
    throw new AccountsError("invalid_record", `${label} must be JSON under ${MAX_JSON} characters.`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AccountsError("invalid_record", `${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === "string") {
    const found = allowed.find((item) => item === value);
    if (found) return found;
  }
  throw new AccountsError("invalid_record", `${label} must be one of ${allowed.join(", ")}.`);
}

function symbolOf(value: unknown): string {
  const symbol = requiredText(value, "symbol", MAX_SYMBOL).toUpperCase();
  if (/\p{C}/u.test(symbol)) {
    throw new AccountsError("invalid_record", "symbol must be 1 to 32 characters.");
  }
  return symbol;
}

function requiredText(value: unknown, label: string, max: number): string {
  const text = textOf(value, label, max);
  if (!text) {
    throw new AccountsError("invalid_record", `${label} is required.`);
  }
  return text;
}

function textOf(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") {
    throw new AccountsError("invalid_record", `${label} must be a string.`);
  }
  const text = value.trim();
  if (text.length > max || /\p{C}/u.test(text)) {
    throw new AccountsError("invalid_record", `${label} must be at most ${max} characters.`);
  }
  return text;
}

function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AccountsError("invalid_record", "tags must be an array.");
  }
  if (value.length > MAX_TAGS) {
    throw new AccountsError("invalid_record", `A journal entry keeps up to ${MAX_TAGS} tags.`);
  }
  return value.map((tag, index) => requiredText(tag, `tag ${index + 1}`, MAX_TAG));
}

function rOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AccountsError("invalid_record", "rResult must be a finite number.");
  }
  return value;
}

function timeOf(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AccountsError("invalid_record", `${label} must be an ISO timestamp.`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new AccountsError("invalid_record", `${label} must be an ISO timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function periodOf(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,3}[mhD]$/.test(value)) {
    throw new AccountsError("invalid_record", "period must look like 7m, 2h, or 3D.");
  }
  return value;
}

function arrayOf(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new AccountsError("invalid_record", `${label} must be an array.`);
  }
  return value;
}
