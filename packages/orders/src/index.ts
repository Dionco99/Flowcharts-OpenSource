// SPDX-License-Identifier: Apache-2.0

import { numericMinute, price, type MarketWindow, type Minute, type SymbolSpec, type Timeframe } from "@flowchart/bars";
import { replay as replayNumeric, type StrategyRunner as NumericRunner } from "./engine";
import {
  EURUSD_NUM,
  roundLots,
  type BrokerPort as NumericPort,
  type Fill as NumericFill,
  type NumSpec,
  type OrderRecord as NumericOrder,
  type WorkingOrderView,
} from "./numeric";
import type { BookSnapshot, BrokerPort, CallResult, CancelRecord, Fill, OrderRecord, PlaceOrder, StrategyRunner, WorkingOrder } from "./types";

export type { BookSnapshot, BrokerPort, CallResult, CancelRecord, Fill, OrderRecord, PlaceOrder, StrategyRunner, WorkingOrder };
export type { Side, OrderType, OrderRole, OrderSource } from "./types";

export type ReplayInput = {
  minutes: readonly Minute[];
  cursor: number;
  spec: SymbolSpec;
  tradingTimeframe: Timeframe;
  orders: readonly OrderRecord[];
  cancels: readonly CancelRecord[];
  strategy: StrategyRunner | null;
};

function numSpec(spec: SymbolSpec): NumSpec {
  return {
    symbol: spec.symbol,
    tickSize: Number(spec.tickSize),
    pipSize: Number(spec.pipSize),
    lotSize: Number(spec.lotSize),
    spread: Number(spec.spread),
    commissionPerLot: Number(spec.commissionPerLot),
    pricePrecision: spec.pricePrecision,
    dayRollUtcMinute: spec.dayRollUtcMinute,
    sessions: spec.sessions,
  };
}

function px(value: number, spec: SymbolSpec): string {
  return price(value, spec.pricePrecision);
}

function lots(value: number): string {
  return roundLots(value).toFixed(2);
}

function ticket(order: PlaceOrder, spec: SymbolSpec): NumericOrder {
  return {
    id: "",
    submittedAt: 0,
    source: "manual",
    side: order.side,
    type: order.type,
    lots: Number(order.lots),
    price: order.price === undefined ? undefined : Number(order.price),
    stopLoss: order.stopLoss === undefined ? undefined : Number(order.stopLoss),
    takeProfit: order.takeProfit === undefined ? undefined : Number(order.takeProfit),
    reduceOnly: order.reduceOnly,
  };
}

function orderIn(order: OrderRecord): NumericOrder {
  return { ...ticket(order, { pricePrecision: 5 } as SymbolSpec), id: order.id, submittedAt: order.submittedAt, source: order.source };
}

function fillOut(fill: NumericFill, spec: SymbolSpec): Fill {
  return {
    id: fill.id,
    orderId: fill.orderId,
    time: fill.time,
    side: fill.side,
    lots: lots(fill.lots),
    price: px(fill.price, spec),
    spread: px(fill.spread, spec),
    spreadCost: fill.spreadCost.toFixed(2),
    commission: fill.commission.toFixed(2),
    ambiguous: fill.ambiguous,
    realizedPnl: fill.realizedPnl.toFixed(2),
    positionAfter: lots(fill.positionAfter),
    source: fill.source,
  };
}

function workingOut(order: WorkingOrderView, spec: SymbolSpec): WorkingOrder {
  return {
    id: order.id,
    side: order.side,
    type: order.type,
    lots: lots(order.lots),
    price: px(order.price, spec),
    role: order.role,
    submittedAt: order.submittedAt,
    stopLoss: order.stopLoss === undefined ? undefined : px(order.stopLoss, spec),
    takeProfit: order.takeProfit === undefined ? undefined : px(order.takeProfit, spec),
    source: order.source,
  };
}

function snapshotOf(port: NumericPort, spec: SymbolSpec, extra: { realized: number; commission: number; unrealized: number; bid: number; ask: number }): BookSnapshot {
  const position = port.position();
  return {
    position: { lots: lots(position.lots), avgPrice: position.avgPrice ? px(position.avgPrice, spec) : px(0, spec) },
    orders: port.working().map((order) => workingOut(order, spec)),
    fills: port.fills().map((fill) => fillOut(fill, spec)),
    realized: extra.realized.toFixed(2),
    commission: extra.commission.toFixed(2),
    unrealized: extra.unrealized.toFixed(2),
    bid: px(extra.bid, spec),
    ask: px(extra.ask, spec),
  };
}

