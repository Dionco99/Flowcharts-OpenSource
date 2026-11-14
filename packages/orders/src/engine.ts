// SPDX-License-Identifier: Apache-2.0

import { BarBuilder, MINUTE, TF_MS, type NumericBar, type NumericMinute, type Timeframe } from "@flowchart/bars";
import { applyFill, executionBid, flatPosition, markToMarket, minuteTriggers } from "./match";
import {
  roundLots,
  roundMoney,
  roundTick,
  type BrokerPort,
  type CancelRecord,
  type Fill,
  type OrderRecord,
  type OrderRole,
  type OrderSource,
  type OrderTicket,
  type Position,
  type Side,
  type WorkingOrderView,
} from "./numeric";

type SymbolSpec = import("./numeric").NumSpec;
type Minute = NumericMinute;
type MarketWindow = { spec: SymbolSpec; timeframe: Timeframe; bars: NumericBar[]; cursor: number };

export type StrategyRunner = {
  reset(): void;
  onBar(window: MarketWindow, port: BrokerPort): void;
};

export type ReplayInput = {
  minutes: readonly Minute[];
  cursor: number;
  spec: SymbolSpec;
  tradingTimeframe: Timeframe;
  orders: readonly OrderRecord[];
  cancels: readonly CancelRecord[];
  strategy: StrategyRunner | null;
};

export type ReplayResult = {
  position: Position;
  working: WorkingOrderView[];
  fills: Fill[];
  realized: number;
  commission: number;
  unrealized: number;
  bid: number;
  ask: number;
};

type Resting = {
  id: string;
  side: Side;
  type: "limit" | "stop";
  lots: number;
  price: number;
  submittedAt: number;
  role: OrderRole;
  reduceOnly: boolean;
  source: OrderSource;
  stopLoss?: number;
  takeProfit?: number;
  done: boolean;
};

/**
 * Replay orders through completed minutes only.
 * When one minute trades through both a protective stop and a target, the stop
 * is filled and marked ambiguous. The target is not awarded.
 */
