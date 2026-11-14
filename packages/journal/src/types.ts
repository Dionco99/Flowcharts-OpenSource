// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export const SOURCES = ["backtest", "replay", "live"] as const;
export type TradeSource = (typeof SOURCES)[number];

export const SIDES = ["long", "short"] as const;
export type Side = (typeof SIDES)[number];

export const ADHERENCE = ["followed", "partial", "broken"] as const;
export type RuleAdherence = (typeof ADHERENCE)[number];

export interface Trade {
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

export interface Filters {
  query: string;
  sources: Record<TradeSource, boolean>;
  tag: string;
  adherence: "any" | RuleAdherence;
  result: "any" | "win" | "loss" | "scratch";
}

export interface TradeDraft {
  id: string;
  createdAt: string;
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
  rResult: string;
  snapshotRef: string;
  snapshotId: string | null;
  sessionRef: string;
}
