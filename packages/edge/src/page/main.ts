// SPDX-License-Identifier: Apache-2.0

import {
  analyzeEdge,
  formatCount,
  formatMagnitude,
  formatPercent,
  formatPlain,
  formatR,
  parseRSample,
  PRESETS,
} from "../index.ts";
import type { EdgeReport } from "../index.ts";
import { drawdownChart, histogramChart, pathChart, streakChart } from "./charts.ts";
import "./style.css";

const CUSTOM = "custom";
const app = document.querySelector("#app");
if (!app) throw new Error("Missing #app");

let seed = 1;
let presetId = PRESETS[0]!.id;

const form = document.createElement("form");
form.className = "card controls";
form.noValidate = true;

const presetLabel = document.createElement("label");
presetLabel.htmlFor = "preset";
presetLabel.textContent = "Sample";
const preset = document.createElement("select");
preset.id = "preset";
for (const item of PRESETS) {
  const option = document.createElement("option");
  option.value = item.id;
  option.textContent = item.label;
  preset.append(option);
}
const customOption = document.createElement("option");
customOption.value = CUSTOM;
customOption.textContent = "Pasted sample";
preset.append(customOption);

const detail = document.createElement("p");
detail.className = "detail";
detail.id = "preset-detail";

const sampleLabel = document.createElement("label");
sampleLabel.htmlFor = "sample";
sampleLabel.textContent = "R results";
const sample = document.createElement("textarea");
sample.id = "sample";
sample.spellcheck = false;
sample.autocomplete = "off";
sample.rows = 6;

const fields = document.createElement("div");
fields.className = "fields";

function numberField(id: string, label: string, value: string, step: string): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.htmlFor = id;
  wrap.textContent = label;
  const input = document.createElement("input");
  input.id = id;
  input.type = "number";
  input.inputMode = "decimal";
  input.value = value;
  input.step = step;
  wrap.append(input);
  fields.append(wrap);
  return input;
}

const horizon = numberField("horizon", "Trades in each repetition", "100", "1");
const paths = numberField("paths", "Repetitions", "4000", "1");
const starting = numberField("starting", "Starting capital (R)", "25", "any");
const ruin = numberField("ruin", "Ruin at (R)", "0", "any");

const actions = document.createElement("div");
actions.className = "actions";
const runButton = document.createElement("button");
runButton.type = "submit";
runButton.textContent = "Run this sample";
const drawButton = document.createElement("button");
drawButton.type = "button";
drawButton.className = "secondary";
drawButton.textContent = "Draw again";
actions.append(runButton, drawButton);

form.append(presetLabel, preset, detail, sampleLabel, sample, fields, actions);

const figures = document.createElement("section");
figures.className = "card figures";
figures.setAttribute("aria-live", "polite");

const error = document.createElement("p");
error.className = "error";
error.id = "error";
error.setAttribute("role", "alert");

const result = document.createElement("div");
result.id = "result";

const setup = document.createElement("section");
setup.className = "setup";
setup.append(form, figures);
app.append(setup, error, result);

const assumptions = document.createElement("section");
assumptions.className = "assumptions";
const assumptionsTitle = document.createElement("h2");
assumptionsTitle.textContent = "What the numbers assume";
const assumptionList = document.createElement("ul");
for (const item of [
  "Each trade risks the same 1R, so results add. This is not a percent-of-equity simulation.",
  "A repetition draws every trade from the sample with replacement, independently. The total can differ from the recorded sample. If real trades cluster, streaks and drawdowns run longer than this.",
  "A losing trade is an R below zero. A scratch breaks a losing streak. Finished ahead means the account never hit ruin and the total R is above zero.",
  "Ruin means the account touched the ruin level and stopped. It does not keep trading.",
  "The upper bound on eventually hitting ruin uses the Lundberg coefficient of the sample. With unequal R steps a trade can jump past the barrier, so the bound is not a frequency from the repetitions.",
  "The chance of a profit in the table is a normal approximation that ignores the ruin stop. The percentage in What to expect is the share of repetitions.",
  "The repetitions treat the sample as the distribution of the next trade. The standard error is the separate uncertainty about whether that edge is real.",
  "The three built-in samples are synthetic. No market data is included. Nothing you paste leaves this browser.",
]) {
  const li = document.createElement("li");
  li.textContent = item;
  assumptionList.append(li);
}
assumptions.append(assumptionsTitle, assumptionList);
app.append(assumptions);

