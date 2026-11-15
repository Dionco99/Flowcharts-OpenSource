// SPDX-License-Identifier: Apache-2.0

import { defaultFilters, tradeMatches } from "../../../packages/journal/src/filter.ts";
import { tradeFromDraft } from "../../../packages/journal/src/record.ts";
import type { Trade } from "../../../packages/journal/src/types.ts";

/** A replay note. The chart snapshot stays empty, so the journal is not linked to the chart. */
export function replayNote(input: { symbol: string; side: "long" | "short"; at: string; r: string }): { trade: Trade } | { error: string } {
  const local = input.at.length === 16 ? input.at : toMinute(input.at);
  return tradeFromDraft({
    id: `replay-${input.symbol}-${input.at}`,
    createdAt: new Date(input.at).toISOString(),
    source: "replay",
    symbol: input.symbol,
    side: input.side,
    openedAt: local,
    closedAt: local,
    setup: "Replay",
    tags: ["replay"],
    notes: "",
    emotions: "",
    ruleAdherence: "followed",
    rResult: input.r,
    snapshotRef: "",
    snapshotId: null,
    sessionRef: "",
  });
}

export function visibleReplay(trades: readonly Trade[]): Trade[] {
  const filters = defaultFilters();
  filters.sources.backtest = false;
  filters.sources.live = false;
  return trades.filter((trade) => tradeMatches(trade, filters));
}

function toMinute(iso: string): string {
  const date = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
