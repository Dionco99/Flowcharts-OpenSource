// SPDX-License-Identifier: Apache-2.0

export type Side = "long" | "short";

export type ExitKind = "stop" | "target" | "manual";

/** Instrument conventions the sizer needs. Prices stay in the caller's units. */
export interface SymbolSpec {
  /** Units in one standard lot. A spot FX major is 100_000. */
  lotSize: number;
  /** Smallest lot increment, such as 0.01. */
  lotStep: number;
  /** Minimum price increment. Recorded with the spec; sizing uses the prices it is given. */
  tickSize: number;
}

/**
 * What the desk sets before a replay session.
 * Risk is a fraction of the simulated balance at the moment the trade is sized.
 */
export interface RiskSettings {
  /** Starting simulated balance, in account currency. */
  accountSize: number;
  /** Fraction of current balance risked on the next trade. 0.01 is one percent. */
  riskPerTrade: number;
  /** Reward multiple used when a trade omits its take-profit. */
  defaultRR: number;
  /** Round-turn commission in account currency per standard lot. */
  commissionPerLot: number;
  /** Bid-ask spread in price units. Chart prices are treated as the bid. */
  spread: number;
  symbol: SymbolSpec;
}

/** One replay trade the desk already decided, including how it resolved. */
export interface TradePlan {
  id: string;
  side: Side;
  /** Chart entry (bid). */
  entry: number;
  stopLoss: number;
  /** Chart target. Omit it and the default reward multiple places the target. */
  takeProfit?: number;
  /** ISO-8601 open time. Weekday stats use the UTC day. */
  openedAt: string;
  /** Session label, such as Asia, London, or New York. */
  session: string;
  /** Setup label the desk uses for the breakdown. */
  setup: string;
  exit: ExitKind;
  /** Chart exit price. Required when exit is "manual". */
  exitPrice?: number;
}

export interface ClosedTrade {
  id: string;
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: string;
  session: string;
  setup: string;
  /** UTC weekday of openedAt. */
  weekday: string;
  exit: ExitKind;
  /** Chart price the trade left at. */
  exitPrice: number;
  /** Bid/ask price actually paid on entry. */
  fillEntry: number;
  /** Bid/ask price actually paid on exit. */
  fillExit: number;
  lots: number;
  units: number;
  balanceBefore: number;
  /** Account currency lost if the stop fills, including spread and commission. This is 1R. */
  riskCurrency: number;
  commission: number;
  /** Account currency paid as spread. */
  spreadCost: number;
  pnlCurrency: number;
  /** Currency result divided by riskCurrency. A filled stop is -1. */
  rMultiple: number;
  /** |target - entry| / |entry - stop|, from the chart levels. */
  plannedRR: number;
  /** Signed chart move divided by the stop distance. A filled stop is -1. */
  achievedRR: number;
  balanceAfter: number;
}

export interface SkippedTrade {
  id: string;
  reason: string;
}

export interface EquityPoint {
  index: number;
  at: string;
  label: string;
  balance: number;
  pnl: number;
}

export interface BreakdownRow {
  key: string;
  trades: number;
  wins: number;
  pnl: number;
  averageR: number;
  winRate: number;
}

export interface AccountStats {
  tradeCount: number;
  wins: number;
  losses: number;
  scratches: number;
  /** Wins divided by closed trades. */
  winRate: number;
  /** Mean realized R. */
  averageR: number;
  /** Win rate × average winning R − loss rate × average losing R. */
  expectancyR: number;
  /** Mean currency P&L per closed trade. */
  expectancyCurrency: number;
  /** Gross winning currency divided by gross losing currency. */
  profitFactor: number;
  /** Largest peak-to-trough drop on the equity curve, in account currency. */
  maxDrawdown: number;
  /** Max drawdown divided by the equity peak it fell from. */
  maxDrawdownPct: number;
  longestWinStreak: number;
  longestLossStreak: number;
  /** Mean planned reward-to-risk from the chart levels. */
  averagePlannedRR: number;
  /**
   * Realized payoff ratio: average winning R divided by average losing R.
   * Infinite when the sample has winners and no losers.
   */
  averageAchievedRR: number;
  grossProfit: number;
  grossLoss: number;
  pnlBySession: BreakdownRow[];
  pnlByWeekday: BreakdownRow[];
  pnlBySetup: BreakdownRow[];
}

export interface AccountReport {
  settings: RiskSettings;
  startingBalance: number;
  balance: number;
  netPnl: number;
  trades: ClosedTrade[];
  skipped: SkippedTrade[];
  equity: EquityPoint[];
  stats: AccountStats;
}