function adaptPort(port: NumericPort, spec: SymbolSpec): BrokerPort {
  const ok = (id: string): CallResult => ({ ok: true, id });
  return {
    place(order) {
      const id = port.submit({
        side: order.side,
        type: order.type,
        lots: Number(order.lots),
        price: order.price === undefined ? undefined : Number(order.price),
        stopLoss: order.stopLoss === undefined ? undefined : Number(order.stopLoss),
        takeProfit: order.takeProfit === undefined ? undefined : Number(order.takeProfit),
        reduceOnly: order.reduceOnly,
      });
      return ok(id);
    },
    modify(id, patch) {
      const exists = port.working().some((order) => order.id === id);
      if (!exists) return { ok: false, code: "order_not_working" };
      port.amend(id, {
        price: patch.price === undefined ? undefined : Number(patch.price),
        lots: patch.lots === undefined ? undefined : Number(patch.lots),
      });
      return ok(id);
    },
    cancel(id) {
      const exists = port.working().some((order) => order.id === id);
      if (!exists) return { ok: false, code: "order_not_working" };
      port.cancel(id);
      return ok(id);
    },
    close(size) {
      const position = port.position();
      if (Math.abs(position.lots) < 0.005) return { ok: false, code: "flat" };
      const qty = size === undefined ? Math.abs(position.lots) : Number(size);
      const id = port.submit({
        side: position.lots > 0 ? "sell" : "buy",
        type: "market",
        lots: qty,
        reduceOnly: true,
      });
      return ok(id);
    },
    modifyProtection(patch) {
      let touched = "";
      for (const order of port.working()) {
        if (order.role === "stop" && patch.stopLoss !== undefined) {
          if (patch.stopLoss === null) port.cancel(order.id);
          else port.amend(order.id, { price: Number(patch.stopLoss) });
          touched = order.id;
        }
        if (order.role === "target" && patch.takeProfit !== undefined) {
          if (patch.takeProfit === null) port.cancel(order.id);
          else port.amend(order.id, { price: Number(patch.takeProfit) });
          touched = order.id;
        }
      }
      if (!touched) return { ok: false, code: "no_protection" };
      return ok(touched);
    },
    snapshot() {
      return snapshotOf(port, spec, { realized: 0, commission: 0, unrealized: 0, bid: 0, ask: 0 });
    },
  };
}

/** Replay fill adapter. Only minutes that have closed at or before the cursor can fill. */
export function runReplay(input: ReplayInput): BookSnapshot {
  const spec = input.spec;
  const numericSpec = numSpec(spec);
  const strategy: NumericRunner | null = input.strategy
    ? {
        reset: () => input.strategy?.reset(),
        onBar: (window, port) => {
          const bars = window.bars.map((bar) => ({
            t: bar.t,
            ct: bar.ct,
            o: price(bar.o, spec.pricePrecision),
            h: price(bar.h, spec.pricePrecision),
            l: price(bar.l, spec.pricePrecision),
            c: price(bar.c, spec.pricePrecision),
            partial: bar.partial,
          }));
          const view: MarketWindow = { spec, timeframe: window.timeframe, bars, cursor: window.cursor };
          input.strategy?.onBar(view, adaptPort(port, spec));
        },
      }
    : null;
  const result = replayNumeric({
    minutes: input.minutes.map(numericMinute),
    cursor: input.cursor,
    spec: numericSpec,
    tradingTimeframe: input.tradingTimeframe,
    orders: input.orders.map(orderIn),
    cancels: input.cancels,
    strategy,
  });
  return {
    position: {
      lots: lots(result.position.lots),
      avgPrice: result.position.avgPrice ? px(result.position.avgPrice, spec) : px(0, spec),
    },
    orders: result.working.map((order) => workingOut(order, spec)),
    fills: result.fills.map((fill) => fillOut(fill, spec)),
    realized: result.realized.toFixed(2),
    commission: result.commission.toFixed(2),
    unrealized: result.unrealized.toFixed(2),
    bid: px(result.bid, spec),
    ask: px(result.ask, spec),
  };
}

export { EURUSD_NUM };
