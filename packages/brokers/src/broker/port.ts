// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "../brokers/adapter.js";
import type { VenueCapabilities } from "../orders/model.js";
import type { ExecutionContext } from "../orders/guard.js";
import {
  BrokerRequestError,
  DemoUnavailable,
  InterfaceOnlyError,
  LiveNetworkDisabled,
  OrderRejected,
  PropFirmAutomationBlocked,
  ProtectionNotSupported,
  RealMoneyConfirmationRequired,
} from "../orders/errors.js";
import type { FillRecord } from "../orders/journal.js";
import { protectionsVisible, type OrderIntent, type OrderSide } from "../orders/model.js";

/**
 * Strategy surface from the order model. One instance is one symbol.
 * Venue adapters may throw; this port returns `ok: false` and leaves the book unchanged.
 */
export interface PlaceOrder {
  clientOrderId: string;
  side: OrderSide;
  type: "market" | "limit" | "stop";
  lots: string;
  limitPrice?: string;
  stopPrice?: string;
  stopLoss?: string | null;
  takeProfit?: string | null;
}

export interface ModifyOrder {
  orderId: string;
  lots?: string;
  limitPrice?: string;
  stopPrice?: string;
  stopLoss?: string | null;
  takeProfit?: string | null;
}

export interface CloseOrder {
  clientOrderId: string;
  lots?: string;
}

export interface ModifyProtection {
  stopLoss?: string | null;
  takeProfit?: string | null;
}

export interface PortOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: "market" | "limit" | "stop";
  lots: string;
  status: "working" | "filled" | "cancelled";
  limitPrice?: string;
  stopPrice?: string;
  stopLoss?: string;
  takeProfit?: string;
}

export interface PositionSnapshot {
  side: "long" | "short" | "flat";
  lots: string;
  averagePrice: string;
  stopLoss?: string;
  takeProfit?: string;
}

export interface Snapshot {
  symbol: string;
  adapterId: string;
  position: PositionSnapshot;
  orders: PortOrder[];
  fills: FillRecord[];
  realizedPnl: string;
  unrealizedPnl: string;
  commission: string;
}

export type PortResult =
  | { ok: true; order?: PortOrder; fills: FillRecord[]; warnings: string[] }
  | { ok: false; code: string; message: string };

export interface BrokerPort {
  readonly adapterId: string;
  readonly symbol: string;
  readonly capabilities: VenueCapabilities;
  place(input: PlaceOrder): Promise<PortResult>;
  modify(input: ModifyOrder): Promise<PortResult>;
  cancel(orderId: string): Promise<PortResult>;
  close(input: CloseOrder): Promise<PortResult>;
  modifyProtection(input: ModifyProtection): Promise<PortResult>;
  snapshot(): Snapshot;
}

const CCXT_VENUES = new Set(["binance", "bybit", "okx", "kraken"]);

export function adapterIdFor(venue: string): string {
  return CCXT_VENUES.has(venue) ? "ccxt" : venue;
}

function failure(error: unknown): PortResult {
  if (error instanceof RealMoneyConfirmationRequired) {
    return { ok: false, code: "real_money_confirmation_required", message: error.message };
  }
  if (error instanceof LiveNetworkDisabled) return { ok: false, code: "live_network_disabled", message: error.message };
  if (error instanceof ProtectionNotSupported) return { ok: false, code: "protection_not_supported", message: error.message };
  if (error instanceof DemoUnavailable) return { ok: false, code: "demo_unavailable", message: error.message };
  if (error instanceof InterfaceOnlyError) return { ok: false, code: "interface_only", message: error.message };
  if (error instanceof PropFirmAutomationBlocked) {
    return { ok: false, code: "prop_firm_automation_blocked", message: error.message };
  }
  if (error instanceof OrderRejected || error instanceof BrokerRequestError) {
    return { ok: false, code: error instanceof OrderRejected ? "order_rejected" : "broker_request", message: error.message };
  }
  return { ok: false, code: "broker_request", message: "The venue rejected the call." };
}

