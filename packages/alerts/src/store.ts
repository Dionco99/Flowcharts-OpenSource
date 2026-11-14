// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const ALERTS_STORAGE_KEY = "flowchart.alerts";
export const WATCHLIST_STORAGE_KEY = "flowchart.watchlists";

export function memoryStore(seed: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(seed));
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

export function browserStore(storage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}): KeyValueStore {
  return {
    get: (key) => storage.getItem(key),
    set: (key, value) => storage.setItem(key, value),
    remove: (key) => storage.removeItem(key),
  };
}
