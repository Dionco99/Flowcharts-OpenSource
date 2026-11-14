// SPDX-License-Identifier: Apache-2.0

import type {
  AccountStats,
  BreakdownRow,
  ClosedTrade,
  EquityPoint,
} from "./types.js";

const SESSION_ORDER = ["Asia", "London", "New York"];
const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function buildEquity(startingBalance: number, trades: readonly ClosedTrade[]): EquityPoint[] {
  const points: EquityPoint[] = [
    {
      index: 0,
      at: trades[0]?.openedAt ?? "",
      label: "Start",
      balance: startingBalance,
      pnl: 0,
    },
  ];
  trades.forEach((trade, index) => {
    points.push({
      index: index + 1,
      at: trade.openedAt,
      label: trade.id,
      balance: trade.balanceAfter,
      pnl: trade.pnlCurrency,
    });
  });
  return points;
}

export function summarize(
  trades: readonly ClosedTrade[],
  startingBalance: number,
): { equity: EquityPoint[]; stats: AccountStats } {
  const equity = buildEquity(startingBalance, trades);
  const stats = computeStats(trades, equity);
  return { equity, stats };
}

function computeStats(trades: readonly ClosedTrade[], equity: readonly EquityPoint[]): AccountStats {
  let wins = 0;
  let losses = 0;
  let scratches = 0;
  let sumR = 0;
  let sumPnl = 0;
  let winR = 0;
  let lossR = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let sumPlanned = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;

  for (const trade of trades) {
    sumR += trade.rMultiple;
    sumPnl += trade.pnlCurrency;
    sumPlanned += trade.plannedRR;
    if (trade.pnlCurrency > 0) {
      wins += 1;
      winR += trade.rMultiple;
      grossProfit += trade.pnlCurrency;
      winStreak += 1;
      lossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, winStreak);
    } else if (trade.pnlCurrency < 0) {
      losses += 1;
      lossR += trade.rMultiple;
      grossLoss += -trade.pnlCurrency;
      lossStreak += 1;
      winStreak = 0;
      longestLossStreak = Math.max(longestLossStreak, lossStreak);
    } else {
      scratches += 1;
      winStreak = 0;
      lossStreak = 0;
    }
  }

  const tradeCount = trades.length;
  const winRate = tradeCount === 0 ? 0 : wins / tradeCount;
  const lossRate = tradeCount === 0 ? 0 : losses / tradeCount;
  const averageWinR = wins === 0 ? 0 : winR / wins;
  const averageLossR = losses === 0 ? 0 : Math.abs(lossR / losses);
  const drawdown = maxDrawdown(equity);

  return {
    tradeCount,
    wins,
    losses,
    scratches,
    winRate,
    averageR: tradeCount === 0 ? 0 : sumR / tradeCount,
    expectancyR: winRate * averageWinR - lossRate * averageLossR,
    expectancyCurrency: tradeCount === 0 ? 0 : sumPnl / tradeCount,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / grossLoss,
    maxDrawdown: drawdown.amount,
    maxDrawdownPct: drawdown.pct,
    longestWinStreak,
    longestLossStreak,
    averagePlannedRR: tradeCount === 0 ? 0 : sumPlanned / tradeCount,
    averageAchievedRR:
      wins === 0 ? 0 : losses === 0 ? Number.POSITIVE_INFINITY : averageWinR / averageLossR,
    grossProfit,
    grossLoss,
    pnlBySession: groupBy(trades, (trade) => trade.session, SESSION_ORDER),
    pnlByWeekday: groupBy(trades, (trade) => trade.weekday, WEEKDAY_ORDER),
    pnlBySetup: groupBy(trades, (trade) => trade.setup),
  };
}

function maxDrawdown(equity: readonly EquityPoint[]): { amount: number; pct: number } {
  let peak = equity[0]?.balance ?? 0;
  let amount = 0;
  let pct = 0;
  for (const point of equity) {
    if (point.balance > peak) peak = point.balance;
    const drop = peak - point.balance;
    if (drop > amount) {
      amount = drop;
      pct = peak > 0 ? drop / peak : 0;
    }
  }
  return { amount, pct };
}

function groupBy(
  trades: readonly ClosedTrade[],
  keyOf: (trade: ClosedTrade) => string,
  order?: readonly string[],
): BreakdownRow[] {
  const buckets = new Map<string, ClosedTrade[]>();
  for (const trade of trades) {
    const key = keyOf(trade);
    const list = buckets.get(key);
    if (list) list.push(trade);
    else buckets.set(key, [trade]);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    const ia = order?.indexOf(a) ?? -1;
    const ib = order?.indexOf(b) ?? -1;
    const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  return keys.map((key) => {
    const rows = buckets.get(key) ?? [];
    const wins = rows.filter((trade) => trade.pnlCurrency > 0).length;
    const pnl = rows.reduce((sum, trade) => sum + trade.pnlCurrency, 0);
    const averageR = rows.reduce((sum, trade) => sum + trade.rMultiple, 0) / rows.length;
    return {
      key,
      trades: rows.length,
      wins,
      pnl,
      averageR,
      winRate: wins / rows.length,
    };
  });
}
