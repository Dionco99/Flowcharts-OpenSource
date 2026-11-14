// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export const TRADE_SOURCES = ["backtest", "replay", "live"] as const;
export type TradeSource = (typeof TRADE_SOURCES)[number];

export const SIDES = ["long", "short"] as const;
export type Side = (typeof SIDES)[number];

export const RULE_ADHERENCE = ["followed", "partial", "broken"] as const;
export type RuleAdherence = (typeof RULE_ADHERENCE)[number];

export const CANDLE_TYPES = [
  "candle_solid",
  "candle_stroke",
  "candle_up_stroke",
  "candle_down_stroke",
  "ohlc",
  "area",
] as const;
export type CandleType = (typeof CANDLE_TYPES)[number];

export const PRICE_SCALES = ["normal", "logarithm", "percentage"] as const;
export type PriceScale = (typeof PRICE_SCALES)[number];

export const SYNC_KINDS = ["journal", "layout"] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

/** Journal trade fields that sync. The chart image bytes stay on the device. */
export interface JournalEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: TradeSource;
  symbol: string;
  side: Side;
  openedAt: string;
  closedAt: string;
  setup: string;
  tags: string[];
  notes: string;
  emotions: string;
  ruleAdherence: RuleAdherence;
  rResult: number;
  snapshotRef: string;
  snapshotId: string | null;
  sessionRef: string;
}

/**
 * Top-level flowchart.layout version 1 document.
 * Pane, drawing, strategy, and tree items stay JSON. `packages/workspace` owns their shape.
 */
export interface LayoutDocument {
  format: "flowchart.layout";
  version: 1;
  name: string;
  symbol: string;
  candleType: CandleType;
  period: string;
  priceScale: PriceScale;
  timezone: string;
  crosshairSync: boolean;
  panes: unknown[];
  drawings: unknown[];
  strategies: unknown[];
  tree: unknown[];
}

export interface SyncRecordBase {
  accountId: string;
  key: string;
  revision: number;
  changeId: number;
  updatedAt: string;
  deleted: boolean;
}

export interface JournalSyncRecord extends SyncRecordBase {
  kind: "journal";
  entry: JournalEntry | null;
}

export interface LayoutSyncRecord extends SyncRecordBase {
  kind: "layout";
  layout: LayoutDocument | null;
}

export type SyncRecord = JournalSyncRecord | LayoutSyncRecord;

export interface JournalPush {
  kind: "journal";
  key: string;
  baseRevision: number;
  deleted: boolean;
  entry: JournalEntry | null;
}

export interface LayoutPush {
  kind: "layout";
  key: string;
  baseRevision: number;
  deleted: boolean;
  layout: LayoutDocument | null;
}

export type PushInput = JournalPush | LayoutPush;

export interface Session {
  accountId: string;
  displayName: string;
  token: string;
  issuedAt: string;
}

export interface SignUpInput {
  id: string;
  displayName: string;
  passphrase: string;
}

export interface SignInInput {
  id: string;
  passphrase: string;
}

/** One device's session. The roster behind it is the directory the device connected to. */
export interface LocalAuth {
  current(): Session | null;
  signUp(input: SignUpInput): Session;
  signIn(input: SignInInput): Session;
  signOut(): void;
}

export interface SyncClient {
  push(input: PushInput): SyncRecord;
  get(kind: SyncKind, key: string): SyncRecord | null;
  list(kind: SyncKind): SyncRecord[];
  pull(sinceChangeId: number): SyncRecord[];
}

/** Times, session tokens, and passphrase salts. Tests pass a fixed clock. */
export interface AccountsClock {
  now(): string;
  token(): string;
  salt(): Uint8Array;
}
