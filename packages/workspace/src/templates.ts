// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceError } from "./errors.js";
import { cloneLayout, parseLayout, stringifyLayout } from "./layout.js";
import type { Layout } from "./types.js";

export interface LayoutStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
  keys(): string[];
}

export function memoryStore(): LayoutStore {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    delete: (key) => {
      values.delete(key);
    },
    keys: () => [...values.keys()],
  };
}

export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStore(storage: KeyValueStorage, prefix = "flowchart.layout."): LayoutStore {
  return {
    get: (key) => storage.getItem(prefix + key),
    set: (key, value) => {
      storage.setItem(prefix + key, value);
    },
    delete: (key) => {
      storage.removeItem(prefix + key);
    },
    keys: () => {
      const names: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) {
          names.push(key.slice(prefix.length));
        }
      }
      return names;
    },
  };
}

export class LayoutBook {
  constructor(private readonly store: LayoutStore) {}

  save(layout: Layout): void {
    const copy = cloneLayout(layout);
    this.store.set(copy.name, stringifyLayout(copy));
  }

  load(name: string): Layout {
    const text = this.store.get(name);
    if (text === null) {
      throw new WorkspaceError("invalid_argument", `layout ${name} is not saved`);
    }
    const layout = parseLayout(text);
    return cloneLayout(layout);
  }

  list(): string[] {
    return this.store.keys().sort();
  }

  remove(name: string): void {
    this.store.delete(name);
  }
}
