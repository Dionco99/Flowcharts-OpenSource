// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import {
  applySpread,
  averagePriceFromLedger,
  barError,
  isOnTick,
  isValidLots,
  iso,
  lotsToSteps,
  marketableReference,
  matchProtection,
  matchRestingOrder,
  parseTime,
  pnlFromTickSteps,
  priceToTicks,
  protectionError,
  roundMoney,
  stepsToLots,
} from "./pricing.ts";
import type {
  BrokerPort,
  BrokerSnapshot,
  CloseRequest,
  CostModel,
  Fill,
  FillReason,
  MinuteBar,
  ModifyOrderRequest,
  ModifyProtectionRequest,
  OrderType,
  PlaceOrderRequest,
  PortFailure,
  PortResult,
  PortSuccess,
  Position,
  PositionSide,
  RejectCode,
  ReplayBrokerState,
  Side,
  SymbolSpec,
  WorkingOrder,
} from "./types.ts";

type Outcome = "opened" | "added" | "reduced" | "flattened" | "reversed";

/**
 * Stage 1 replay matcher. Implements {@link BrokerPort}.
 *
 * The replay engine calls `setCursor` and `onBar`. Strategies call the port.
 * Only a minute whose close is at or before the cursor can fill. A market or
 * marketable order uses that minute's close, never its wick. Resting orders
 * and protective levels are matched on a later minute. Stop and target on the
 * same minute fill the stop and are marked ambiguous. Protective levels arm
 * on the minute after the entry fill.
 */
export class ReplayFillAdapter implements BrokerPort {
  readonly adapterId = "replay";

  private readonly spec: SymbolSpec;
  private readonly costs: CostModel;
  private readonly moneyDecimals: number;

  private cursor: string | null = null;
  private cursorMs: number | null = null;
  private lastBar: MinuteBar | null = null;
  private lastBarCloseMs: number | null = null;
  private position: Position;
  private orders: WorkingOrder[] = [];
  private fills: Fill[] = [];
  private realizedPnl = 0;
  private commissionPaid = 0;
  /** Sum of execution ticks × lot steps for the open position. */
  private entryTickSteps = 0;
  private lotSteps = 0;
  private nextOrderId = 1;
  private nextFillId = 1;

  constructor(spec: SymbolSpec, costs: CostModel) {
    if (typeof spec.symbol !== "string" || spec.symbol.length === 0) {
      throw new Error("Symbol spec requires a symbol.");
    }
    if (!positive(spec.tickSize) || !positive(spec.lotSize) || !positive(spec.lotStep)) {
      throw new Error("Symbol spec tick size, lot size, and lot step must be positive.");
    }
    if (!nonNegative(costs.spread) || !nonNegative(costs.commissionPerLot)) {
      throw new Error("Spread and commission must be zero or positive.");
    }
    const moneyDecimals = costs.moneyDecimals ?? 2;
    if (!Number.isInteger(moneyDecimals) || moneyDecimals < 0 || moneyDecimals > 12) {
      throw new Error("moneyDecimals must be an integer from 0 to 12.");
    }
    this.spec = {
      symbol: spec.symbol,
      tickSize: spec.tickSize,
      lotSize: spec.lotSize,
      lotStep: spec.lotStep,
    };
    this.moneyDecimals = moneyDecimals;
    this.costs = {
      spread: costs.spread,
      commissionPerLot: costs.commissionPerLot,
      moneyDecimals,
    };
    this.position = this.flatPosition(null);
  }

