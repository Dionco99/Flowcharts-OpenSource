// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustmentCoefficient, eventualRuinUpperBound } from "../src/lundberg.ts";
import { parseRSample } from "../src/parse.ts";
import { analyzeEdge } from "../src/report.ts";
import { SAMPLE_FLAT, SAMPLE_NEGATIVE, SAMPLE_POSITIVE } from "../src/samples.ts";

const base = { horizon: 100, paths: 2000, startingR: 25, ruinAt: 0, seed: 1 };

test("the positive preset is a 40% win rate with a 2.3 payoff", () => {
  const report = analyzeEdge(SAMPLE_POSITIVE, base);
  assert.equal(report.stats.trades, 50);
  assert.equal(report.stats.winRate, 0.4);
  assert.equal(report.stats.lossRate, 0.6);
  assert.ok(Math.abs(report.stats.expectancy - 0.32) < 1e-12);
  assert.ok(Math.abs(report.stats.avgWin! - 2.3) < 1e-12);
  assert.equal(report.stats.avgLoss, -1);
  assert.ok(Math.abs(report.stats.payoffRatio! - 2.3) < 1e-12);
  assert.ok(Math.abs(report.expectedR - 32) < 1e-9);
  assert.ok(report.probabilityProfit > 0.85);
  assert.ok(report.typicalStreak !== null && report.typicalStreak >= 5);
  assert.equal(report.chartPaths.length, 12);
  assert.equal(report.chartPaths[0]!.length, 101);
  assert.equal(report.expectedEquity[0], 25);
  assert.ok(Math.abs(report.expectedEquity[100]! - (25 + 32)) < 1e-9);

  const histogramTotal = report.histogram.reduce((sum, bin) => sum + bin.probability, 0);
  assert.ok(Math.abs(histogramTotal - 1) < 1e-12);
  assert.ok(report.horizons.some((row) => row.trades === 100 && Math.abs(row.expectedR - 32) < 1e-9));
  const streaks = report.horizons.map((row) => row.typicalLosingStreak);
  for (let i = 1; i < streaks.length; i++) {
    assert.ok(streaks[i]! >= streaks[i - 1]!);
  }

  const thesis = report.reading.find((block) => block.role === "thesis");
  assert.ok(thesis?.text.startsWith("Profitability comes from repeating the same edge over a long sample."));
  assert.ok(report.reading.some((block) => block.text.includes("normal outcome")));
  assert.ok(report.reading.some((block) => block.text.includes("do not add uncertainty")));
  assert.equal(report.streakExpectation.exact, true);
  assert.ok(Math.abs(report.longestLosingStreak.mean - report.streakExpectation.value) < 0.6);
  assert.ok(report.eventualRuinUpperBound !== null && report.eventualRuinUpperBound < 0.2);
});

test("the same seed repeats, and a thin account ruins more often", () => {
  const again = analyzeEdge(SAMPLE_POSITIVE, base);
  const once = analyzeEdge(SAMPLE_POSITIVE, base);
  assert.equal(again.terminalR.p50, once.terminalR.p50);
  assert.equal(again.riskOfRuin, once.riskOfRuin);
  assert.deepEqual(again.chartPaths[0], once.chartPaths[0]);

  const other = analyzeEdge(SAMPLE_POSITIVE, { ...base, seed: 2 });
  assert.notEqual(other.chartPaths[0]!.join(","), once.chartPaths[0]!.join(","));

  const thin = analyzeEdge(SAMPLE_POSITIVE, { ...base, startingR: 4, paths: 1500, seed: 3 });
  const thick = analyzeEdge(SAMPLE_POSITIVE, { ...base, startingR: 40, paths: 1500, seed: 3 });
  assert.ok(thin.riskOfRuin > thick.riskOfRuin);
  assert.ok(thin.riskOfRuin > 0.05);
});