function toIntent(input: PlaceOrder, symbol: string, reason?: ExecutionContext["reason"]): OrderIntent {
  const intent: OrderIntent = {
    clientOrderId: input.clientOrderId,
    symbol,
    side: input.side,
    type: input.type,
    qty: input.lots,
  };
  if (input.limitPrice || input.stopPrice) {
    intent.prices = {};
    if (input.limitPrice) intent.prices.limit = input.limitPrice;
    if (input.stopPrice) intent.prices.stop = input.stopPrice;
  }
  const stopLoss = typeof input.stopLoss === "string" ? input.stopLoss : undefined;
  const takeProfit = typeof input.takeProfit === "string" ? input.takeProfit : undefined;
  if (stopLoss || takeProfit) {
    intent.protections = {};
    if (stopLoss) intent.protections.stopLoss = { price: stopLoss };
    if (takeProfit) intent.protections.takeProfit = { price: takeProfit };
  }
  void reason;
  return intent;
}

function orderFrom(input: PlaceOrder, symbol: string, ack: OrderAck): PortOrder {
  const order: PortOrder = {
    orderId: ack.orderId,
    clientOrderId: input.clientOrderId,
    symbol,
    side: input.side,
    type: input.type,
    lots: input.lots,
    status: ack.status === "filled" ? "filled" : "working",
  };
  if (input.limitPrice) order.limitPrice = input.limitPrice;
  if (input.stopPrice) order.stopPrice = input.stopPrice;
  if (typeof input.stopLoss === "string") order.stopLoss = input.stopLoss;
  if (typeof input.takeProfit === "string") order.takeProfit = input.takeProfit;
  return order;
}

