// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { protectionsAllowed } from "./capabilities.ts";
import { add, assertDecimal, cmp, isPositive } from "./decimal.ts";
import { createDriver, type Credentials, type DriverContext, type DriverResult, type VenueDriver } from "./drivers.ts";
import { BrokerError, type BrokerResult } from "./errors.ts";
import { buildFill, type FlowchartFill } from "./fill.ts";
import { assertFundedNext, type FundedNextProfile } from "./fundednext.ts";
import { assertCanSendLive, createGuardedClient, type Env, type HttpClient } from "./guard.ts";
import { normalizeOrder, type FillReason, type PlaceOrder, type Side } from "./order.ts";
import { applyFill, flatPosition, realizedForFill, type Position } from "./position.ts";
import { redact } from "./redact.ts";
import type { CredentialVault } from "./vault.ts";

export interface WorkingOrder {
  id: string;
  clientOrderId: string;
  side: Side;
  type: "market" | "limit" | "stop";
  lots: string;
  limitPrice: string | null;
  stopPrice: string | null;
  stopLoss: string | null;
  takeProfit: string | null;
}

export interface Snapshot {
  symbol: string;
  position: Position;
  orders: WorkingOrder[];
  fills: FlowchartFill[];
  realizedPnl: string;
  unrealizedPnl: string;
  commission: string;
}

export interface Ack {
  adapterId: string;
  venue: string;
  orderId: string;
  clientOrderId: string;
  status: "filled" | "accepted" | "mapped";
  transmitted: boolean;
  warnings: string[];
  fill?: FlowchartFill;
  request?: unknown;
}

export interface CloseOrder {
  clientOrderId: string;
  lots?: string;
  confirmRealMoney?: boolean;
}

export interface BrokerPort {
  readonly adapterId: string;
  readonly venue: string;
  place(order: PlaceOrder): Promise<BrokerResult<Ack>>;
  modify(orderId: string): Promise<BrokerResult<never>>;
  cancel(orderId: string, confirmRealMoney?: boolean): Promise<BrokerResult<{ orderId: string }>>;
  close(order: CloseOrder): Promise<BrokerResult<Ack>>;
  modifyProtection(): Promise<BrokerResult<never>>;
  snapshot(): Snapshot;
}

export interface CreateBrokerOptions {
  venue: string;
  symbol: string;
  mode?: "demo" | "paper" | "live" | "backtest";
  http?: HttpClient;
  env?: Env;
  credentials?: Credentials;
  vault?: CredentialVault;
  credentialId?: string;
  now?: string | (() => string);
  markPrice?: string;
  commission?: string;
  lotSize?: string;
  fundedNext?: FundedNextProfile | null;
  ccxt?: DriverContext["ccxt"];
  ctraderSymbols?: Record<string, string>;
  ctraderTransport?: DriverContext["transport"];
  ibkr?: { accountId: string; conid: number };
  routes?: DriverContext["routes"];
}

const REJECTED = new Set(["metaapi", "rithmic", "cqg"]);

export function createBroker(options: CreateBrokerOptions): BrokerPort {
  const venue = options.venue.trim().toLowerCase();
  if (REJECTED.has(venue)) throw new BrokerError("adapter_rejected", `${venue} is not a Flowchart venue.`);
  if (typeof options.symbol !== "string" || options.symbol.trim() === "") {
    throw new BrokerError("invalid_order", "A broker port is one symbol.");
  }
  const mode = options.mode ?? (venue === "backtest" ? "backtest" : "demo");
  if (venue === "backtest" && mode !== "backtest") {
    throw new BrokerError("mode_mismatch", "The backtest adapter does not send to a venue.");
  }
  if (venue !== "backtest" && mode === "backtest") {
    throw new BrokerError("mode_mismatch", "Only the backtest adapter uses backtest mode.");
  }
  const driver = createDriver(venue);
  return new BrokerSession(driver, { ...options, venue, mode });
}

class BrokerSession implements BrokerPort {
  readonly adapterId: string;
  readonly venue: string;
  private readonly mode: "demo" | "paper" | "live" | "backtest";
  private readonly symbol: string;
  private readonly env: Env;
  private readonly http: HttpClient;
  private readonly vault: CredentialVault | undefined;
  private readonly credentialId: string | undefined;
  private readonly stored: Credentials;
  private readonly funded: FundedNextProfile | null;
  private readonly now: string | (() => string) | undefined;
  private readonly markPrice: string | undefined;
  private readonly commissionDefault: string;
  private readonly lotSize: string;
  private readonly ccxt: DriverContext["ccxt"];
  private readonly ctraderSymbols: Record<string, string> | undefined;
  private readonly transport: DriverContext["transport"];
  private readonly ibkr: { accountId: string; conid: number } | undefined;
  private readonly routes: DriverContext["routes"];
  private readonly driver: VenueDriver;
  private orders = new Map<string, WorkingOrder>();
  private fills: FlowchartFill[] = [];
  private position: Position = flatPosition();
  private realized = "0";
  private commission = "0";
  private sent = new Map<string, Ack>();

