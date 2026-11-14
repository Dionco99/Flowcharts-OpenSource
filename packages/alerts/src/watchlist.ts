// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { type Bar, assertBars, closedBars } from "./bars.ts";
import { percentChange, subDecimal } from "./decimal.ts";
import { AlertsError } from "./errors.ts";
import { assertUtc } from "./time.ts";

export interface SymbolInfo {
  symbol: string;
  name?: string;
  venue?: string;
}

export interface WatchItem {
  symbol: string;
  label?: string;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchItem[];
}

export interface WatchQuote {
  symbol: string;
  label?: string;
  last: string | null;
  previous: string | null;
  change: string | null;
  changePercent: string | null;
}

interface WatchlistFile {
  format: "flowchart.watchlists";
  version: 1;
  lists: Watchlist[];
}

export class WatchlistBook {
  private readonly listsById: Watchlist[] = [];

  create(name: string, id?: string): Watchlist {
    const label = name.trim();
    if (label === "") throw new AlertsError("invalid_argument", "watchlist name is empty");
    const nextId = id ?? crypto.randomUUID();
    if (this.listsById.some((list) => list.id === nextId)) {
      throw new AlertsError("invalid_argument", `watchlist ${nextId} already exists`);
    }
    const list: Watchlist = { id: nextId, name: label, items: [] };
    this.listsById.push(list);
    return cloneList(list);
  }

  rename(id: string, name: string): Watchlist {
    const list = this.must(id);
    const label = name.trim();
    if (label === "") throw new AlertsError("invalid_argument", "watchlist name is empty");
    list.name = label;
    return cloneList(list);
  }

  delete(id: string): void {
    const index = this.listsById.findIndex((list) => list.id === id);
    if (index < 0) throw new AlertsError("unknown_watchlist", `watchlist ${id} does not exist`);
    this.listsById.splice(index, 1);
  }

  add(id: string, item: WatchItem): Watchlist {
    const list = this.must(id);
    const symbol = readSymbol(item.symbol);
    const label = item.label?.trim();
    const existing = list.items.find((row) => row.symbol === symbol);
    if (existing) existing.label = label || undefined;
    else list.items.push({ symbol, label: label || undefined });
    return cloneList(list);
  }

  remove(id: string, symbol: string): Watchlist {
    const list = this.must(id);
    const key = readSymbol(symbol);
    list.items = list.items.filter((item) => item.symbol !== key);
    return cloneList(list);
  }

  lists(): Watchlist[] {
    return this.listsById.map(cloneList);
  }

  get(id: string): Watchlist {
    return cloneList(this.must(id));
  }

  search(query: string, catalog: readonly SymbolInfo[]): SymbolInfo[] {
    const needle = query.trim().toLowerCase();
    return catalog
      .map((row) => ({ ...row, symbol: readSymbol(row.symbol) }))
      .filter((row) => {
        if (needle === "") return true;
        return [row.symbol, row.name ?? "", row.venue ?? ""].some((part) => part.toLowerCase().includes(needle));
      });
  }

  quotes(id: string, tapes: readonly { symbol: string; bars: readonly Bar[] }[], cursor: string): WatchQuote[] {
    assertUtc(cursor);
    const list = this.must(id);
    const bySymbol = new Map<string, Bar[]>();
    for (const tape of tapes) bySymbol.set(readSymbol(tape.symbol), closedBars(assertBars(tape.bars), cursor));
    return list.items.map((item) => quoteItem(item, bySymbol.get(item.symbol) ?? []));
  }

  toJSON(): string {
    const file: WatchlistFile = {
      format: "flowchart.watchlists",
      version: 1,
      lists: this.lists(),
    };
    return JSON.stringify(file);
  }

  static fromJSON(text: string): WatchlistBook {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AlertsError("invalid_argument", "watchlist file is not JSON");
    }
    if (parsed === null || typeof parsed !== "object") {
      throw new AlertsError("invalid_argument", "watchlist file is not an object");
    }
    const file = parsed as Partial<WatchlistFile>;
    if (file.format !== "flowchart.watchlists" || file.version !== 1 || !Array.isArray(file.lists)) {
      throw new AlertsError("invalid_argument", "watchlist format is unsupported");
    }
    const book = new WatchlistBook();
    for (const list of file.lists) {
      if (list === null || typeof list !== "object" || typeof list.name !== "string" || typeof list.id !== "string") {
        throw new AlertsError("invalid_argument", "watchlist is missing an id or a name");
      }
      const created = book.create(list.name, list.id);
      for (const item of list.items ?? []) book.add(created.id, item);
    }
    return book;
  }

  private must(id: string): Watchlist {
    const list = this.listsById.find((item) => item.id === id);
    if (!list) throw new AlertsError("unknown_watchlist", `watchlist ${id} does not exist`);
    return list;
  }
}

export function searchSymbols(query: string, catalog: readonly SymbolInfo[]): SymbolInfo[] {
  return new WatchlistBook().search(query, catalog);
}

function quoteItem(item: WatchItem, bars: readonly Bar[]): WatchQuote {
  if (bars.length === 0) {
    return { symbol: item.symbol, label: item.label, last: null, previous: null, change: null, changePercent: null };
  }
  const last = bars[bars.length - 1].close;
  if (bars.length === 1) {
    return { symbol: item.symbol, label: item.label, last, previous: null, change: null, changePercent: null };
  }
  const previous = bars[bars.length - 2].close;
  return {
    symbol: item.symbol,
    label: item.label,
    last,
    previous,
    change: subDecimal(last, previous),
    changePercent: percentChange(last, previous, 4),
  };
}

function readSymbol(symbol: string): string {
  const text = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,32}$/.test(text)) {
    throw new AlertsError("invalid_argument", "symbol must be 1 to 32 letters, digits, dots, or dashes");
  }
  return text;
}

function cloneList(list: Watchlist): Watchlist {
  return structuredClone(list);
}
