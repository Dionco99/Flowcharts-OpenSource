// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { type Bar, assertBars, closedBars } from "./bars.ts";
import {
  type AlertEvent,
  type DeliveryKind,
  type DeliveryPlan,
  type DeliveryPorts,
  type DeliveryReceipt,
  assertDeliveryPlan,
} from "./delivery.ts";
import { AlertsError } from "./errors.ts";
import { type Rule, assertRule, firedOnBar } from "./rules.ts";
import { assertUtc, cmpTime } from "./time.ts";

export interface AlertDraft {
  id?: string;
  symbol: string;
  name: string;
  rule: Rule;
  armedAt: string;
  expiresAt?: string;
  once?: boolean;
  delivery?: DeliveryPlan;
}

export interface AlertRow {
  id: string;
  symbol: string;
  name: string;
  rule: Rule;
  status: "armed" | "fired" | "expired";
  armedAt: string;
  expiresAt?: string;
  firedAt?: string;
  expiredAt?: string;
  cursor?: string;
  message?: string;
  price?: string;
  once: boolean;
  held?: boolean;
  delivery?: DeliveryPlan;
}

export interface FiredAlert {
  row: AlertRow;
  event: AlertEvent;
  receipts: DeliveryReceipt[];
  skipped: DeliveryKind[];
}

export interface SymbolBook {
  symbol: string;
  bars: readonly Bar[];
}

interface AlertsFile {
  format: "flowchart.alerts";
  version: 1;
  evaluatedCursor: string | null;
  rows: AlertRow[];
}

export class AlertLog {
  private rows: AlertRow[] = [];
  private evaluatedCursor: string | null = null;
  private readonly fresh = new Set<string>();

  constructor(private readonly ports: DeliveryPorts = {}) {}

  arm(draft: AlertDraft): AlertRow {
    const symbol = readSymbol(draft.symbol);
    const name = draft.name.trim();
    if (name === "") throw new AlertsError("invalid_argument", "alert name is empty");
    assertRule(draft.rule);
    const armedAt = assertUtc(draft.armedAt, "armedAt");
    const expiresAt = draft.expiresAt === undefined ? undefined : assertUtc(draft.expiresAt, "expiresAt");
    if (expiresAt !== undefined && cmpTime(expiresAt, armedAt) < 0) {
      throw new AlertsError("invalid_argument", "expiresAt is before armedAt");
    }
    assertDeliveryPlan(draft.delivery);
    const id = draft.id ?? crypto.randomUUID();
    if (this.rows.some((row) => row.id === id)) {
      throw new AlertsError("invalid_argument", `alert ${id} already exists`);
    }
    const row: AlertRow = {
      id,
      symbol,
      name,
      rule: draft.rule,
      status: "armed",
      armedAt,
      expiresAt,
      once: draft.once !== false,
      delivery: draft.delivery,
    };
    this.rows.push(row);
    this.fresh.add(id);
    return clone(row);
  }

  expire(id: string, at: string): AlertRow {
    const row = this.must(id);
    const expiredAt = assertUtc(at, "expiredAt");
    row.status = "expired";
    row.expiredAt = expiredAt;
    row.held = true;
    return clone(row);
  }

  /**
   * Walk each symbol's closed bars up to the cursor.
   * A later cursor emits new fires. An earlier cursor recomputes and emits nothing.
   */
  async advance(books: readonly SymbolBook[], cursor: string): Promise<FiredAlert[]> {
    const at = assertUtc(cursor);
    const bySymbol = new Map<string, Bar[]>();
    for (const book of books) {
      bySymbol.set(readSymbol(book.symbol), closedBars(assertBars(book.bars), at));
    }
    if (this.evaluatedCursor !== null && cmpTime(at, this.evaluatedCursor) === 0 && this.fresh.size === 0) {
      return [];
    }
    const backward = this.evaluatedCursor !== null && cmpTime(at, this.evaluatedCursor) < 0;
    const emitAfter = backward ? at : this.evaluatedCursor;
    const fired: FiredAlert[] = [];
    for (const row of this.rows) {
      if (row.held) continue;
      if (row.status === "expired" && !this.fresh.has(row.id) && !backward) continue;
      const window = bySymbol.get(row.symbol) ?? [];
      const events = replay(row, window, this.fresh.has(row.id) ? null : emitAfter);
      if (backward) continue;
      for (const event of events) fired.push(await this.dispatch(row, event));
    }
    this.fresh.clear();
    this.evaluatedCursor = at;
    return fired;
  }