export function createBrokerPort(
  adapter: BrokerAdapter,
  options: { symbol: string; mode: ExecutionContext["mode"]; confirmRealMoney?: boolean; now?: string },
): BrokerPort {
  const adapterId = adapterIdFor(adapter.id);
  const seen = new Map<string, PortResult>();
  const orders: PortOrder[] = [];
  const fills: FillRecord[] = [];
  let position: PositionSnapshot = { side: "flat", lots: "0", averagePrice: "0" };

  const context = (reason?: ExecutionContext["reason"]): ExecutionContext => {
    const ctx: ExecutionContext = { mode: options.mode, confirmRealMoney: options.confirmRealMoney };
    if (options.now) ctx.now = options.now;
    if (reason) ctx.reason = reason;
    return ctx;
  };

  function remember(clientOrderId: string, result: PortResult): PortResult {
    if (result.ok) seen.set(clientOrderId, result);
    return result;
  }

  function noteFill(fill: FillRecord, levels?: { stopLoss?: string; takeProfit?: string }): void {
    fills.push(fill);
    const lots = Number(fill.lots);
    const price = Number(fill.price);
    if (position.side === "flat") {
      position = {
        side: fill.side === "buy" ? "long" : "short",
        lots: fill.lots,
        averagePrice: fill.price,
        ...(levels?.stopLoss ? { stopLoss: levels.stopLoss } : {}),
        ...(levels?.takeProfit ? { takeProfit: levels.takeProfit } : {}),
      };
      return;
    }
    const same = (position.side === "long" && fill.side === "buy") || (position.side === "short" && fill.side === "sell");
    const openLots = Number(position.lots);
    if (same) {
      const next = openLots + lots;
      position = {
        ...position,
        lots: String(next),
        averagePrice: String((Number(position.averagePrice) * openLots + price * lots) / next),
        stopLoss: levels?.stopLoss ?? position.stopLoss,
        takeProfit: levels?.takeProfit ?? position.takeProfit,
      };
      return;
    }
    if (lots < openLots) {
      position = { ...position, lots: String(openLots - lots) };
      return;
    }
    if (lots === openLots) {
      position = { side: "flat", lots: "0", averagePrice: "0" };
      return;
    }
    position = {
      side: fill.side === "buy" ? "long" : "short",
      lots: String(lots - openLots),
      averagePrice: fill.price,
      ...(levels?.stopLoss ? { stopLoss: levels.stopLoss } : {}),
      ...(levels?.takeProfit ? { takeProfit: levels.takeProfit } : {}),
    };
  }

  async function submit(input: PlaceOrder, reason?: ExecutionContext["reason"]): Promise<PortResult> {
    const cached = seen.get(input.clientOrderId);
    if (cached) return cached;
    const visible = protectionsVisible(adapter.capabilities, input.type);
    if (typeof input.stopLoss === "string" && !visible.stopLoss) {
      return { ok: false, code: "protection_not_supported", message: "Hide stop-loss. This venue cannot attach it." };
    }
    if (typeof input.takeProfit === "string" && !visible.takeProfit) {
      return { ok: false, code: "protection_not_supported", message: "Hide take-profit. This venue cannot attach it." };
    }
    try {
      const ack = await adapter.placeOrder(toIntent(input, options.symbol), context(reason));
      const order = orderFrom(input, options.symbol, ack);
      orders.push(order);
      const produced = ack.fill ? [ack.fill] : [];
      if (ack.fill) {
        noteFill(ack.fill, {
          ...(typeof input.stopLoss === "string" ? { stopLoss: input.stopLoss } : {}),
          ...(typeof input.takeProfit === "string" ? { takeProfit: input.takeProfit } : {}),
        });
      }
      return remember(input.clientOrderId, { ok: true, order, fills: produced, warnings: ack.warnings });
    } catch (error) {
      return failure(error);
    }
  }

  return {
    adapterId,
    symbol: options.symbol,
    capabilities: adapter.capabilities,
    place: (input) => submit(input),
    async modify(input) {
      const order = orders.find((item) => item.orderId === input.orderId || item.clientOrderId === input.orderId);
      if (!order || order.status !== "working") {
        return { ok: false, code: "order_not_working", message: "modify changes a working order only." };
      }
      return { ok: false, code: "modify_unsupported", message: "This venue adapter does not amend a working order yet." };
    },
    async cancel(orderId) {
      const order = orders.find((item) => item.orderId === orderId || item.clientOrderId === orderId);
      if (!order || order.status !== "working") {
        return { ok: false, code: "order_not_working", message: "cancel changes a working order only." };
      }
      try {
        await adapter.cancelOrder(order.orderId, options.symbol, context());
        order.status = "cancelled";
        return { ok: true, order, fills: [], warnings: [] };
      } catch (error) {
        return failure(error);
      }
    },
    async close(input) {
      if (position.side === "flat") return { ok: false, code: "flat", message: "There is no position to close." };
      const lots = input.lots ?? position.lots;
      return submit(
        {
          clientOrderId: input.clientOrderId,
          side: position.side === "long" ? "sell" : "buy",
          type: "market",
          lots,
        },
        "close",
      );
    },
    async modifyProtection(input) {
      if (position.side === "flat") return { ok: false, code: "flat", message: "There is no position to protect." };
      const visible = protectionsVisible(adapter.capabilities, "market");
      if ((input.stopLoss !== undefined && !visible.stopLoss) || (input.takeProfit !== undefined && !visible.takeProfit)) {
        return { ok: false, code: "protection_not_supported", message: "Hide the level. This venue cannot attach it." };
      }
      return {
        ok: false,
        code: "modify_unsupported",
        message: "Attached levels are sent on place. Amending an open position is not wired yet.",
      };
    },
    snapshot() {
      const commission = fills.reduce((sum, fill) => sum + Number(fill.commission), 0);
      const realized = fills.reduce((sum, fill) => sum + Number(fill.realizedPnl), 0);
      return {
        symbol: options.symbol,
        adapterId,
        position: { ...position },
        orders: orders.filter((order) => order.status === "working"),
        fills: fills.map((fill) => ({ ...fill })),
        realizedPnl: String(realized),
        unrealizedPnl: "0",
        commission: String(commission),
      };
    },
  };
}
