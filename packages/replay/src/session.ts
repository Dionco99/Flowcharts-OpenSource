// SPDX-License-Identifier: Apache-2.0

import type { Timeframe } from "@flowchart/bars";
import type { CancelRecord, Fill, OrderRecord } from "@flowchart/orders";
import type { Drawing } from "@flowchart/chart-tools";

export type StudySetting = {
  id: string;
  enabled: boolean;
  params: Record<string, number>;
};

export type PaneSetting = {
  id: string;
  timeframe: Timeframe;
};

/** Cursor, drawings, working orders, and fills. Replay restores by running the orders again. */
export type SessionFile = {
  version: 1;
  tapeId: string;
  savedAt: number;
  cursor: number;
  timezone: string;
  tradingTimeframe: Timeframe;
  speed: number;
  follow: boolean;
  panes: PaneSetting[];
  studies: StudySetting[];
  strategy: boolean;
  drawings: Drawing[];
  orders: OrderRecord[];
  cancels: CancelRecord[];
  fills: Fill[];
};

const KEY = "flowchart.session.v1";

export function loadSession(): SessionFile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionFile;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(file: SessionFile): void {
  localStorage.setItem(KEY, JSON.stringify(file));
}

export function downloadSession(file: SessionFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "flowchart-session.json";
  link.click();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}
