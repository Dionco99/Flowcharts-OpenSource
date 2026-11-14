// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { CursorRecord } from "./types.js";

export function syncCursors(
  records: CursorRecord[],
  time: string | null,
  enabled: boolean,
  sourceId: string,
): CursorRecord[] {
  if (!enabled) {
    return records.map((record) =>
      record.paneId === sourceId ? { paneId: record.paneId, time } : { ...record },
    );
  }
  return records.map((record) => ({ paneId: record.paneId, time }));
}