export function replay(input: ReplayInput): ReplayResult {
  const { spec } = input;
  const tick = spec.tickSize;
  const cancelAt = new Map<string, number>();
  for (const cancel of input.cancels) cancelAt.set(cancel.id, cancel.at);

  const manuals = input.orders.filter((order) => order.source === "manual").slice().sort((a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id));
  let manualIndex = 0;
  const resting: Resting[] = [];
  const fills: Fill[] = [];
  let position = flatPosition();
  let realized = 0;
  let commission = 0;
  let lastBid = 0;
  let fillCount = 0;
  const closedBars: MarketWindow["bars"][number][] = [];
  const builder = new BarBuilder(TF_MS[input.tradingTimeframe]);
  input.strategy?.reset();

  const cancelledBy = (id: string, time: number, inclusive: boolean): boolean => {
    const at = cancelAt.get(id);
    if (at === undefined) return false;
    return inclusive ? at <= time : at < time;
  };

  const viewWorking = (asOf = input.cursor): WorkingOrderView[] =>
    resting
      .filter((order) => !order.done && !cancelledBy(order.id, asOf, true))
      .map((order) => ({
        id: order.id,
        side: order.side,
        type: order.type,
        lots: order.lots,
        price: order.price,
        role: order.role,
        submittedAt: order.submittedAt,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        source: order.source,
      }));

  const portNow = { time: 0 };

  const execute = (order: Resting | (OrderTicket & { id: string; source: OrderSource; role: OrderRole }), bid: number, time: number, ambiguous: boolean, minute: Minute) => {
    let lots = roundLots(order.lots);
    const reduce = order.reduceOnly || order.role === "stop" || order.role === "target" || order.role === "reduce";
    if (reduce) {
      const opposite = (order.side === "sell" && position.lots > 0) || (order.side === "buy" && position.lots < 0);
      if (!opposite) {
        if ("done" in order) order.done = true;
        return;
      }
      lots = roundLots(Math.min(lots, Math.abs(position.lots)));
      if (lots <= 0) {
        if ("done" in order) order.done = true;
        return;
      }
    }
    const execBid = executionBid(order.side, order.type === "market" ? "market" : order.type, "price" in order && order.price !== undefined ? order.price : bid, minute, tick);
    const price = order.side === "buy" ? roundTick(execBid + spec.spread, tick) : execBid;
    const spreadCost = roundMoney(order.side === "buy" ? spec.spread * lots * spec.lotSize : 0);
    const fee = roundMoney(lots * spec.commissionPerLot);
    const applied = applyFill(position, order.side, lots, price, spec.lotSize);
    const realizedPnl = roundMoney(applied.realized);
    position = applied.position;
    realized += realizedPnl;
    commission += fee;
    fills.push({
      id: `f${++fillCount}`,
      orderId: order.id,
      time,
      side: order.side,
      lots,
      price,
      spread: spec.spread,
      spreadCost,
      commission: fee,
      ambiguous,
      realizedPnl,
      positionAfter: position.lots,
      source: order.source,
    });
    if ("done" in order) order.done = true;
    if (order.role === "entry" && (order.stopLoss !== undefined || order.takeProfit !== undefined) && Math.abs(position.lots) > 0) {
      const dir = order.side === "buy" ? 1 : -1;
      if (Math.sign(position.lots) === dir) {
        const childLots = roundLots(Math.min(lots, Math.abs(position.lots)));
        if (order.stopLoss !== undefined) {
          resting.push({
            id: `${order.id}:sl`,
            side: order.side === "buy" ? "sell" : "buy",
            type: "stop",
            lots: childLots,
            price: order.stopLoss,
            submittedAt: time,
            role: "stop",
            reduceOnly: true,
            source: order.source,
            done: false,
          });
        }
        if (order.takeProfit !== undefined) {
          resting.push({
            id: `${order.id}:tp`,
            side: order.side === "buy" ? "sell" : "buy",
            type: "limit",
            lots: childLots,
            price: order.takeProfit,
            submittedAt: time,
            role: "target",
            reduceOnly: true,
            source: order.source,
            done: false,
          });
        }
      }
    }
    for (const item of resting) {
      if (item.done || !item.reduceOnly) continue;
      const opposite = (item.side === "sell" && position.lots > 0) || (item.side === "buy" && position.lots < 0);
      if (!opposite) item.done = true;
    }
  };

  const roleFor = (order: OrderTicket, pos: Position): OrderRole => {
    const opposite = (order.side === "sell" && pos.lots > 0) || (order.side === "buy" && pos.lots < 0);
    if (order.reduceOnly) {
      if (order.type === "stop") return "stop";
      if (order.type === "limit") return "target";
      return "reduce";
    }
    if (opposite && order.type === "stop") return "stop";
    if (opposite && order.type === "limit") return "target";
    return "entry";
  };

  const activate = (order: OrderRecord, time: number) => {
    if (cancelledBy(order.id, time, true)) return;
    const role = roleFor(order, position);
    if (order.type === "market") {
      if (lastBid === 0) return;
      const minute = lastMinute as Minute;
      execute({ ...order, role }, lastBid, time, false, minute);
      return;
    }
    if (order.price === undefined || lastBid === 0 || !lastMinute) return;
    const through =
      order.type === "limit"
        ? order.side === "buy"
          ? order.price >= lastBid
          : order.price <= lastBid
        : order.side === "buy"
          ? lastBid >= order.price
          : lastBid <= order.price;
    if (through) {
      execute(
        { ...order, type: order.type === "limit" ? "market" : "stop", role: role === "entry" ? "entry" : role },
        lastBid,
        time,
        false,
        lastMinute,
      );
      return;
    }
    resting.push({
      id: order.id,
      side: order.side,
      type: order.type,
      lots: roundLots(order.lots),
      price: roundTick(order.price, tick),
      submittedAt: time,
      role,
      reduceOnly: order.reduceOnly ?? role !== "entry",
      source: order.source,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      done: false,
    });
  };

  const releaseManual = (time: number) => {
    while (manualIndex < manuals.length && manuals[manualIndex].submittedAt <= time) {
      const order = manuals[manualIndex++];
      activate(order, order.submittedAt);
    }
  };

  const applyCancels = (time: number) => {
    for (const order of resting) {
      if (!order.done && cancelledBy(order.id, time, true)) order.done = true;
    }
  };

  let lastMinute: Minute | null = null;

  const matchMinute = (minute: Minute, closeTime: number) => {
    const eligible = resting.filter((order) => !order.done && order.submittedAt < closeTime && !cancelledBy(order.id, closeTime, false));
    const exits = eligible.filter((order) => order.role === "stop" || order.role === "target" || order.role === "reduce");
    const entries = eligible.filter((order) => order.role === "entry");
    const hit = (order: Resting) => minuteTriggers(order.side, order.type, order.price, minute);

    const resolveExits = (stopSide: Side) => {
      const stops = exits.filter((order) => order.role === "stop" && order.side === stopSide && hit(order));
      const targets = exits.filter((order) => order.role === "target" && order.side === stopSide && hit(order));
      if (stops.length > 0 && targets.length > 0) {
        execute(stops[0], stops[0].price, closeTime, true, minute);
        for (const target of targets) target.done = true;
        for (const extra of stops.slice(1)) extra.done = true;
        return;
      }
      const ordered = [...exits.filter((order) => order.role === "stop"), ...exits.filter((order) => order.role === "target"), ...exits.filter((order) => order.role === "reduce")];
      for (const order of ordered) {
        if (order.done || !hit(order)) continue;
        execute(order, order.price, closeTime, false, minute);
        if (Math.abs(position.lots) < 0.005) break;
      }
    };

    if (position.lots > 0) resolveExits("sell");
    else if (position.lots < 0) resolveExits("buy");
    else resolveExits("buy");

    for (const order of entries) {
      if (order.done || !hit(order)) continue;
      execute(order, order.price, closeTime, false, minute);
    }
  };

  const runStrategy = (bar: MarketWindow["bars"][number]) => {
    if (!input.strategy) return;
    closedBars.push(bar);
    portNow.time = bar.ct;
    input.strategy.onBar(
      { spec, timeframe: input.tradingTimeframe, bars: closedBars, cursor: bar.ct },
      port,
    );
  };

  let strategySeq = 0;
  const port: BrokerPort = {
    submit(ticket) {
      const id = `s:${portNow.time}:${strategySeq++}`;
      const record: OrderRecord = {
        ...ticket,
        lots: roundLots(ticket.lots),
        price: ticket.price === undefined ? undefined : roundTick(ticket.price, tick),
        stopLoss: ticket.stopLoss === undefined ? undefined : roundTick(ticket.stopLoss, tick),
        takeProfit: ticket.takeProfit === undefined ? undefined : roundTick(ticket.takeProfit, tick),
        id,
        submittedAt: portNow.time,
        source: "strategy",
      };
      activate(record, portNow.time);
      return id;
    },
    amend(id, patch) {
      const order = resting.find((item) => item.id === id && !item.done);
      if (!order) return;
      if (patch.price !== undefined) order.price = roundTick(patch.price, tick);
      if (patch.lots !== undefined) order.lots = roundLots(patch.lots);
    },
    cancel(id) {
      cancelAt.set(id, portNow.time);
      const order = resting.find((item) => item.id === id && !item.done);
      if (order) order.done = true;
    },
    position() {
      return { lots: position.lots, avgPrice: position.avgPrice };
    },
    working: () => viewWorking(portNow.time),
    fills: () => fills,
  };

  for (const minute of input.minutes) {
    const closeTime = minute.t + MINUTE;
    if (closeTime > input.cursor) break;
    const overdue = builder.closeIfDue(minute.t);
    if (overdue) runStrategy(overdue);
    matchMinute(minute, closeTime);
    lastMinute = minute;
    lastBid = minute.c;
    releaseManual(closeTime);
    const closed = builder.add(minute, closeTime);
    if (closed) runStrategy(closed);
    applyCancels(closeTime);
  }
  const tail = builder.closeIfDue(input.cursor);
  if (tail) runStrategy(tail);
  releaseManual(input.cursor);
  applyCancels(input.cursor);

  const bid = lastBid;
  return {
    position,
    working: viewWorking(),
    fills,
    realized,
    commission,
    unrealized: markToMarket(position, bid, spec.spread, spec.lotSize),
    bid,
    ask: bid === 0 ? 0 : roundTick(bid + spec.spread, tick),
  };
}
