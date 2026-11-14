// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { formatR } from "../src/format.ts";
import { summarizePath } from "../src/path.ts";
import { normalCdf, percentile, probabilityProfitNormal, sampleStats } from "../src/stats.ts";

test("sample moments match a hand count", () => {
  const sample = [-1, -1, -1, 2, 2];
  const stats = sampleStats(sample);
  assert.equal(stats.trades, 5);
  assert.ok(Math.abs(stats.expectancy - 0.2) < 1e-12);
  assert.equal(stats.winRate, 0.4);
  assert.equal(stats.lossRate, 0.6);
  assert.equal(stats.scratchRate, 0);
  assert.equal(stats.avgWin, 2);
  assert.equal(stats.avgLoss, -1);
  assert.equal(stats.payoffRatio, 2);
  assert.ok(Math.abs(stats.profitFactor! - 4 / 3) < 1e-12);

  const sumSq = 3 * (-1.2) ** 2 + 2 * 1.8 ** 2;
  assert.ok(Math.abs(stats.empiricalVariance - sumSq / 5) < 1e-12);
  assert.ok(Math.abs(stats.stdev - Math.sqrt(sumSq / 4)) < 1e-12);
  assert.ok(Math.abs(stats.standardError - stats.stdev / Math.sqrt(5)) < 1e-12);
  assert.ok(Math.abs(stats.sqn! - (0.2 / stats.stdev) * Math.sqrt(5)) < 1e-12);
  assert.equal(formatR(stats.expectancy), "+0.20R");
});

test("decomposition equals the mean, including a scratch", () => {
  const sample = [-1, 0, 2, 3];
  const stats = sampleStats(sample);
  const rebuilt =
    stats.winRate * stats.avgWin! + stats.lossRate * stats.avgLoss! + stats.scratchRate * 0;
  assert.ok(Math.abs(rebuilt - stats.expectancy) < 1e-12);
  assert.equal(stats.scratchRate, 0.25);
});

test("no variance leaves SQN and the profit chance at the boundary", () => {
  const stats = sampleStats([1, 1, 1]);
  assert.equal(stats.stdev, 0);
  assert.equal(stats.sqn, null);
  assert.equal(stats.profitFactor, null);
  assert.equal(probabilityProfitNormal(stats.expectancy, stats.empiricalStdev, 10), 1);
  assert.equal(probabilityProfitNormal(-1, 0, 10), 0);
  assert.equal(probabilityProfitNormal(0, 0, 10), 0);
});

test("normal cdf is centered, symmetric, and close at 1.96", () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.95996398454) - 0.975) < 1e-4);
  assert.ok(Math.abs(normalCdf(-1.2) - (1 - normalCdf(1.2))) < 1e-8);
  assert.equal(normalCdf(Number.POSITIVE_INFINITY), 1);
  assert.equal(normalCdf(Number.NEGATIVE_INFINITY), 0);
});

test("type 7 percentile matches the known ranks", () => {
  const sorted = [1, 2, 3, 4, 5];
  assert.equal(percentile(sorted, 0), 1);
  assert.equal(percentile(sorted, 1), 5);
  assert.equal(percentile(sorted, 0.5), 3);
  assert.equal(percentile(sorted, 0.25), 2);
});

test("a short path's drawdown and streak are the peak-to-trough", () => {
  const path = summarizePath([1, -1, -1, 2]);
  assert.equal(path.totalR, 1);
  assert.equal(path.maxDrawdownR, 2);
  assert.equal(path.longestLosingStreak, 2);
  assert.deepEqual(summarizePath([1, 1]), {
    totalR: 2,
    maxDrawdownR: 0,
    longestLosingStreak: 0,
  });
});
