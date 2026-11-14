// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { FillReason, Side } from "./order.ts";

export const FILL_RECORD = "flowchart.fill.v1" as const;

export const FILL_KEYS = [
  "record",
  "source",
  "adapterId",
  "venue",
  "symbol",
  "side",
  "orderId",
  "clientOrderId",
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
] as const;

export interface FlowchartFill {
  record: typeof FILL_RECORD;
  source: "demo" | "live" | "backtest";
  adapterId: string;
  venue: string;
  symbol: string;
  side: Side;
  orderId: string;
  clientOrderId: string;
  lots: string;
  price: string;
  referencePrice: string;
  spread: string;
  spreadCost: string;
  commission: string;
  realizedPnl: string;
  reason: FillReason;
  ambiguous: false;
  time: string;
  barCloseTime: string;
}

export function buildFill(input: Omit<FlowchartFill, "record" | "ambiguous" | "referencePrice" | "spread" | "spreadCost" | "barCloseTime"> & {
  referencePrice?: string;
  spread?: string;
  spreadCost?: string;
  barCloseTime?: string;
}): FlowchartFill {
  const fill: FlowchartFill = {
    record: FILL_RECORD,
    source: input.source,
    adapterId: input.adapterId,
    venue: input.venue,
    symbol: input.symbol,
    side: input.side,
    orderId: input.orderId,
    clientOrderId: input.clientOrderId,
    lots: input.lots,
    price: input.price,
    referencePrice: input.referencePrice ?? input.price,
    spread: input.spread ?? "0",
    spreadCost: input.spreadCost ?? "0",
    commission: input.commission,
    realizedPnl: input.realizedPnl,
    reason: input.reason,
    ambiguous: false,
    time: input.time,
    barCloseTime: input.barCloseTime ?? input.time,
  };
  return fill;
}
