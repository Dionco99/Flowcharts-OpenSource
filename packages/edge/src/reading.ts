// SPDX-License-Identifier: Apache-2.0

import { formatCount, formatMagnitude, formatPercent, formatR } from "./format.ts";
import type { Percentiles, ReadingBlock, SampleStats } from "./types.ts";

export type ReadingInput = {
  stats: SampleStats;
  horizon: number;
  paths: number;
  startingR: number;
  ruinAt: number;
  expectedR: number;
  probabilityProfit: number;
  probabilityProfitNormal: number;
  terminalR: Percentiles;
  maxDrawdownR: Percentiles;
  riskOfRuin: number;
  medianTradesToRuin: number | null;
  typical: { length: number; probability: number } | null;
  uncommon: { length: number; probability: number } | null;
  eventualRuinUpperBound: number | null;
};

function horizonPhrase(horizon: number): string {
  return horizon === 1 ? "1 trade" : `${formatCount(horizon)} trades`;
}

export function buildReading(input: ReadingInput): ReadingBlock[] {
  const edge = input.stats.expectancy;
  const flat = Math.abs(edge) <= 1e-9;
  const positive = edge > 1e-9;
  const over = input.horizon === 1 ? "Over 1 trade" : `Over ${formatCount(input.horizon)} trades`;
  const half =
    input.terminalR.p25 === input.terminalR.p75
      ? `The middle of the repetitions landed on ${formatR(input.terminalR.p50)}.`
      : `Half of them landed between ${formatR(input.terminalR.p25)} and ${formatR(input.terminalR.p75)}.`;

  let result: string;
  if (positive) {
    result = `Each trade in this sample is worth ${formatR(edge)} on average. ${over} the expected result is ${formatR(input.expectedR)}. Of ${formatCount(input.paths)} repetitions, ${formatPercent(input.probabilityProfit)} finished ahead. ${half}`;
  } else if (!flat) {
    result = `Each trade in this sample costs ${formatMagnitude(edge)} on average. ${over} the expected result is ${formatR(input.expectedR)}. Of ${formatCount(input.paths)} repetitions, ${formatPercent(input.probabilityProfit)} finished ahead. Repeating a negative edge loses money. A longer sample does not repair it.`;
  } else {
    result = `This sample's edge is ${formatR(0)}. ${over} the expected result is still ${formatR(0)}. Of ${formatCount(input.paths)} repetitions, ${formatPercent(input.probabilityProfit)} finished ahead. ${half} A longer sample spreads the results out. It does not turn a flat system into a profitable one.`;
  }
  if (Math.abs(input.probabilityProfit - input.probabilityProfitNormal) >= 0.05) {
    result += ` The normal approximation would say ${formatPercent(input.probabilityProfitNormal)}. The R values are not symmetric, so the repetitions are the number to use.`;
  }
  if (input.riskOfRuin > 0 && Math.abs(input.terminalR.mean - input.expectedR) >= 1) {
    result += ` That ${formatR(input.expectedR)} is the edge if every trade is taken. Accounts that go broke stop, so the average account finished at ${formatR(input.terminalR.mean)}.`;
  }

  const caution = `The standard error around that per-trade edge is ${formatMagnitude(input.stats.standardError)} from these ${formatCount(input.stats.trades)} trades. Repetitions draw each future trade from the sample, independently. They do not add uncertainty about whether the sample edge is the true one.`;

  let streak: string;
  if (input.stats.lossRate === 0) {
    streak =
      "This sample has no losing trade. Repetitions cannot produce a losing streak the sample never took.";
  } else if (input.typical === null) {
    const one = input.uncommon;
    const chance = one ? formatPercent(one.probability) : "under 50%";
    streak = `Losses are uncommon in this sample. A losing streak of even one trade inside ${horizonPhrase(input.horizon)} shows up in ${chance} of repetitions.`;
  } else {
    const run = input.horizon === 1 ? "a single trade" : `a run of ${formatCount(input.horizon)} trades`;
    const tradesWord = input.typical.length === 1 ? "trade" : "trades";
    streak = `Losing streaks belong to a ${formatPercent(input.stats.lossRate)} loss rate. In ${run}, a streak of at least ${input.typical.length} losing ${tradesWord} shows up in ${formatPercent(input.typical.probability)} of repetitions. That is a normal outcome inside this system, not a sign the edge has left.`;
    if (input.uncommon && input.uncommon.length > input.typical.length) {
      streak += ` A streak of ${input.uncommon.length} is less common, about ${formatPercent(input.uncommon.probability)} of repetitions, and it is still inside the system.`;
    }
  }

  const drawdown =
    input.maxDrawdownR.mean <= 1e-9
      ? "These repetitions do not give anything back."
      : `The average worst drawdown across repetitions is ${formatMagnitude(input.maxDrawdownR.mean)}.`;
  const nine =
    input.maxDrawdownR.p90 <= 1e-9
      ? "Nine in ten repetitions have no drawdown."
      : `Nine in ten repetitions stay inside a ${formatMagnitude(input.maxDrawdownR.p90)} drawdown.`;

  let ruin: string;
  if (input.startingR <= input.ruinAt) {
    ruin = `The account starts at or below ${formatR(input.ruinAt)}, so every repetition is already ruined.`;
  } else if (input.riskOfRuin === 0) {
    ruin = `None of the ${formatCount(input.paths)} repetitions reached ${formatR(input.ruinAt)} from a start of ${formatR(input.startingR)}. At this size the drawdown is the risk that shows up, not ruin.`;
  } else {
    const shown = formatPercent(input.riskOfRuin);
    const broke = shown === "0.0%" || shown === "<0.1%"
      ? "Fewer than 0.1% of repetitions went broke"
      : `${shown} of repetitions went broke`;
    ruin = `Starting from ${formatR(input.startingR)}, with ruin at ${formatR(input.ruinAt)}, ${broke} inside ${horizonPhrase(input.horizon)}.`;
    if (
      input.medianTradesToRuin !== null &&
      input.medianTradesToRuin > 0 &&
      input.riskOfRuin >= 0.01
    ) {
      const trade = Math.round(input.medianTradesToRuin);
      ruin += ` Among those that went broke, the median time was trade ${formatCount(trade)}.`;
    }
  }

  let bound = "";
  if (positive && input.eventualRuinUpperBound !== null && input.startingR > input.ruinAt) {
    bound = ` If you never stop, an upper bound on eventually hitting ruin is ${formatPercent(input.eventualRuinUpperBound)}.`;
  } else if (!positive && input.eventualRuinUpperBound === 1 && input.startingR > input.ruinAt) {
    bound = " Keep trading and a lower barrier is certain. There is no positive edge to outrun it.";
  }

  const together =
    input.horizon === 1
      ? "the next trade"
      : `the next ${formatCount(input.horizon)} trades taken together`;
  const thesis = positive
    ? `Profitability comes from repeating the same edge over a long sample. The expectancy belongs to ${together}, not to the next trade, and not to the next losing streak.`
    : "Profitability comes from repeating the same edge over a long sample. This sample does not have that edge, so repeating it for longer is not a path to a profit.";

  return [
    { role: "result", text: result },
    { role: "caution", text: caution },
    { role: "streak", text: streak },
    { role: "risk", text: `${drawdown} ${nine} ${ruin}${bound}` },
    { role: "thesis", text: thesis },
  ];
}