  list(): AlertRow[] {
    return this.rows.map(clone);
  }

  get(id: string): AlertRow {
    return clone(this.must(id));
  }

  cursor(): string | null {
    return this.evaluatedCursor;
  }

  toJSON(): string {
    const file: AlertsFile = {
      format: "flowchart.alerts",
      version: 1,
      evaluatedCursor: this.evaluatedCursor,
      rows: this.rows.map(clone),
    };
    return JSON.stringify(file);
  }

  static fromJSON(text: string, ports: DeliveryPorts = {}): AlertLog {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AlertsError("invalid_argument", "alert log is not JSON");
    }
    if (parsed === null || typeof parsed !== "object") {
      throw new AlertsError("invalid_argument", "alert log is not an object");
    }
    const file = parsed as Partial<AlertsFile>;
    if (file.format !== "flowchart.alerts" || file.version !== 1 || !Array.isArray(file.rows)) {
      throw new AlertsError("invalid_argument", "alert log format is unsupported");
    }
    const log = new AlertLog(ports);
    log.evaluatedCursor = file.evaluatedCursor ?? null;
    if (log.evaluatedCursor !== null) assertUtc(log.evaluatedCursor, "evaluatedCursor");
    for (const row of file.rows) log.rows.push(restore(row));
    return log;
  }

  private must(id: string): AlertRow {
    const row = this.rows.find((item) => item.id === id);
    if (!row) throw new AlertsError("unknown_alert", `alert ${id} is not armed`);
    return row;
  }

  private async dispatch(row: AlertRow, event: AlertEvent): Promise<FiredAlert> {
    const receipts: DeliveryReceipt[] = [];
    const skipped: DeliveryKind[] = [];
    const plan = row.delivery;
    const tasks: Array<Promise<void>> = [];
    const send = async (kind: DeliveryKind, run: () => DeliveryReceipt | Promise<DeliveryReceipt>) => {
      receipts.push(await run());
    };
    if (plan?.webhook) {
      if (this.ports.webhook) tasks.push(send("webhook", () => this.ports.webhook!.deliver(event, plan.webhook!)));
      else skipped.push("webhook");
    }
    if (plan?.email) {
      if (this.ports.email) tasks.push(send("email", () => this.ports.email!.deliver(event, plan.email!)));
      else skipped.push("email");
    }
    if (plan?.push) {
      if (this.ports.push) tasks.push(send("push", () => this.ports.push!.deliver(event, plan.push!)));
      else skipped.push("push");
    }
    if (plan?.sound) {
      if (this.ports.sound) tasks.push(send("sound", () => this.ports.sound!.deliver(event, plan.sound!)));
      else skipped.push("sound");
    }
    await Promise.all(tasks);
    return { row: clone(row), event, receipts, skipped };
  }
}