function presetText(id: string): string | null {
  const match = PRESETS.find((item) => item.id === id);
  return match ? match.sample.join(", ") : null;
}

function showDetail(id: string): void {
  const match = PRESETS.find((item) => item.id === id);
  detail.textContent = match
    ? match.detail
    : "These R values stay in the browser. Nothing is uploaded.";
}

function readPositiveInt(input: HTMLInputElement, label: string, min: number, max: number): number {
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} has to be a whole number from ${formatCount(min)} to ${formatCount(max)}.`);
  }
  return value;
}

function stat(label: string, value: string, tone?: "good" | "bad"): HTMLDivElement {
  const node = document.createElement("div");
  const name = document.createElement("div");
  name.className = "label";
  name.textContent = label;
  const number = document.createElement("div");
  number.className = tone ? `value ${tone}` : "value";
  number.textContent = value;
  node.append(name, number);
  return node;
}

function dash(value: number | null, digits = 2): string {
  return value === null ? "—" : formatPlain(value, digits);
}

function render(report: EdgeReport): void {
  figures.replaceChildren();
  const tone = report.stats.expectancy > 1e-9 ? "good" : report.stats.expectancy < -1e-9 ? "bad" : undefined;
  const heroes = document.createElement("div");
  heroes.className = "hero-stats";
  heroes.append(
    stat("Expectancy per trade", formatR(report.stats.expectancy), tone),
    stat(`Expected result over ${formatCount(report.horizon)} trades`, formatR(report.expectedR), tone),
  );
  const grid = document.createElement("div");
  grid.className = "stat-grid";
  grid.append(
    stat("Win rate", formatPercent(report.stats.winRate)),
    stat("Average win", report.stats.avgWin === null ? "—" : formatR(report.stats.avgWin)),
    stat("Average loss", report.stats.avgLoss === null ? "—" : formatR(report.stats.avgLoss)),
    stat("Payoff", dash(report.stats.payoffRatio)),
    stat("Profit factor", report.stats.profitFactor === null ? "No losses" : formatPlain(report.stats.profitFactor)),
    stat("Standard error", formatMagnitude(report.stats.standardError)),
    stat("Chance of a profit", formatPercent(report.probabilityProfit)),
    stat(
      "Risk of ruin",
      formatPercent(report.riskOfRuin),
      report.riskOfRuin >= 0.01 ? "bad" : undefined,
    ),
    stat("Average worst drawdown", formatMagnitude(report.maxDrawdownR.mean)),
    stat("Normal losing streak", report.typicalStreak === null ? "—" : String(report.typicalStreak)),
    stat("SQN", dash(report.stats.sqn)),
    stat("Seed", String(report.seed)),
  );
  const recorded = document.createElement("p");
  recorded.className = "recorded";
  recorded.textContent = `Recorded order: ${formatR(report.samplePath.totalR)} over ${formatCount(report.stats.trades)} trades, worst giveback ${formatMagnitude(report.samplePath.maxDrawdownR)}, longest losing streak ${report.samplePath.longestLosingStreak}.`;
  figures.append(heroes, grid, recorded);

  result.replaceChildren();
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${formatCount(report.paths)} repetitions of ${formatCount(report.horizon)} trades, seed ${report.seed}. Each trade risks the same 1R.`;

  const essay = document.createElement("section");
  essay.className = "essay";
  const essayTitle = document.createElement("h2");
  essayTitle.textContent = "What to expect";
  essay.append(essayTitle);
  for (const block of report.reading) {
    const paragraph = document.createElement("p");
    if (block.role === "thesis") paragraph.className = "thesis-line";
    paragraph.textContent = block.text;
    essay.append(paragraph);
  }

  const scale = document.createElement("section");
  scale.className = "scale";
  const scaleTitle = document.createElement("h2");
  scaleTitle.textContent = "The edge grows with the sample. The streak grows slowly.";
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent =
    "Expected result is expectancy times the number of trades. Chance of a profit is a normal approximation. The losing streak is the longest run that still happens in at least half of repetitions. At the horizon you set, use the repetitions in What to expect.";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const name of ["Trades", "Expected result", "Chance of a profit", "Normal losing streak"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const row of report.horizons) {
    const tr = document.createElement("tr");
    if (row.trades === report.horizon) tr.className = "selected";
    const cells = [
      formatCount(row.trades),
      formatR(row.expectedR),
      formatPercent(row.probabilityProfit),
      row.typicalLosingStreak === null ? "—" : String(row.typicalLosingStreak),
    ];
    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(caption, head, body);
  tableWrap.append(table);
  scale.append(scaleTitle, tableWrap);

  const charts = document.createElement("div");
  charts.className = "charts";
  charts.append(
    figure(
      `Where ${formatCount(report.horizon)} trades of this edge land`,
      histogramChart(report),
      report.terminalR.min > 0
        ? "Every repetition finished ahead. The line is the expected result. Bars to the left of zero would be losing samples."
        : report.terminalR.max < 0
          ? "Every repetition finished behind. The line is the expected result."
          : "Each bar is the share of repetitions whose total R landed in that range. The line is the expected result.",
    ),
    figure(
      "Losing streaks are part of the loss rate",
      report.streaks.length > 0 ? streakChart(report) : note("No losing trades in this sample."),
      report.streaks.length > 0
        ? `The dark bar is a streak you should expect: it still shows up in at least half of repetitions. Average longest streak across the repetitions: ${formatPlain(report.longestLosingStreak.mean, 1)}.`
        : "This sample never loses, so the repetitions have no losing streak.",
    ),
    figure(
      "A few repetitions, and the expected account",
      pathChart(report),
      "Faint lines are 12 repetitions. A line that goes flat stopped at ruin. The solid line is the starting capital plus expectancy each trade: the edge if you stay in for every trade.",
    ),
    figure(
      "Worst drawdown in a repetition",
      drawdownChart(report),
      "Each bar is a percentile of the worst giveback. The dark bar is the drawdown nine in ten repetitions stay inside.",
    ),
  );

  result.append(meta, essay, scale, charts);
}