  constructor(driver: VenueDriver, options: CreateBrokerOptions & { venue: string; mode: "demo" | "paper" | "live" | "backtest" }) {
    this.driver = driver;
    this.adapterId = driver.adapterId;
    this.venue = options.venue;
    this.mode = options.mode;
    this.symbol = options.symbol;
    this.env = options.env ?? process.env;
    this.vault = options.vault;
    this.credentialId = options.credentialId;
    this.stored = options.credentials ?? {};
    this.funded = options.fundedNext ?? null;
    this.now = options.now;
    this.markPrice = options.markPrice;
    this.commissionDefault = options.commission ?? "0";
    this.lotSize = options.lotSize ?? "1";
    this.ccxt = options.ccxt;
    this.ctraderSymbols = options.ctraderSymbols;
    this.transport = options.ctraderTransport;
    this.ibkr = options.ibkr;
    this.routes = options.routes;
    const raw = options.http ?? { async request() { throw new BrokerError("client_required", "No HTTP client was provided."); } };
    this.http = createGuardedClient(raw, { allowLive: options.mode === "live", env: this.env });
  }

  snapshot(): Snapshot {
    return {
      symbol: this.symbol,
      position: { ...this.position },
      orders: [...this.orders.values()].map((order) => ({ ...order })),
      fills: this.fills.map((fill) => ({ ...fill })),
      realizedPnl: this.realized,
      unrealizedPnl: "0",
      commission: this.commission,
    };
  }

  async place(order: PlaceOrder): Promise<BrokerResult<Ack>> {
    return this.guard(async () => {
      const cached = this.cached(order.clientOrderId);
      if (cached) return cached;
      const normalized = normalizeOrder(order);
      const warnings = this.gate(normalized.confirmRealMoney);
      this.ensureProtections(normalized);
      const result = await this.driver.place(normalized, this.context());
      return this.commit(normalized, result, warnings, normalized.type);
    });
  }

  async close(order: CloseOrder): Promise<BrokerResult<Ack>> {
    return this.guard(async () => {
      const cached = this.cached(order.clientOrderId);
      if (cached) return cached;
      const warnings = this.gate(order.confirmRealMoney === true);
      if (this.position.side === "flat") throw new BrokerError("position_flat", "There is no position to close.");
      const lots = order.lots ?? this.position.lots;
      assertDecimal(lots, "lots");
      if (!isPositive(lots) || cmp(lots, this.position.lots) > 0) {
        throw new BrokerError("invalid_size", "Close size must be positive and no larger than the position.");
      }
      const side: Side = this.position.side === "long" ? "sell" : "buy";
      const normalized = normalizeOrder({
        clientOrderId: order.clientOrderId,
        side,
        type: "market",
        lots,
        confirmRealMoney: order.confirmRealMoney === true,
      });
      const result = await this.driver.place(normalized, this.context());
      return this.commit(normalized, result, warnings, "close");
    });
  }

  async modify(orderId: string): Promise<BrokerResult<never>> {
    return this.guard(async () => {
      assertFundedNext(this.funded);
      if (!this.orders.has(orderId)) throw new BrokerError("order_not_working", "That order is not working.");
      throw new BrokerError("modify_unsupported", "This adapter does not amend a venue order.");
    });
  }

  async modifyProtection(): Promise<BrokerResult<never>> {
    return this.guard(async () => {
      assertFundedNext(this.funded);
      if (this.position.side === "flat") throw new BrokerError("order_not_working", "There is no position protection to amend.");
      throw new BrokerError("modify_unsupported", "This adapter does not amend a venue order.");
    });
  }

  async cancel(orderId: string, confirmRealMoney = false): Promise<BrokerResult<{ orderId: string }>> {
    return this.guard(async () => {
      this.gate(confirmRealMoney);
      if (!this.orders.has(orderId)) throw new BrokerError("order_not_working", "That order is not working.");
      await this.driver.cancel(orderId, this.context());
      this.orders.delete(orderId);
      return { orderId };
    });
  }

  private cached(clientOrderId: unknown): Ack | undefined {
    if (typeof clientOrderId !== "string") return undefined;
    return this.sent.get(clientOrderId);
  }

