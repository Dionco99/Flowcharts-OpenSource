// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { assertPositiveDecimal, negateDecimal, zeroOrPositive } from "./decimal.js";
import { OrderRejected } from "./errors.js";
import type { OrderSide } from "./model.js";

/** Same object for a live fill, a demo or paper fill, a backtest fill, and a replay fill. */
export type FillSource = "live" | "demo" | "backtest" | "replay";
export type FillReason = "market" | "limit" | "stop" | "stop_loss" | "take_profit" | "close";

export const FILL_KEYS = [
  "schema",
  "id",
  "source",
  "adapterId",
  "venue",
  "symbol",
  "side",
  "lots",
  "price",
  "referencePrice",
  "spread",
  "spreadCost",
  "commission",
  "realizedPnl",
  "reason",
  "ambiguous",
  "time",
  "barCloseTime",
  "orderId",
  "clientOrderId",
] as const;

export interface FillRecord {
  schema: "flowchart.fill.v1";
  id: string;
  source: FillSource;
  adapterId: string;
  venue: string;
  symbol: string;
  side: OrderSide;
  lots: string;
  price: string;
  referencePrice: string;
  spread: string;
  spreadCost: string;
  commission: string;
  realizedPnl: string;
  reason: FillReason;
  ambiguous: boolean;
  time: string;
  barCloseTime: string;
  orderId: string;
  clientOrderId: string;
}

export function fillReason(type: "market" | "limit" | "stop" | "stop_limit", override?: FillReason): FillReason {
  if (override) return override;
  if (type === "market") return "market";
  if (type === "limit") return "limit";
  return "stop";
}

const SOURCES = new Set<FillSource>(["live", "demo", "backtest", "replay"]);
const REASONS = new Set<FillReason>(["market", "limit", "stop", "stop_loss", "take_profit", "close"]);
const SIGNED = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function buildFill(input: {
  id: string;
  source: FillSource;
  adapterId: string;
  venue: string;
  symbol: string;
  side: OrderSide;
  lots: string;
  price: string;
  time: string;
  orderId: string;
  clientOrderId: string;
  reason: FillReason;
  referencePrice?: string;
  spread?: string;
  spreadCost?: string;
  commission?: string;
  realizedPnl?: string;
  ambiguous?: boolean;
  barCloseTime?: string;
}): FillRecord {
  const commission = zeroOrPositive(input.commission, "fill.commission");
  const record: FillRecord = {
    schema: "flowchart.fill.v1",
    id: input.id,
    source: input.source,
    adapterId: input.adapterId,
    venue: input.venue,
    symbol: input.symbol,
    side: input.side,
    lots: input.lots,
    price: input.price,
    referencePrice: input.referencePrice ?? input.price,
    spread: zeroOrPositive(input.spread, "fill.spread"),
    spreadCost: zeroOrPositive(input.spreadCost, "fill.spreadCost"),
    commission,
    realizedPnl: input.realizedPnl ?? negateDecimal(commission),
    reason: input.reason,
    ambiguous: input.ambiguous ?? false,
    time: input.time,
    barCloseTime: input.barCloseTime ?? input.time,
    orderId: input.orderId,
    clientOrderId: input.clientOrderId,
  };
  return assertFillRecord(record);
}

export function assertFillRecord(record: FillRecord): FillRecord {
  const keys = Object.keys(record).sort();
  const expected = [...FILL_KEYS].sort();
  if (keys.join() !== expected.join()) {
    throw new OrderRejected("fill record keys do not match the shared journal stream");
  }
  if (record.schema !== "flowchart.fill.v1") {
    throw new OrderRejected("fill schema must be flowchart.fill.v1");
  }
  if (!SOURCES.has(record.source)) throw new OrderRejected("fill source is not in the shared stream");
  if (!REASONS.has(record.reason)) throw new OrderRejected("fill reason is not in the shared stream");
  if (record.side !== "buy" && record.side !== "sell") throw new OrderRejected("fill side must be buy or sell");
  if (typeof record.ambiguous !== "boolean") throw new OrderRejected("fill ambiguous must be boolean");
  for (const key of FILL_KEYS) {
    if (key === "ambiguous") continue;
    if (typeof record[key] !== "string" || record[key].length === 0) {
      throw new OrderRejected(`fill ${key} must be a non-empty string`);
    }
  }
  assertPositiveDecimal(record.lots, "fill.lots");
  assertPositiveDecimal(record.price, "fill.price");
  assertPositiveDecimal(record.referencePrice, "fill.referencePrice");
  if (record.commission !== "0") assertPositiveDecimal(record.commission, "fill.commission");
  if (record.spread !== "0") assertPositiveDecimal(record.spread, "fill.spread");
  if (record.spreadCost !== "0") assertPositiveDecimal(record.spreadCost, "fill.spreadCost");
  if (!SIGNED.test(record.realizedPnl)) throw new OrderRejected("fill realizedPnl must be a signed decimal");
  if (Number.isNaN(Date.parse(record.time)) || Number.isNaN(Date.parse(record.barCloseTime))) {
    throw new OrderRejected("fill time must be an ISO timestamp");
  }
  const plain: unknown = JSON.parse(JSON.stringify(record));
  if (plain === null || typeof plain !== "object" || Array.isArray(plain)) {
    throw new OrderRejected("fill must be a plain record");
  }
  return record;
}

export class FillJournal {
  readonly records: FillRecord[] = [];

  constructor(private readonly sink?: (line: string) => void) {}

  append(record: FillRecord): FillRecord {
    const plain = assertFillRecord(JSON.parse(JSON.stringify(record)) as FillRecord);
    this.records.push(plain);
    this.sink?.(JSON.stringify(plain));
    return plain;
  }
}

export interface JournalTradeDetails {
  setup: string;
  tags: string[];
  notes: string;
  emotions: string;
  ruleAdherence: "followed" | "partial" | "broken";
  rResult: number;
  snapshotRef: string;
  sessionRef: string;
}

/** Round-trip shape from docs/journal.md. Demo fills stay on the fill stream. */
export interface JournalTrade {
  source: "backtest" | "replay" | "live";
  symbol: string;
  side: "long" | "short";
  openedAt: string;
  closedAt: string;
  setup: string;
  tags: string[];
  notes: string;
  emotions: string;
  ruleAdherence: "followed" | "partial" | "broken";
  rResult: number;
  snapshotRef: string;
  sessionRef: string;
}

export function toJournalTrade(open: FillRecord, close: FillRecord, details: JournalTradeDetails): JournalTrade {
  assertFillRecord(open);
  assertFillRecord(close);
  if (open.source !== close.source) {
    throw new OrderRejected("open and close fills must share a source");
  }
  if (open.source === "demo") {
    throw new OrderRejected(
      "Demo fills stay on the fill stream. The journal trade record has no demo source.",
    );
  }
  if (open.symbol !== close.symbol) {
    throw new OrderRejected("open and close fills must share a symbol");
  }
  return {
    source: open.source,
    symbol: open.symbol,
    side: open.side === "buy" ? "long" : "short",
    openedAt: open.time,
    closedAt: close.time,
    setup: details.setup,
    tags: details.tags,
    notes: details.notes,
    emotions: details.emotions,
    ruleAdherence: details.ruleAdherence,
    rResult: details.rResult,
    snapshotRef: details.snapshotRef,
    sessionRef: details.sessionRef,
  };
}