  place(request: PlaceOrderRequest): PortResult {
    const replayed = this.replayedClientOrder(request.clientOrderId);
    if (replayed) return replayed;
    if (this.cursor === null) return this.reject("cursor_not_set", "Set the replay cursor before placing.");

    const shape = this.orderShape(request);
    if (shape) return shape;

    const level = request.type === "limit" ? request.limitPrice! : request.type === "stop" ? request.stopPrice! : null;
    const bar = this.completedBar();
    if (request.type === "market" && !bar) {
      return this.reject("no_completed_bar", "A market order needs a completed minute at or before the cursor.");
    }
    const reference =
      request.type === "market" ? bar!.close : level!;
    const protection = protectionError(
      request.side === "buy" ? "long" : "short",
      reference,
      request.stopLoss,
      request.takeProfit,
      this.spec.tickSize,
    );
    if (protection) return this.reject("invalid_protection", protection);

    const order = this.createOrder({
      clientOrderId: request.clientOrderId ?? null,
      type: request.type,
      side: request.side,
      lots: request.lots,
      limitPrice: request.type === "limit" ? level : null,
      stopPrice: request.type === "stop" ? level : null,
      stopLoss: request.stopLoss === undefined ? null : request.stopLoss,
      takeProfit: request.takeProfit === undefined ? null : request.takeProfit,
      stopLossSpecified: request.stopLoss !== undefined,
      takeProfitSpecified: request.takeProfit !== undefined,
      time: this.cursor,
    });

    const immediate = bar
      ? marketableReference(request.type, request.side, level, bar.close, this.spec.tickSize)
      : null;
    if (immediate === null) return this.ok([], order);

    const executed = this.execute({
      order,
      referencePrice: immediate,
      reason: request.type,
      ambiguous: false,
      time: this.cursor,
      barCloseTime: bar!.closeTime,
    });
    this.armProtection(order, executed.outcome);
    return this.ok([executed.fill], order);
  }

  modify(request: ModifyOrderRequest): PortResult {
    const order = this.orders.find((item) => item.id === request.orderId);
    if (!order) return this.reject("order_not_found", "No order has that id.");
    if (order.status !== "working") {
      return this.reject("order_not_working", "Only a working order can be modified.");
    }
    if (request.lots !== undefined && !isValidLots(request.lots, this.spec.lotStep)) {
      return this.reject("invalid_lots", "Lots must be a positive multiple of the lot step.");
    }
    if (request.limitPrice !== undefined && order.type !== "limit") {
      return this.reject("invalid_order", "A limit price belongs on a limit order.");
    }
    if (request.stopPrice !== undefined && order.type !== "stop") {
      return this.reject("invalid_order", "A stop price belongs on a stop order.");
    }
    if (request.limitPrice !== undefined && !isOnTick(request.limitPrice, this.spec.tickSize)) {
      return this.reject("invalid_price", "Limit price is not a positive price on the tick grid.");
    }
    if (request.stopPrice !== undefined && !isOnTick(request.stopPrice, this.spec.tickSize)) {
      return this.reject("invalid_price", "Stop price is not a positive price on the tick grid.");
    }

    const limitPrice = request.limitPrice ?? order.limitPrice;
    const stopPrice = request.stopPrice ?? order.stopPrice;
    const stopLoss = request.stopLoss !== undefined ? request.stopLoss : order.stopLoss;
    const takeProfit = request.takeProfit !== undefined ? request.takeProfit : order.takeProfit;
    const stopLossSpecified = request.stopLoss !== undefined ? true : order.stopLossSpecified;
    const takeProfitSpecified = request.takeProfit !== undefined ? true : order.takeProfitSpecified;
    const reference = order.type === "limit" ? limitPrice : stopPrice;
    if (reference === null) return this.reject("missing_price", "The working order has no price.");
    const protection = protectionError(
      order.side === "buy" ? "long" : "short",
      reference,
      stopLossSpecified ? stopLoss : null,
      takeProfitSpecified ? takeProfit : null,
      this.spec.tickSize,
    );
    if (protection) return this.reject("invalid_protection", protection);

    order.lots = request.lots ?? order.lots;
    order.limitPrice = limitPrice;
    order.stopPrice = stopPrice;
    order.stopLoss = stopLoss;
    order.takeProfit = takeProfit;
    order.stopLossSpecified = stopLossSpecified;
    order.takeProfitSpecified = takeProfitSpecified;
    order.updatedAt = this.cursor ?? order.updatedAt;
    return this.ok([], order);
  }

