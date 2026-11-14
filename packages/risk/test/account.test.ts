// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, createFixture, lotStepsThatFit, simulate, summarize } from "../src/index.js";
import type { ClosedTrade, RiskSettings, TradePlan } from "../src/index.js";

const CLEAN: RiskSettings = {
  accountSize: 100_000,
  riskPerTrade: 0.01,
  defaultRR: 2,
  commissionPerLot: 0,
  spread: 0,
  symbol: { lotSize: 100_000, lotStep: 0.01, tickSize: 0.00001 },
};

function near(actual: number, expected: number, epsilon = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${expected} ± ${epsilon}, got ${actual}`,
  );
}

function plan(overrides: Partial<TradePlan> = {}): TradePlan {
  return {
    id: "T1",
    side: "long",
    entry: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.102,
    openedAt: "2026-01-05T08:00:00.000Z",
    session: "London",
    setup: "Breakout",
    exit: "target",
    ...overrides,
  };
}

function closed(overrides: Partial<ClosedTrade> = {}): ClosedTrade {
  return {
    id: "T1",
    side: "long",
    entry: 1.1,
    stopLoss: 1.099,
    takeProfit: 1.102,
    openedAt: "2026-01-05T08:00:00.000Z",
    session: "London",
    setup: "Breakout",
    weekday: "Monday",
    exit: "target",
    exitPrice: 1.102,
    fillEntry: 1.1,
    fillExit: 1.102,
    lots: 10,
    units: 1_000_000,
    balanceBefore: 100_000,
    riskCurrency: 1_000,
    commission: 0,
    spreadCost: 0,
    pnlCurrency: 1_000,
    rMultiple: 1,
    plannedRR: 2,
    achievedRR: 1,
    balanceAfter: 101_000,
    ...overrides,
  };
}

describe("lot steps", () => {
  it("fits an exact number of steps and refuses to round through the budget", () => {
    assert.equal(lotStepsThatFit(1000, 100, 0.01), 1000);
    assert.equal(lotStepsThatFit(1020, 100, 0.01), 1020);
    assert.equal(lotStepsThatFit(1000, 117, 0.01), 854);
    assert.equal(lotStepsThatFit(999.17, 117, 0.01), 853);
    assert.equal(lotStepsThatFit(0.5, 100, 0.01), 0);
  });
});

describe("settle", () => {
  it("pays the planned multiple when spread and commission are zero", () => {
    const longWin = simulate(CLEAN, [plan()]);
    const trade = longWin.trades[0];
    assert.ok(trade);
    assert.equal(trade.lots, 10);
    near(trade.riskCurrency, 1000);
    near(trade.pnlCurrency, 2000);
    near(trade.rMultiple, 2, 1e-9);
    near(trade.balanceAfter, 102_000);
    assert.equal(trade.weekday, "Monday");

    const longLoss = simulate(CLEAN, [plan({ id: "L", exit: "stop" })]);
    near(longLoss.trades[0]?.rMultiple ?? NaN, -1, 1e-9);
    near(longLoss.trades[0]?.pnlCurrency ?? NaN, -1000);

    const shortLoss = simulate(CLEAN, [
      plan({ id: "S", side: "short", stopLoss: 1.101, takeProfit: 1.098, exit: "stop" }),
    ]);
    near(shortLoss.trades[0]?.rMultiple ?? NaN, -1, 1e-9);

    const shortWin = simulate(CLEAN, [
      plan({ id: "SW", side: "short", stopLoss: 1.101, takeProfit: 1.098, exit: "target" }),
    ]);
    near(shortWin.trades[0]?.rMultiple ?? NaN, 2, 1e-9);
    near(shortWin.trades[0]?.pnlCurrency ?? NaN, 2000);
  });

  it("puts spread and commission inside 1R, so a stop is -1 and a target pays less than the drawing", () => {
    const settings: RiskSettings = { ...DEFAULT_SETTINGS };
    const longTarget = plan({
      entry: 1.1,
      stopLoss: 1.098,
      takeProfit: 1.104,
      exit: "target",
    });
    const report = simulate(settings, [longTarget]);
    const trade = report.trades[0];
    assert.ok(trade);
    assert.equal(trade.lots, 4.6);
    assert.ok(Math.abs(trade.riskCurrency - 998.2) < 1e-6);
    assert.ok(Math.abs(trade.pnlCurrency - 1761.8) < 1e-6);
    assert.ok(Math.abs(trade.rMultiple - 1761.8 / 998.2) < 1e-9);
    assert.equal(trade.plannedRR, 2);
    assert.ok(trade.rMultiple < trade.plannedRR);
    assert.ok(trade.riskCurrency <= 1000 + 1e-6);
    assert.equal(trade.fillEntry, 1.1001);

    const stopped = simulate(settings, [plan({ ...longTarget, id: "SL", exit: "stop" })]);
    assert.ok(Math.abs((stopped.trades[0]?.rMultiple ?? 0) + 1) < 1e-12);

    const shortStopped = simulate(settings, [
      plan({
        id: "SS",
        side: "short",
        entry: 1.1,
        stopLoss: 1.102,
        takeProfit: 1.096,
        exit: "stop",
      }),
    ]);
    assert.ok(Math.abs((shortStopped.trades[0]?.rMultiple ?? 0) + 1) < 1e-12);
    assert.equal(shortStopped.trades[0]?.fillExit, 1.1021);
  });

  it("sizes the next trade from the updated balance", () => {
    const report = simulate(CLEAN, [
      plan({ id: "A", openedAt: "2026-01-05T08:00:00.000Z" }),
      plan({ id: "B", openedAt: "2026-01-05T09:00:00.000Z" }),
    ]);
    near(report.trades[1]?.balanceBefore ?? NaN, 102_000);
    assert.equal(report.trades[1]?.lots, 10.2);
    near(report.trades[1]?.riskCurrency ?? NaN, 1020);
    near(report.trades[1]?.rMultiple ?? NaN, 2, 1e-9);
    near(report.balance, 104_040);
  });

  it("orders trades by open time and leaves the input list alone", () => {
    const later = plan({ id: "A", openedAt: "2026-01-06T08:00:00.000Z", exit: "stop" });
    const earlier = plan({ id: "B", openedAt: "2026-01-05T08:00:00.000Z", exit: "target" });
    const input = [later, earlier];
    const report = simulate(CLEAN, input);
    assert.deepEqual(input.map((item) => item.id), ["A", "B"]);
    assert.deepEqual(report.trades.map((item) => item.id), ["B", "A"]);
    assert.equal(report.trades[0]?.balanceBefore, 100_000);
  });

  it("places a missing target at the default reward multiple", () => {
    const report = simulate(CLEAN, [plan({ takeProfit: undefined })]);
    near(report.trades[0]?.takeProfit ?? NaN, 1.102, 1e-9);
    near(report.trades[0]?.plannedRR ?? NaN, 2, 1e-9);
  });

  it("skips a trade the budget cannot fund and keeps the balance", () => {
    const settings: RiskSettings = {
      ...CLEAN,
      accountSize: 100,
      riskPerTrade: 0.01,
    };
    const report = simulate(settings, [
      plan({ entry: 1.1, stopLoss: 1.09, takeProfit: 1.12, exit: "target" }),
    ]);
    assert.equal(report.trades.length, 0);
    assert.equal(report.balance, 100);
    assert.equal(report.skipped[0]?.reason, "Risk budget is smaller than the minimum lot.");
  });

  it("skips invalid prices, a missing manual exit, and a bad timestamp", () => {
    const report = simulate(CLEAN, [
      plan({ id: "bad-stop", stopLoss: 1.2 }),
      plan({ id: "bad-time", openedAt: "not-a-time" }),
      plan({ id: "bad-manual", exit: "manual" }),
      plan({ id: "ok", exit: "stop" }),
    ]);
    assert.deepEqual(report.trades.map((trade) => trade.id), ["ok"]);
    assert.equal(report.skipped.length, 3);
    near(report.balance, 99_000);
  });

  it("rejects a risk fraction outside the account", () => {
    assert.throws(() => simulate({ ...CLEAN, riskPerTrade: 0 }, []), /Risk per trade/);
    assert.throws(() => simulate({ ...CLEAN, accountSize: 0 }, []), /Account size/);
  });
});

describe("stats", () => {
  it("scores drawdown, streaks, expectancy, profit factor, and the three breakdowns", () => {
    const trades = [
      closed({ id: "A", pnlCurrency: 1000, rMultiple: 1, balanceAfter: 101_000, session: "London", setup: "Breakout", weekday: "Monday" }),
      closed({ id: "B", pnlCurrency: 1000, rMultiple: 1, balanceAfter: 102_000, session: "London", setup: "Breakout", weekday: "Monday" }),
      closed({ id: "C", pnlCurrency: -1000, rMultiple: -1, balanceAfter: 101_000, session: "New York", setup: "Reversal", weekday: "Tuesday" }),
      closed({ id: "D", pnlCurrency: -1000, rMultiple: -1, balanceAfter: 100_000, session: "New York", setup: "Reversal", weekday: "Tuesday" }),
      closed({ id: "E", pnlCurrency: -500, rMultiple: -0.5, balanceAfter: 99_500, session: "Asia", setup: "Range fade", weekday: "Wednesday" }),
      closed({ id: "F", pnlCurrency: 0, rMultiple: 0, balanceAfter: 99_500, session: "Asia", setup: "Continuation", weekday: "Wednesday" }),
      closed({ id: "G", pnlCurrency: 2000, rMultiple: 2, balanceAfter: 101_500, plannedRR: 3, session: "London", setup: "Breakout", weekday: "Thursday" }),
    ];
    const { stats, equity } = summarize(trades, 100_000);
    assert.equal(equity.length, 8);
    assert.equal(stats.wins, 3);
    assert.equal(stats.losses, 3);
    assert.equal(stats.scratches, 1);
    assert.equal(stats.winRate, 3 / 7);
    assert.equal(stats.longestWinStreak, 2);
    assert.equal(stats.longestLossStreak, 3);
    assert.equal(stats.maxDrawdown, 2500);
    assert.ok(Math.abs(stats.maxDrawdownPct - 2500 / 102_000) < 1e-12);
    assert.equal(stats.grossProfit, 4000);
    assert.equal(stats.grossLoss, 2500);
    assert.equal(stats.profitFactor, 4000 / 2500);
    assert.ok(Math.abs(stats.averageR - (1 + 1 - 1 - 1 - 0.5 + 0 + 2) / 7) < 1e-12);
    const expectancy = (3 / 7) * (4 / 3) - (3 / 7) * (2.5 / 3);
    assert.ok(Math.abs(stats.expectancyR - expectancy) < 1e-12);
    assert.equal(stats.averageAchievedRR, (4 / 3) / (2.5 / 3));
    assert.equal(stats.averagePlannedRR, (2 * 6 + 3) / 7);
    assert.equal(stats.pnlBySession.map((row) => row.key).join(","), "Asia,London,New York");
    assert.equal(stats.pnlBySession[1]?.pnl, 4000);
    assert.equal(stats.pnlByWeekday.map((row) => row.key).join(","), "Monday,Tuesday,Wednesday,Thursday");
    assert.equal(stats.pnlBySetup.find((row) => row.key === "Reversal")?.pnl, -2000);
    assert.equal(stats.pnlBySetup[0]?.key, "Breakout");
  });

  it("reports an open profit factor when nothing loses", () => {
    const { stats } = summarize([closed({ pnlCurrency: 500, rMultiple: 0.5 })], 100_000);
    assert.equal(stats.profitFactor, Number.POSITIVE_INFINITY);
    assert.equal(stats.averageAchievedRR, Number.POSITIVE_INFINITY);
    assert.equal(stats.maxDrawdown, 0);
  });

  it("returns a flat book for an empty session", () => {
    const report = simulate(CLEAN, []);
    assert.equal(report.balance, 100_000);
    assert.equal(report.stats.tradeCount, 0);
    assert.equal(report.stats.winRate, 0);
    assert.equal(report.stats.profitFactor, 0);
    assert.equal(report.equity.length, 1);
  });
});

describe("fixture", () => {
  it("is a deterministic generated book with no bundled prices outside the plans", () => {
    const first = createFixture();
    const second = createFixture();
    assert.equal(first.length, 80);
    assert.deepEqual(first, second);
    for (const trade of first) {
      assert.ok(trade.entry > 1 && trade.entry < 1.3);
      assert.ok(["Asia", "London", "New York"].includes(trade.session));
      assert.ok(["Breakout", "Continuation", "Range fade", "Reversal"].includes(trade.setup));
      assert.equal(Object.hasOwn(trade, "candles"), false);
    }
    const report = simulate(DEFAULT_SETTINGS, first);
    assert.equal(report.skipped.length, 0);
    assert.equal(report.trades.length, 80);
    assert.equal(report.equity.length, 81);
    assert.equal(report.equity[0]?.balance, 100_000);
    assert.equal(report.equity[80]?.balance, report.balance);
    for (const trade of report.trades) {
      assert.ok(trade.riskCurrency <= trade.balanceBefore * 0.01 + 1e-6);
      if (trade.exit === "stop") {
        assert.ok(Math.abs(trade.rMultiple + 1) < 1e-9, trade.id);
      }
      if (trade.exit === "target") {
        assert.ok(trade.pnlCurrency > 0, trade.id);
        assert.ok(trade.rMultiple < trade.plannedRR, trade.id);
      }
    }
    const weekdays = new Set(report.stats.pnlByWeekday.map((row) => row.key));
    assert.equal(weekdays.has("Saturday"), false);
    assert.equal(weekdays.has("Sunday"), false);
    assert.ok(report.stats.pnlBySession.length >= 2);
    assert.ok(report.stats.pnlBySetup.length >= 2);
  });
});
