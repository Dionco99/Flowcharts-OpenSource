// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared order and position records.
 *
 * Strategies talk only to {@link BrokerPort}. Stage 1's replay matcher is
 * `ReplayFillAdapter`. Later live adapters implement the same port and are
 * not imported here: OANDA (`oanda`), cTrader (`ctrader`),
 * TradeLocker (`tradelocker`), MT5 (`mt5`), IBKR (`ibkr`), Alpaca (`alpaca`),
 * Tradovate (`tradovate`), CCXT (`ccxt`).
 */

export type Side = "buy" | "sell";

export type PositionSide = "long" | "short" | "flat";

export type OrderType = "market" | "limit" | "stop";

export type OrderStatus = "working" | "filled" | "cancelled";

/** Why a fill happened. `close` is a user close; protective exits use the other two. */
export type FillReason =
  | "market"
  | "limit"
  | "stop"
  | "stop_loss"
  | "take_profit"
  | "close";

export type RejectCode =
  | "cursor_not_set"
  | "invalid_time"
  | "invalid_lots"
  | "invalid_price"
  | "missing_price"
  | "invalid_protection"
  | "invalid_order"
  | "no_completed_bar"
  | "order_not_found"
  | "order_not_working"
  | "position_flat"
  | "close_exceeds_position"
  | "bar_after_cursor"
  | "bar_out_of_order"
  | "invalid_bar"
  | "invalid_state";

/** One symbol. Stage 1 is a single FX pair; the fields are market-agnostic. */
export interface SymbolSpec {
  symbol: string;
  /** Minimum price increment, in price units. */
  tickSize: number;
  /** Quote-currency units represented by 1.0 lot. */
  lotSize: number;
  /** Minimum lot increment. */
  lotStep: number;
}

/**
 * Execution costs. Bar OHLC are mid prices. `spread` is the full bid-ask
 * width in price units. Commission is quote currency per lot.
 */
export interface CostModel {
  spread: number;
  commissionPerLot: number;
  /** Quote-currency rounding. Defaults to 2. */
  moneyDecimals?: number;
}

/** One completed minute. Times are ISO-8601. High and low contain open and close. */
export interface MinuteBar {
  openTime: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PlaceOrderRequest {
  /** Retried unchanged, returns the original order and does not fill again. */
  clientOrderId?: string;
  type: OrderType;
  side: Side;
  lots: number;
  /** Required for a limit. Mid price. */
  limitPrice?: number;
  /** Required for a stop. Mid price. */
  stopPrice?: number;
  /**
   * Protective mid level attached when this order opens, adds, or reverses.
   * Omit to leave an existing level alone on an add. `null` clears it.
   * On a new position, omit and `null` both mean no level.
   */
  stopLoss?: number | null;
  /** Same rules as `stopLoss`. */
  takeProfit?: number | null;
}

export interface ModifyOrderRequest {
  orderId: string;
  lots?: number;
  limitPrice?: number;
  stopPrice?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export interface CloseRequest {
  /** Omit to close the whole position. A smaller size reduces it. */
  lots?: number;
  /** Same idempotency rule as {@link PlaceOrderRequest.clientOrderId}. */
  clientOrderId?: string;
}

export interface ModifyProtectionRequest {
  /** Omit to leave the level. `null` clears it. Mid price. */
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export interface WorkingOrder {
  id: string;
  clientOrderId: string | null;
  symbol: string;
  type: OrderType;
  side: Side;
  lots: number;
  limitPrice: number | null;
  stopPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  /** False means this order does not change the position stop on an add. */
  stopLossSpecified: boolean;
  /** False means this order does not change the position target on an add. */
  takeProfitSpecified: boolean;
  status: OrderStatus;
  filledLots: number;
  createdAt: string;
  updatedAt: string;
}

/** Single net position. Stage 1 does not keep hedged tickets. */
export interface Position {
  symbol: string;
  side: PositionSide;
  /** Absolute size. Zero when flat. */
  lots: number;
  /** Volume-weighted average execution price, after spread. Zero when flat. */
  averagePrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: string | null;
  updatedAt: string | null;
}

export interface Fill {
  id: string;
  orderId: string;
  symbol: string;
  /** When the user acted, or the bar close for a matcher fill. ISO-8601. */
  time: string;
  /** Close time of the minute that supplied the price. Null only if unknown. */
  barCloseTime: string | null;
  side: Side;
  /** Full order size, including lots that open a new side on a reversal. */
  lots: number;
  /** Execution price after spread. */
  price: number;
  /** Mid price the fill was matched against, before spread. */
  referencePrice: number;
  /** Full bid-ask width from the cost model. */
  spread: number;
  /** Price units applied against this fill after tick rounding. */
  spreadCost: number;
  commission: number;
  /**
   * Quote-currency result of this fill. Opens are minus commission.
   * Closes are price P&L minus this fill's commission. A reversal reports
   * only the closed portion.
   */
  realizedPnl: number;
  reason: FillReason;
  /**
   * True when one minute traded through both the stop and the target.
   * The fill is the stop, not the target.
   */
  ambiguous: boolean;
}

export interface BrokerSnapshot {
  symbol: string;
  position: Position;
  /** Working orders only, oldest first. */
  orders: WorkingOrder[];
  /** Every fill, oldest first. */
  fills: Fill[];
  realizedPnl: number;
  /**
   * Open position marked to the last completed mid close.
   * Does not include the spread or commission of an exit.
   */
  unrealizedPnl: number;
  commissionPaid: number;
}

export interface PortSuccess {
  ok: true;
  order: WorkingOrder | null;
  /** Fills created by this call. Empty on a client-order-id retry. */
  fills: Fill[];
  position: Position;
}

export interface PortFailure {
  ok: false;
  code: RejectCode;
  message: string;
  order: null;
  fills: [];
  position: Position;
}

export type PortResult = PortSuccess | PortFailure;

/**
 * The broker port. Replay trades use it now. Later paper, prop-rule, and
 * live adapters replace the implementation; strategies keep these calls.
 */
export interface BrokerPort {
  /** Stable id. Stage 1's matcher is `replay`. */
  readonly adapterId: string;
  place(request: PlaceOrderRequest): PortResult;
  modify(request: ModifyOrderRequest): PortResult;
  cancel(orderId: string): PortResult;
  close(request?: CloseRequest): PortResult;
  modifyProtection(request: ModifyProtectionRequest): PortResult;
  snapshot(): BrokerSnapshot;
}

/**
 * Plain session-file book for the replay adapter. Costs and the symbol spec
 * stay on the adapter. `entryTickSteps` is the exact open-position ledger:
 * sum of execution ticks times lot steps.
 */
export interface ReplayBrokerState {
  version: 1;
  symbol: string;
  cursor: string | null;
  lastBar: MinuteBar | null;
  position: Position;
  /** Working, filled, and cancelled. Kept so a client order id survives reload. */
  orders: WorkingOrder[];
  fills: Fill[];
  realizedPnl: number;
  commissionPaid: number;
  entryTickSteps: number;
  lotSteps: number;
  nextOrderId: number;
  nextFillId: number;
}