  cancel(orderId: string): PortResult {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) return this.reject("order_not_found", "No order has that id.");
    if (order.status !== "working") {
      return this.reject("order_not_working", "Only a working order can be cancelled.");
    }
    order.status = "cancelled";
    order.updatedAt = this.cursor ?? order.updatedAt;
    return this.ok([], order);
  }

  close(request: CloseRequest = {}): PortResult {
    const replayed = this.replayedClientOrder(request.clientOrderId);
    if (replayed) return replayed;
    if (this.cursor === null) return this.reject("cursor_not_set", "Set the replay cursor before closing.");
    if (this.position.side === "flat") return this.reject("position_flat", "There is no open position to close.");
    const bar = this.completedBar();
    if (!bar) return this.reject("no_completed_bar", "A close needs a completed minute at or before the cursor.");

    const lots = request.lots === undefined ? this.position.lots : request.lots;
    if (!isValidLots(lots, this.spec.lotStep)) {
      return this.reject("invalid_lots", "Lots must be a positive multiple of the lot step.");
    }
    if (lotsToSteps(lots, this.spec.lotStep) > this.lotSteps) {
      return this.reject("close_exceeds_position", "Close size is larger than the open position.");
    }

    const order = this.createOrder({
      clientOrderId: request.clientOrderId ?? null,
      type: "market",
      side: this.position.side === "long" ? "sell" : "buy",
      lots,
      limitPrice: null,
      stopPrice: null,
      stopLoss: null,
      takeProfit: null,
      stopLossSpecified: false,
      takeProfitSpecified: false,
      time: this.cursor,
    });
    const executed = this.execute({
      order,
      referencePrice: bar.close,
      reason: "close",
      ambiguous: false,
      time: this.cursor,
      barCloseTime: bar.closeTime,
    });
    return this.ok([executed.fill], order);
  }

  modifyProtection(request: ModifyProtectionRequest): PortResult {
    if (this.position.side === "flat") {
      return this.reject("position_flat", "Protective levels belong on an open position.");
    }
    const mark = this.protectionMark();
    if (mark === null) {
      return this.reject("no_completed_bar", "Protective levels need a reference price.");
    }
    const stopLoss = request.stopLoss !== undefined ? request.stopLoss : this.position.stopLoss;
    const takeProfit = request.takeProfit !== undefined ? request.takeProfit : this.position.takeProfit;
    const protection = protectionError(
      this.position.side,
      mark,
      stopLoss,
      takeProfit,
      this.spec.tickSize,
    );
    if (protection) return this.reject("invalid_protection", protection);
    if (request.stopLoss !== undefined) this.position.stopLoss = request.stopLoss;
    if (request.takeProfit !== undefined) this.position.takeProfit = request.takeProfit;
    this.position.updatedAt = this.cursor ?? this.position.updatedAt;
    return this.ok([], null);
  }

  snapshot(): BrokerSnapshot {
    return {
      symbol: this.spec.symbol,
      position: this.positionCopy(),
      orders: this.orders.filter((order) => order.status === "working").map((order) => this.orderCopy(order)),
      fills: this.fills.map((fill) => this.fillCopy(fill)),
      realizedPnl: this.realizedPnl,
      unrealizedPnl: this.unrealized(),
      commissionPaid: this.commissionPaid,
    };
  }

  /** Replay clock. Seeking backward does not refill; reload a saved book for that. */
  setCursor(time: string): PortResult {
    const ms = parseTime(time);
    if (ms === null) return this.reject("invalid_time", "Cursor is not a valid timestamp.");
    this.cursor = iso(ms);
    this.cursorMs = ms;
    return this.ok([], null);
  }

  /**
   * Match the open position's protective levels, then resting orders, against
   * one newly completed minute. The bar is rejected when its close is after
   * the cursor or not later than the previous bar.
   */
  onBar(bar: MinuteBar): PortResult {
    if (this.cursorMs === null || this.cursor === null) {
      return this.reject("cursor_not_set", "Set the replay cursor before a bar.");
    }
    const problem = barError(bar, this.spec.tickSize);
    if (problem) return this.reject("invalid_bar", problem);
    const closeMs = parseTime(bar.closeTime)!;
    if (closeMs > this.cursorMs) {
      return this.reject("bar_after_cursor", "A minute that closes after the cursor cannot fill.");
    }
    if (this.lastBarCloseMs !== null && closeMs <= this.lastBarCloseMs) {
      return this.reject("bar_out_of_order", "Minutes must be applied in close-time order.");
    }

    const stored: MinuteBar = {
      openTime: iso(parseTime(bar.openTime)!),
      closeTime: iso(closeMs),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    };
    const produced: Fill[] = [];
    const workingIds = this.orders.filter((order) => order.status === "working").map((order) => order.id);

    if (this.position.side === "long" || this.position.side === "short") {
      const hit = matchProtection(
        this.position.side,
        this.position.stopLoss,
        this.position.takeProfit,
        stored,
        this.spec.tickSize,
      );
      if (hit) {
        const level = hit.reason === "stop_loss" ? this.position.stopLoss! : this.position.takeProfit!;
        const order = this.createOrder({
          clientOrderId: null,
          type: hit.reason === "take_profit" ? "limit" : "stop",
          side: this.position.side === "long" ? "sell" : "buy",
          lots: this.position.lots,
          limitPrice: hit.reason === "take_profit" ? level : null,
          stopPrice: hit.reason === "stop_loss" ? level : null,
          stopLoss: null,
          takeProfit: null,
          stopLossSpecified: false,
          takeProfitSpecified: false,
          time: stored.closeTime,
        });
        const executed = this.execute({
          order,
          referencePrice: hit.referencePrice,
          reason: hit.reason,
          ambiguous: hit.ambiguous,
          time: stored.closeTime,
          barCloseTime: stored.closeTime,
        });
        produced.push(executed.fill);
      }
    }

    for (const id of workingIds) {
      const order = this.orders.find((item) => item.id === id);
      if (!order || order.status !== "working" || (order.type !== "limit" && order.type !== "stop")) continue;
      const level = order.type === "limit" ? order.limitPrice : order.stopPrice;
      if (level === null) continue;
      const hit = matchRestingOrder(order.type, order.side, level, stored, this.spec.tickSize);
      if (!hit) continue;
      const executed = this.execute({
        order,
        referencePrice: hit.referencePrice,
        reason: order.type,
        ambiguous: false,
        time: stored.closeTime,
        barCloseTime: stored.closeTime,
      });
      this.armProtection(order, executed.outcome);
      produced.push(executed.fill);
    }

    this.lastBar = stored;
    this.lastBarCloseMs = closeMs;
    this.position.updatedAt = this.position.updatedAt ?? stored.closeTime;
    return this.ok(produced, null);
  }

  exportState(): ReplayBrokerState {
    return {
      version: 1,
      symbol: this.spec.symbol,
      cursor: this.cursor,
      lastBar: this.lastBar ? { ...this.lastBar } : null,
      position: this.positionCopy(),
      orders: this.orders.map((order) => this.orderCopy(order)),
      fills: this.fills.map((fill) => this.fillCopy(fill)),
      realizedPnl: this.realizedPnl,
      commissionPaid: this.commissionPaid,
      entryTickSteps: this.entryTickSteps,
      lotSteps: this.lotSteps,
      nextOrderId: this.nextOrderId,
      nextFillId: this.nextFillId,
    };
  }

  loadState(state: ReplayBrokerState): PortResult {
    const problem = this.stateError(state);
    if (problem) return this.reject("invalid_state", problem);
    this.cursor = state.cursor;
    this.cursorMs = state.cursor === null ? null : parseTime(state.cursor);
    this.lastBar = state.lastBar ? { ...state.lastBar } : null;
    this.lastBarCloseMs = this.lastBar ? parseTime(this.lastBar.closeTime) : null;
    this.position = { ...state.position };
    this.orders = state.orders.map((order) => ({ ...order }));
    this.fills = state.fills.map((fill) => ({ ...fill }));
    this.realizedPnl = state.realizedPnl;
    this.commissionPaid = state.commissionPaid;
    this.entryTickSteps = state.entryTickSteps;
    this.lotSteps = state.lotSteps;
    this.position.lots = stepsToLots(this.lotSteps, this.spec.lotStep);
    this.position.averagePrice = averagePriceFromLedger(
      this.entryTickSteps,
      this.lotSteps,
      this.spec.tickSize,
    );
    this.position.symbol = this.spec.symbol;
    this.nextOrderId = state.nextOrderId;
    this.nextFillId = state.nextFillId;
    return this.ok([], null);
  }

  private orderShape(request: PlaceOrderRequest): PortResult | null {
    if (request.type !== "market" && request.type !== "limit" && request.type !== "stop") {
      return this.reject("invalid_order", "Order type must be market, limit, or stop.");
    }
    if (request.side !== "buy" && request.side !== "sell") {
      return this.reject("invalid_order", "Order side must be buy or sell.");
    }
    if (!isValidLots(request.lots, this.spec.lotStep)) {
      return this.reject("invalid_lots", "Lots must be a positive multiple of the lot step.");
    }
    if (request.type === "market" && (request.limitPrice !== undefined || request.stopPrice !== undefined)) {
      return this.reject("invalid_order", "A market order does not take a limit or stop price.");
    }
    if (request.type === "limit") {
      if (request.stopPrice !== undefined) return this.reject("invalid_order", "A limit order does not take a stop price.");
      if (request.limitPrice === undefined) return this.reject("missing_price", "A limit order needs a limit price.");
      if (!isOnTick(request.limitPrice, this.spec.tickSize)) {
        return this.reject("invalid_price", "Limit price is not a positive price on the tick grid.");
      }
    }
    if (request.type === "stop") {
      if (request.limitPrice !== undefined) return this.reject("invalid_order", "A stop order does not take a limit price.");
      if (request.stopPrice === undefined) return this.reject("missing_price", "A stop order needs a stop price.");
      if (!isOnTick(request.stopPrice, this.spec.tickSize)) {
        return this.reject("invalid_price", "Stop price is not a positive price on the tick grid.");
      }
    }
    return null;
  }

  private replayedClientOrder(clientOrderId: string | undefined): PortResult | null {
    if (clientOrderId === undefined) return null;
    if (typeof clientOrderId !== "string" || clientOrderId.trim() === "") {
      return this.reject("invalid_order", "clientOrderId must be a non-empty string.");
    }
    const existing = this.orders.find((order) => order.clientOrderId === clientOrderId);
    return existing ? this.ok([], existing) : null;
  }

  private execute(args: {
    order: WorkingOrder;
    referencePrice: number;
    reason: FillReason;
    ambiguous: boolean;
    time: string;
    barCloseTime: string | null;
  }): { fill: Fill; outcome: Outcome } {
    const execution = applySpread(
      args.referencePrice,
      args.order.side,
      this.costs.spread,
      this.spec.tickSize,
    );
    const commission = roundMoney(args.order.lots * this.costs.commissionPerLot, this.moneyDecimals);
    this.commissionPaid = roundMoney(this.commissionPaid + commission, this.moneyDecimals);

    const beforeSide = this.position.side;
    const fillSteps = lotsToSteps(args.order.lots, this.spec.lotStep);
    const exitTicks = priceToTicks(execution.price, this.spec.tickSize);
    let pricePnl = 0;
    let outcome: Outcome;

    if (beforeSide === "long" || beforeSide === "short") {
      const exitSide: Side = beforeSide === "long" ? "sell" : "buy";
      if (args.order.side === exitSide) {
        const closedSteps = Math.min(fillSteps, this.lotSteps);
        const removed = (this.entryTickSteps * closedSteps) / this.lotSteps;
        pricePnl = pnlFromTickSteps(
          beforeSide,
          removed,
          exitTicks,
          closedSteps,
          this.spec,
          this.moneyDecimals,
        );
        if (fillSteps < this.lotSteps) {
          this.entryTickSteps -= removed;
          this.lotSteps -= closedSteps;
          outcome = "reduced";
        } else if (fillSteps === this.lotSteps) {
          this.entryTickSteps = 0;
          this.lotSteps = 0;
          this.flatten();
          outcome = "flattened";
        } else {
          const openSteps = fillSteps - this.lotSteps;
          this.entryTickSteps = exitTicks * openSteps;
          this.lotSteps = openSteps;
          this.position.side = args.order.side === "buy" ? "long" : "short";
          this.position.openedAt = args.time;
          this.position.stopLoss = null;
          this.position.takeProfit = null;
          outcome = "reversed";
        }
      } else {
        this.entryTickSteps += exitTicks * fillSteps;
        this.lotSteps += fillSteps;
        outcome = "added";
      }
    } else {
      this.entryTickSteps = exitTicks * fillSteps;
      this.lotSteps = fillSteps;
      this.position.side = args.order.side === "buy" ? "long" : "short";
      this.position.openedAt = args.time;
      this.position.stopLoss = null;
      this.position.takeProfit = null;
      outcome = "opened";
    }

    if (outcome !== "flattened") {
      this.position.lots = stepsToLots(this.lotSteps, this.spec.lotStep);
      this.position.averagePrice = averagePriceFromLedger(
        this.entryTickSteps,
        this.lotSteps,
        this.spec.tickSize,
      );
    }
    this.position.updatedAt = args.time;

    const realized = roundMoney(pricePnl - commission, this.moneyDecimals);
    this.realizedPnl = roundMoney(this.realizedPnl + realized, this.moneyDecimals);
    const fill: Fill = {
      id: `fill-${this.nextFillId++}`,
      orderId: args.order.id,
      symbol: this.spec.symbol,
      time: args.time,
      barCloseTime: args.barCloseTime,
      side: args.order.side,
      lots: args.order.lots,
      price: execution.price,
      referencePrice: execution.referencePrice,
      spread: this.costs.spread,
      spreadCost: execution.spreadCost,
      commission,
      realizedPnl: realized,
      reason: args.reason,
      ambiguous: args.ambiguous,
    };
    this.fills.push(fill);
    args.order.status = "filled";
    args.order.filledLots = args.order.lots;
    args.order.updatedAt = args.time;
    return { fill, outcome };
  }

  private armProtection(order: WorkingOrder, outcome: Outcome): void {
    if (outcome === "reduced" || outcome === "flattened") return;
    if (outcome === "added") {
      if (order.stopLossSpecified) this.position.stopLoss = order.stopLoss;
      if (order.takeProfitSpecified) this.position.takeProfit = order.takeProfit;
      return;
    }
    this.position.stopLoss = order.stopLossSpecified ? order.stopLoss : null;
    this.position.takeProfit = order.takeProfitSpecified ? order.takeProfit : null;
  }

  private flatten(): void {
    this.position.side = "flat";
    this.position.lots = 0;
    this.position.averagePrice = 0;
    this.position.stopLoss = null;
    this.position.takeProfit = null;
    this.position.openedAt = null;
  }

  private unrealized(): number {
    const mark = this.completedBar();
    if (!mark || (this.position.side !== "long" && this.position.side !== "short") || this.lotSteps === 0) {
      return 0;
    }
    return pnlFromTickSteps(
      this.position.side,
      this.entryTickSteps,
      priceToTicks(mark.close, this.spec.tickSize),
      this.lotSteps,
      this.spec,
      this.moneyDecimals,
    );
  }

  private protectionMark(): number | null {
    const bar = this.completedBar();
    if (bar) return bar.close;
    if (this.position.side === "flat") return null;
    return this.position.averagePrice > 0 ? this.position.averagePrice : null;
  }

  private completedBar(): MinuteBar | null {
    if (!this.lastBar || this.cursorMs === null || this.lastBarCloseMs === null) return null;
    if (this.lastBarCloseMs > this.cursorMs) return null;
    return this.lastBar;
  }

  private createOrder(input: {
    clientOrderId: string | null;
    type: OrderType;
    side: Side;
    lots: number;
    limitPrice: number | null;
    stopPrice: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    stopLossSpecified: boolean;
    takeProfitSpecified: boolean;
    time: string;
  }): WorkingOrder {
    const order: WorkingOrder = {
      id: `ord-${this.nextOrderId++}`,
      clientOrderId: input.clientOrderId,
      symbol: this.spec.symbol,
      type: input.type,
      side: input.side,
      lots: input.lots,
      limitPrice: input.limitPrice,
      stopPrice: input.stopPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      stopLossSpecified: input.stopLossSpecified,
      takeProfitSpecified: input.takeProfitSpecified,
      status: "working",
      filledLots: 0,
      createdAt: input.time,
      updatedAt: input.time,
    };
    this.orders.push(order);
    return order;
  }

  private stateError(state: ReplayBrokerState): string | null {
    if (!state || state.version !== 1) return "Broker state version must be 1.";
    if (state.symbol !== this.spec.symbol) return "Broker state is for a different symbol.";
    if (state.cursor !== null && parseTime(state.cursor) === null) return "Broker state cursor is not a timestamp.";
    if (state.lastBar) {
      const problem = barError(state.lastBar, this.spec.tickSize);
      if (problem) return problem;
    }
    if (!Array.isArray(state.orders) || !Array.isArray(state.fills)) return "Broker state orders and fills must be lists.";
    if (!this.positionShape(state.position)) return "Broker state position is not a net position.";
    if (state.position.symbol !== this.spec.symbol) return "Broker state position is for a different symbol.";
    if (!Number.isFinite(state.entryTickSteps) || !Number.isFinite(state.lotSteps) || state.lotSteps < 0) {
      return "Broker state size ledger is not usable.";
    }
    if (lotsToSteps(state.position.lots, this.spec.lotStep) !== state.lotSteps) {
      return "Broker state lots do not match the size ledger.";
    }
    if (state.position.side === "flat" && (state.lotSteps !== 0 || state.entryTickSteps !== 0)) {
      return "A flat position must have an empty size ledger.";
    }
    if (state.position.side !== "flat" && state.lotSteps === 0) {
      return "An open position needs a size ledger.";
    }
    if (!Number.isFinite(state.realizedPnl) || !Number.isFinite(state.commissionPaid)) {
      return "Broker state P&L is not a number.";
    }
    const orderIds = new Set<string>();
    for (const order of state.orders) {
      if (!order || typeof order.id !== "string" || orderIds.has(order.id)) return "Broker state has a bad order id.";
      orderIds.add(order.id);
      if (idNumber(order.id, "ord-") === null) return "Broker state has a bad order id.";
    }
    const fillIds = new Set<string>();
    for (const fill of state.fills) {
      if (!fill || typeof fill.id !== "string" || fillIds.has(fill.id)) return "Broker state has a bad fill id.";
      fillIds.add(fill.id);
      if (idNumber(fill.id, "fill-") === null) return "Broker state has a bad fill id.";
    }
    const maxOrder = maxId(state.orders.map((order) => order.id), "ord-");
    const maxFill = maxId(state.fills.map((fill) => fill.id), "fill-");
    if (!Number.isInteger(state.nextOrderId) || state.nextOrderId <= maxOrder) {
      return "Broker state next order id would collide.";
    }
    if (!Number.isInteger(state.nextFillId) || state.nextFillId <= maxFill) {
      return "Broker state next fill id would collide.";
    }
    return null;
  }

  private positionShape(position: Position): boolean {
    if (!position) return false;
    const side: PositionSide = position.side;
    if (side !== "long" && side !== "short" && side !== "flat") return false;
    if (typeof position.lots !== "number" || position.lots < 0) return false;
    if (position.stopLoss !== null && typeof position.stopLoss !== "number") return false;
    if (position.takeProfit !== null && typeof position.takeProfit !== "number") return false;
    return true;
  }

  private flatPosition(updatedAt: string | null): Position {
    return {
      symbol: this.spec.symbol,
      side: "flat",
      lots: 0,
      averagePrice: 0,
      stopLoss: null,
      takeProfit: null,
      openedAt: null,
      updatedAt,
    };
  }

  private positionCopy(): Position {
    return { ...this.position };
  }

  private orderCopy(order: WorkingOrder): WorkingOrder {
    return { ...order };
  }

  private fillCopy(fill: Fill): Fill {
    return { ...fill };
  }

  private ok(fills: Fill[], order: WorkingOrder | null): PortSuccess {
    return {
      ok: true,
      fills: fills.map((fill) => this.fillCopy(fill)),
      order: order ? this.orderCopy(order) : null,
      position: this.positionCopy(),
    };
  }

  private reject(code: RejectCode, message: string): PortFailure {
    return {
      ok: false,
      code,
      message,
      order: null,
      fills: [],
      position: this.positionCopy(),
    };
  }
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function idNumber(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) return null;
  const n = Number(id.slice(prefix.length));
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function maxId(ids: string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    const n = idNumber(id, prefix);
    if (n !== null && n > max) max = n;
  }
  return max;
}