  private gate(confirmRealMoney: boolean): string[] {
    const warnings = assertFundedNext(this.funded);
    if (this.mode === "live") assertCanSendLive(confirmRealMoney, this.env);
    return warnings;
  }

  private ensureProtections(order: ReturnType<typeof normalizeOrder>): void {
    if ((order.stopLoss || order.takeProfit) && !protectionsAllowed(this.venue, order.type)) {
      throw new BrokerError("protection_not_supported", `${this.venue} cannot attach a stop or target on a ${order.type} order.`);
    }
  }

  private context(): DriverContext {
    return {
      symbol: this.symbol,
      mode: this.mode,
      http: this.http,
      now: this.stamp(),
      ...(this.markPrice !== undefined ? { markPrice: this.markPrice } : {}),
      commission: this.commissionDefault,
      credentials: this.credentials(),
      ...(this.ccxt ? { ccxt: this.ccxt } : {}),
      ...(this.ctraderSymbols ? { ctraderSymbols: this.ctraderSymbols } : {}),
      ...(this.transport ? { transport: this.transport } : {}),
      ...(this.ibkr ? { ibkr: this.ibkr } : {}),
      ...(this.routes ? { routes: this.routes } : {}),
    };
  }

  private credentials(): Credentials {
    if (this.vault && this.credentialId) {
      const stored = this.vault.get(this.credentialId);
      return { ...this.stored, ...stored };
    }
    return this.stored;
  }

  private stamp(): string {
    if (typeof this.now === "function") return this.now();
    if (typeof this.now === "string") return this.now;
    return new Date().toISOString();
  }

  private commit(order: ReturnType<typeof normalizeOrder>, result: DriverResult, warnings: string[], reason: FillReason): Ack {
    let fill: FlowchartFill | undefined;
    if (result.status === "filled" && result.price) {
      const commission = result.commission ?? "0";
      const lots = result.lots ?? order.lots;
      const realizedPnl = realizedForFill(this.position, order.side, lots, result.price, commission, this.lotSize);
      fill = buildFill({
        source: this.mode === "live" ? "live" : this.mode === "backtest" ? "backtest" : "demo",
        adapterId: this.adapterId,
        venue: this.venue,
        symbol: this.symbol,
        side: order.side,
        orderId: result.orderId,
        clientOrderId: order.clientOrderId,
        lots,
        price: result.price,
        commission,
        realizedPnl,
        reason,
        time: result.time ?? this.stamp(),
      });
      this.position = applyFill(this.position, order.side, lots, result.price);
      this.fills.push(fill);
      this.realized = add(this.realized, realizedPnl);
      this.commission = add(this.commission, commission);
    } else if (result.status === "accepted") {
      this.orders.set(result.orderId, {
        id: result.orderId,
        clientOrderId: order.clientOrderId,
        side: order.side,
        type: order.type,
        lots: order.lots,
        limitPrice: order.limitPrice,
        stopPrice: order.stopPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
      });
    }
    const ack: Ack = {
      adapterId: this.adapterId,
      venue: this.venue,
      orderId: result.orderId,
      clientOrderId: order.clientOrderId,
      status: result.status,
      transmitted: result.transmitted,
      warnings,
      ...(fill ? { fill } : {}),
      ...(result.request !== undefined ? { request: result.request } : {}),
    };
    this.sent.set(order.clientOrderId, ack);
    return ack;
  }

  private async guard<T>(run: () => Promise<T>): Promise<BrokerResult<T>> {
    const before = this.capture();
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      this.restore(before);
      const secrets = this.secretValues();
      if (error instanceof BrokerError) {
        return { ok: false, code: error.code, message: redact(error.message, secrets) };
      }
      const message = error instanceof Error ? error.message : "Venue request failed.";
      return { ok: false, code: "venue_error", message: redact(message, secrets) };
    }
  }

  private secretValues(): string[] {
    try {
      return Object.values(this.credentials()).filter((value): value is string => typeof value === "string");
    } catch {
      return Object.values(this.stored).filter((value): value is string => typeof value === "string");
    }
  }

  private capture(): string {
    return JSON.stringify({
      orders: [...this.orders],
      fills: this.fills,
      position: this.position,
      realized: this.realized,
      commission: this.commission,
      sent: [...this.sent],
    });
  }

  private restore(captured: string): void {
    const state = JSON.parse(captured) as {
      orders: [string, WorkingOrder][];
      fills: FlowchartFill[];
      position: Position;
      realized: string;
      commission: string;
      sent: [string, Ack][];
    };
    this.orders = new Map(state.orders);
    this.fills = state.fills;
    this.position = state.position;
    this.realized = state.realized;
    this.commission = state.commission;
    this.sent = new Map(state.sent);
  }
}