function replay(row: AlertRow, window: readonly Bar[], emitAfter: string | null): AlertEvent[] {
  row.status = "armed";
  row.firedAt = undefined;
  row.expiredAt = undefined;
  row.cursor = undefined;
  row.message = undefined;
  row.price = undefined;
  const events: AlertEvent[] = [];
  for (let index = 0; index < window.length; index += 1) {
    const bar = window[index];
    if (cmpTime(bar.closeTime, row.armedAt) < 0) continue;
    if (row.expiresAt !== undefined && cmpTime(bar.closeTime, row.expiresAt) > 0) {
      row.status = "expired";
      row.expiredAt = bar.closeTime;
      break;
    }
    if (!firedOnBar(row.rule, window, index)) continue;
    const event: AlertEvent = {
      alertId: row.id,
      symbol: row.symbol,
      name: row.name,
      message: `${row.symbol} ${messageOf(row, index, window)}`,
      cursor: bar.closeTime,
      price: bar.close,
      firedAt: bar.closeTime,
    };
    row.status = "fired";
    row.firedAt = bar.closeTime;
    row.cursor = bar.closeTime;
    row.message = event.message;
    row.price = bar.close;
    if (emitAfter === null || cmpTime(bar.closeTime, emitAfter) > 0) events.push(event);
    if (row.once) break;
  }
  return events;
}

function messageOf(row: AlertRow, index: number, window: readonly Bar[]): string {
  const bar = window[index];
  const text = firedMessage(row, bar);
  return text;
}

function firedMessage(row: AlertRow, bar: Bar): string {
  void bar;
  return row.rule.type === "drawing"
    ? drawingMessage(row)
    : ruleMessage(row);
}

function drawingMessage(row: AlertRow): string {
  const rule = row.rule;
  if (rule.type !== "drawing") return row.name;
  if (rule.drawing.kind === "horizontal") return `range touched ${rule.drawing.price}`;
  return `range touched the ${rule.drawing.kind}`;
}

function ruleMessage(row: AlertRow): string {
  const rule = row.rule;
  if (rule.type === "compare") return `${nameOf(rule.left)} ${opWord(rule.op)} ${nameOf(rule.right)}`;
  if (rule.type === "cross") {
    const dir = rule.direction === "down" ? "below" : rule.direction === "up" ? "above" : "through";
    return `${nameOf(rule.left)} crossed ${dir} ${nameOf(rule.right)}`;
  }
  if (rule.type === "channel") return `${nameOf(rule.value)} ${rule.event === "enter" ? "entered" : "left"} the channel`;
  if (rule.type === "percent") {
    const dir = rule.direction === "down" ? "fell" : rule.direction === "up" ? "rose" : "moved";
    return `${nameOf(rule.source)} ${dir} ${rule.percent}% over ${rule.lookback} bars`;
  }
  return row.name;
}

function nameOf(ref: { kind: string; source?: string; value?: string; name?: string; plot?: string }): string {
  if (ref.kind === "level") return ref.value ?? "";
  if (ref.kind === "price") return ref.source ?? "";
  if (ref.kind === "indicator") return ref.plot ?? ref.name ?? "indicator";
  return "series";
}

function opWord(op: string): string {
  if (op === "gt") return "rose above";
  if (op === "gte") return "reached";
  if (op === "lt") return "fell below";
  if (op === "lte") return "fell to";
  return "equaled";
}

function readSymbol(symbol: string): string {
  const text = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,32}$/.test(text)) {
    throw new AlertsError("invalid_argument", "symbol must be 1 to 32 letters, digits, dots, or dashes");
  }
  return text;
}

function clone(row: AlertRow): AlertRow {
  return structuredClone(row);
}

function restore(value: unknown): AlertRow {
  if (value === null || typeof value !== "object") {
    throw new AlertsError("invalid_argument", "alert row is missing");
  }
  const row = value as AlertRow;
  readSymbol(row.symbol);
  assertRule(row.rule);
  assertUtc(row.armedAt, "armedAt");
  if (row.expiresAt !== undefined) assertUtc(row.expiresAt, "expiresAt");
  assertDeliveryPlan(row.delivery);
  if (row.status !== "armed" && row.status !== "fired" && row.status !== "expired") {
    throw new AlertsError("invalid_argument", "alert status is unknown");
  }
  if (typeof row.id !== "string" || row.id === "") {
    throw new AlertsError("invalid_argument", "alert id is empty");
  }
  return clone(row);
}
