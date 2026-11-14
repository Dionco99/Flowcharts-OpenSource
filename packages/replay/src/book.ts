// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { ReplayClock, type ReplayClockOptions } from "./playback";
import { ReplayError } from "./errors";

export interface DrawingRecord {
  id: string;
  kind: string;
  [key: string]: unknown;
}

export interface WorkingOrderRecord {
  id: string;
  clientOrderId: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop";
  lots: string;
  [key: string]: unknown;
}

export interface SessionFillRecord {
  id: string;
  time: number;
  lots: string;
  price: string;
  side: "buy" | "sell";
  [key: string]: unknown;
}

/** Version 1 session file. Reopen pauses on the saved cursor. */
export interface SessionDocument {
  version: 1;
  symbol: string;
  cursor: number;
  timeframeMinutes: number;
  speed: number;
  timeZone: string;
  drawings: DrawingRecord[];
  workingOrders: WorkingOrderRecord[];
  fills: SessionFillRecord[];
}

export interface ReplaySessionOptions extends ReplayClockOptions {
  symbol: string;
}

/**
 * Cursor plus the drawings, working orders, and fills stored with it.
 * Loading a bad file leaves the open session untouched.
 */
export class ReplaySession {
  readonly symbol: string;
  readonly clock: ReplayClock;
  private drawingBook: DrawingRecord[] = [];
  private orderBook: WorkingOrderRecord[] = [];
  private fillBook: SessionFillRecord[] = [];

  constructor(options: ReplaySessionOptions) {
    if (typeof options.symbol !== "string" || options.symbol.trim() === "") {
      throw new ReplayError("bad_symbol", "A session needs a symbol.");
    }
    this.symbol = options.symbol;
    this.clock = new ReplayClock(options);
  }

  get drawings(): readonly DrawingRecord[] {
    return this.drawingBook;
  }

  get workingOrders(): readonly WorkingOrderRecord[] {
    return this.orderBook;
  }

  get fills(): readonly SessionFillRecord[] {
    return this.fillBook;
  }

  setDrawings(drawings: readonly DrawingRecord[]): void {
    this.drawingBook = validateDrawings(drawings);
  }

  setWorkingOrders(orders: readonly WorkingOrderRecord[]): void {
    this.orderBook = validateOrders(orders);
  }

  setFills(fills: readonly SessionFillRecord[]): void {
    this.fillBook = validateFills(fills);
  }

  exportDocument(): SessionDocument {
    return {
      version: 1,
      symbol: this.symbol,
      cursor: this.clock.cursor,
      timeframeMinutes: this.clock.timeframeMinutes,
      speed: this.clock.speed,
      timeZone: this.clock.timeZone,
      drawings: clone(this.drawingBook),
      workingOrders: clone(this.orderBook),
      fills: clone(this.fillBook),
    };
  }

  /**
   * Reopen on the saved candle. Playback stays paused.
   * A mismatched symbol, version, or cursor leaves this session as it was.
   */
  loadDocument(document: unknown): void {
    const next = parseDocument(document, this.symbol, this.clock.tape);
    this.clock.restore(next.cursor, next.timeframeMinutes, next.speed, next.timeZone);
    this.drawingBook = next.drawings;
    this.orderBook = next.workingOrders;
    this.fillBook = next.fills;
  }
}

function parseDocument(
  document: unknown,
  symbol: string,
  tape: { firstClose: number; lastClose: number },
): SessionDocument {
  if (!isRecord(document)) throw new ReplayError("session_version", "The session file is not a document.");
  if (document.version !== 1) throw new ReplayError("session_version", "The session file version is not 1.");
  if (document.symbol !== symbol) {
    throw new ReplayError("session_symbol", "The session file is for a different symbol.");
  }
  if (typeof document.cursor !== "number" || !Number.isFinite(document.cursor)) {
    throw new ReplayError("session_cursor", "The session cursor is not a timestamp.");
  }
  if (document.cursor < tape.firstClose || document.cursor > tape.lastClose) {
    throw new ReplayError("session_cursor", "The session cursor is outside this tape.");
  }
  if (!Number.isInteger(document.timeframeMinutes) || (document.timeframeMinutes as number) <= 0) {
    throw new ReplayError("bad_timeframe", "The session timeframe is not a positive whole number of minutes.");
  }
  if (typeof document.speed !== "number" || !Number.isFinite(document.speed) || document.speed <= 0) {
    throw new ReplayError("bad_speed", "The session speed is not a positive number.");
  }
  if (typeof document.timeZone !== "string") {
    throw new ReplayError("bad_timezone", "The session timezone is missing.");
  }
  return {
    version: 1,
    symbol,
    cursor: document.cursor,
    timeframeMinutes: document.timeframeMinutes as number,
    speed: document.speed,
    timeZone: document.timeZone,
    drawings: validateDrawings(document.drawings),
    workingOrders: validateOrders(document.workingOrders),
    fills: validateFills(document.fills),
  };
}

function validateDrawings(value: unknown): DrawingRecord[] {
  if (!Array.isArray(value)) throw new ReplayError("bad_drawings", "Drawings must be a list.");
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "" || typeof entry.kind !== "string" || entry.kind === "") {
      throw new ReplayError("bad_drawings", "Each drawing needs an id and a kind.");
    }
    return clone(entry) as DrawingRecord;
  });
}

function validateOrders(value: unknown): WorkingOrderRecord[] {
  if (!Array.isArray(value)) throw new ReplayError("bad_orders", "Working orders must be a list.");
  return value.map((entry) => {
    if (!isRecord(entry)) throw new ReplayError("bad_orders", "A working order must be an object.");
    if (typeof entry.id !== "string" || entry.id === "") throw new ReplayError("bad_orders", "A working order needs an id.");
    if (typeof entry.clientOrderId !== "string" || entry.clientOrderId === "") {
      throw new ReplayError("bad_orders", "A working order needs a client order id.");
    }
    if (entry.side !== "buy" && entry.side !== "sell") throw new ReplayError("bad_orders", "A working order side is buy or sell.");
    if (entry.type !== "market" && entry.type !== "limit" && entry.type !== "stop") {
      throw new ReplayError("bad_orders", "A working order type is market, limit, or stop.");
    }
    if (typeof entry.lots !== "string" || entry.lots === "") throw new ReplayError("bad_orders", "A working order needs a size.");
    return clone(entry) as WorkingOrderRecord;
  });
}

function validateFills(value: unknown): SessionFillRecord[] {
  if (!Array.isArray(value)) throw new ReplayError("bad_fills", "Fills must be a list.");
  return value.map((entry) => {
    if (!isRecord(entry)) throw new ReplayError("bad_fills", "A fill must be an object.");
    if (typeof entry.id !== "string" || entry.id === "") throw new ReplayError("bad_fills", "A fill needs an id.");
    if (typeof entry.time !== "number" || !Number.isFinite(entry.time)) throw new ReplayError("bad_fills", "A fill needs a time.");
    if (typeof entry.lots !== "string" || typeof entry.price !== "string") {
      throw new ReplayError("bad_fills", "A fill needs lots and a price.");
    }
    if (entry.side !== "buy" && entry.side !== "sell") throw new ReplayError("bad_fills", "A fill side is buy or sell.");
    return clone(entry) as SessionFillRecord;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