test("a flat sample does not become an edge when the horizon grows", () => {
  const report = analyzeEdge(SAMPLE_FLAT, base);
  assert.equal(report.stats.expectancy, 0);
  assert.equal(report.expectedR, 0);
  assert.ok(report.probabilityProfit > 0.3 && report.probabilityProfit < 0.7);
  assert.equal(report.eventualRuinUpperBound, 1);
  assert.ok(report.reading.some((block) => block.text.includes("does not have that edge")));
  const at20 = report.horizons.find((row) => row.trades === 20)!;
  const at500 = report.horizons.find((row) => row.trades === 500)!;
  assert.equal(at20.expectedR, 0);
  assert.equal(at500.expectedR, 0);
});

test("the same win rate with a 1R payoff is a negative edge", () => {
  const report = analyzeEdge(SAMPLE_NEGATIVE, base);
  assert.equal(report.stats.winRate, 0.4);
  assert.ok(Math.abs(report.stats.expectancy - -0.2) < 1e-12);
  assert.ok(Math.abs(report.stats.payoffRatio! - 1) < 1e-12);
  assert.ok(Math.abs(report.expectedR - -20) < 1e-9);
  assert.ok(report.probabilityProfit < 0.2);
  assert.equal(report.eventualRuinUpperBound, 1);
  assert.ok(report.reading.some((block) => block.text.includes("negative edge")));
  assert.ok(report.reading.some((block) => block.text.includes("does not have that edge")));
});

test("a pure losing sample ruins on schedule and a pure winning sample does not", () => {
  const losing = analyzeEdge([-1, -1], {
    horizon: 10,
    paths: 25,
    startingR: 5,
    ruinAt: 0,
    seed: 4,
    chartPaths: 2,
  });
  assert.equal(losing.stats.expectancy, -1);
  assert.equal(losing.expectedR, -10);
  assert.equal(losing.riskOfRuin, 1);
  assert.equal(losing.medianTradesToRuin, 5);
  assert.equal(losing.maxDrawdownR.mean, 5);
  assert.equal(losing.longestLosingStreak.mean, 5);
  assert.equal(losing.terminalR.mean, -5);
  assert.equal(losing.probabilityProfit, 0);
  assert.ok(losing.reading.some((block) => block.text.includes("Accounts that go broke stop")));

  const winning = analyzeEdge([1, 1, 1], {
    horizon: 10,
    paths: 20,
    startingR: 5,
    ruinAt: 0,
    seed: 4,
  });
  assert.equal(winning.expectedR, 10);
  assert.equal(winning.riskOfRuin, 0);
  assert.equal(winning.maxDrawdownR.max, 0);
  assert.equal(winning.longestLosingStreak.max, 0);
  assert.equal(winning.probabilityProfit, 1);
  assert.equal(winning.terminalR.min, 10);
});

test("starting already ruined is ruin at once", () => {
  const report = analyzeEdge([1, -1, 2], {
    horizon: 5,
    paths: 10,
    startingR: 0,
    ruinAt: 0,
    seed: 1,
  });
  assert.equal(report.riskOfRuin, 1);
  assert.equal(report.medianTradesToRuin, 0);
  assert.ok(report.reading.some((block) => block.text.includes("already ruined")));
});

test("Lundberg bound is exact for a 60/40 one-R walk", () => {
  const sample = [...Array(60).fill(1), ...Array(40).fill(-1)];
  const theta = adjustmentCoefficient(sample);
  assert.ok(theta !== null);
  assert.ok(Math.abs(theta - Math.log(1.5)) < 1e-8);
  const bound = eventualRuinUpperBound(sample, 10, 0.2);
  assert.ok(bound !== null);
  assert.ok(Math.abs(bound - (2 / 3) ** 10) < 1e-8);
});

test("parse accepts a paste and rejects words", () => {
  assert.deepEqual(parseRSample("1, 2, -3"), [1, 2, -3]);
  assert.deepEqual(parseRSample("1\n2\n3"), [1, 2, 3]);
  assert.deepEqual(parseRSample("+1.5, -.25; 4"), [1.5, -0.25, 4]);
  assert.deepEqual(parseRSample("1, 2,"), [1, 2]);
  assert.throws(() => parseRSample("1, two"), /two/);
  assert.throws(() => parseRSample("1e2"), /1e2/);
  assert.throws(() => parseRSample("   "), /at least one/);
  assert.throws(() => analyzeEdge([1], base), /at least two/);
});