function note(text: string): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "chart-note";
  paragraph.textContent = text;
  return paragraph;
}

function figure(title: string, graphic: SVGSVGElement | HTMLParagraphElement, captionText: string): HTMLElement {
  const node = document.createElement("figure");
  const heading = document.createElement("h3");
  heading.textContent = title;
  const caption = document.createElement("figcaption");
  caption.textContent = captionText;
  node.append(heading, graphic, caption);
  return node;
}

function run(): void {
  error.textContent = "";
  sample.removeAttribute("aria-invalid");
  try {
    const trades = parseRSample(sample.value);
    const report = analyzeEdge(trades, {
      horizon: readPositiveInt(horizon, "Trades in each repetition", 1, 1000),
      paths: readPositiveInt(paths, "Repetitions", 100, 10000),
      startingR: finiteField(starting, "Starting capital"),
      ruinAt: finiteField(ruin, "Ruin"),
      seed,
    });
    render(report);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not read that sample.";
    error.textContent = message;
    sample.setAttribute("aria-invalid", "true");
    figures.replaceChildren();
    result.replaceChildren();
  }
}

function finiteField(input: HTMLInputElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error(`${label} has to be a finite number of R.`);
  return value;
}

preset.addEventListener("change", () => {
  presetId = preset.value;
  showDetail(presetId);
  const text = presetText(presetId);
  if (text !== null) {
    sample.value = text;
    seed = 1;
    run();
  }
});

sample.addEventListener("input", () => {
  const text = presetText(presetId);
  if (text !== null && sample.value !== text) {
    presetId = CUSTOM;
    preset.value = CUSTOM;
    showDetail(CUSTOM);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  run();
});

drawButton.addEventListener("click", () => {
  seed += 1;
  run();
});

sample.value = presetText(PRESETS[0]!.id) ?? "";
showDetail(PRESETS[0]!.id);
run();
