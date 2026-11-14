// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_SETTINGS, RiskError, createFixture, simulate } from "../src/index.js";
import type { AccountReport, BreakdownRow, EquityPoint, RiskSettings } from "../src/index.js";

const FIXTURE = createFixture();
const SVG = "http://www.w3.org/2000/svg";

const form = must<HTMLFormElement>("#session-form");
const errorBox = must<HTMLElement>("#form-error");
const runLine = must<HTMLElement>("#run-line");
const skippedList = must<HTMLElement>("#skipped");
const statsHost = must<HTMLElement>("#stats");
const equityHost = must<HTMLElement>("#equity");
const equityCaption = must<HTMLElement>("#equity-caption");

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Dashboard markup is missing ${selector}.`);
  return node;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  paint();
});

paint();

function paint(): void {
  errorBox.hidden = true;
  errorBox.textContent = "";
  try {
    const currency = readText("currency") || "USD";
    const riskPercent = readNumber("risk-percent");
    if (!(riskPercent > 0) || riskPercent > 100) {
      throw new RiskError("invalid_settings", "Risk per trade must be above 0 and at most 100.");
    }
    const settings: RiskSettings = {
      accountSize: readNumber("account-size"),
      riskPerTrade: riskPercent / 100,
      defaultRR: readNumber("default-rr"),
      commissionPerLot: readNumber("commission"),
      spread: readNumber("spread"),
      symbol: {
        lotSize: readNumber("lot-size"),
        lotStep: readNumber("lot-step"),
        tickSize: DEFAULT_SETTINGS.symbol.tickSize,
      },
    };
    render(simulate(settings, FIXTURE), currency);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The session settings could not be read.";
    errorBox.hidden = false;
    errorBox.textContent = message;
  }
}

function render(report: AccountReport, currency: string): void {
  const money = (value: number) => formatMoney(value, currency);
  const first = report.trades[0];
  const last = report.trades[report.trades.length - 1];
  runLine.textContent = [
    `${report.trades.length} closed`,
    `${report.skipped.length} skipped`,
    first ? `first risk ${money(first.riskCurrency)}` : "no sized trade",
    last ? `last risk ${money(last.riskCurrency)}` : "",
    `${FIXTURE.length} generated trades`,
  ]
    .filter(Boolean)
    .join(" · ");

  skippedList.replaceChildren();
  skippedList.hidden = report.skipped.length === 0;
  for (const skipped of report.skipped.slice(0, 8)) {
    const item = document.createElement("li");
    item.textContent = `${skipped.id}: ${skipped.reason}`;
    skippedList.append(item);
  }

  const { stats } = report;
  const cards: Card[] = [
    {
      key: "balance",
      label: "Balance",
      value: money(report.balance),
      sub: `${signed(report.netPnl, currency)} net`,
      tone: tone(report.netPnl),
    },
    {
      key: "win-rate",
      label: "Win rate",
      value: formatPercent(stats.winRate),
      sub: `${stats.wins} / ${stats.tradeCount}`,
    },
    {
      key: "average-r",
      label: "Average R",
      value: formatR(stats.averageR),
      sub: `${stats.tradeCount} trades`,
      tone: tone(stats.averageR),
    },
    {
      key: "expectancy",
      label: "Expectancy",
      value: formatR(stats.expectancyR),
      sub: `${signed(stats.expectancyCurrency, currency)} / trade`,
      tone: tone(stats.expectancyR),
    },
    {
      key: "profit-factor",
      label: "Profit factor",
      value: formatRatio(stats.profitFactor),
      sub: `${money(stats.grossProfit)} / ${money(stats.grossLoss)}`,
    },
    {
      key: "max-drawdown",
      label: "Max drawdown",
      value: money(stats.maxDrawdown),
      sub: formatPercent(stats.maxDrawdownPct) + " of peak",
      tone: stats.maxDrawdown > 0 ? "down" : "",
    },
    {
      key: "win-streak",
      label: "Win streak",
      value: String(stats.longestWinStreak),
      sub: "longest run",
    },
    {
      key: "loss-streak",
      label: "Loss streak",
      value: String(stats.longestLossStreak),
      sub: "longest run",
    },
    {
      key: "rr",
      label: "RR achieved",
      value: formatRatio(stats.averageAchievedRR),
      sub: `planned ${formatRatio(stats.averagePlannedRR)}`,
    },
  ];
  statsHost.replaceChildren(
    ...cards.map((card) => {
      const article = document.createElement("article");
      article.className = "stat";
      article.dataset["stat"] = card.key;
      const label = document.createElement("span");
      label.textContent = card.label;
      const value = document.createElement("b");
      value.textContent = card.value;
      if (card.tone) value.classList.add(card.tone);
      const sub = document.createElement("em");
      sub.textContent = card.sub;
      article.append(label, value, sub);
      return article;
    }),
  );

  renderEquity(report.equity, report.startingBalance, currency);
  const end = report.equity[report.equity.length - 1]?.balance ?? report.startingBalance;
  equityCaption.textContent = `${money(report.startingBalance)} start · ${money(end)} end`;
  renderBreakdown(document.querySelector("#by-session"), report.stats.pnlBySession, currency);
  renderBreakdown(document.querySelector("#by-weekday"), report.stats.pnlByWeekday, currency);
  renderBreakdown(document.querySelector("#by-setup"), report.stats.pnlBySetup, currency);
  renderTrades(report, currency);
}

function renderEquity(points: EquityPoint[], start: number, currency: string): void {
  equityHost.replaceChildren();
  const width = 800;
  const height = 280;
  const padL = 8;
  const padR = 8;
  const padY = 16;
  const balances = points.map((point) => point.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const span = max - min || Math.abs(max) || 1;
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;
  const xOf = (index: number) =>
    points.length === 1 ? width / 2 : padL + (index / (points.length - 1)) * (width - padL - padR);
  const yOf = (balance: number) => padY + (1 - (balance - lo) / (hi - lo)) * (height - padY * 2);
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(2)} ${yOf(point.balance).toFixed(2)}`)
    .join(" ");
  const area = `${line} L${xOf(points.length - 1).toFixed(2)} ${height} L${xOf(0).toFixed(2)} ${height} Z`;
  const baseY = yOf(start);

  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Equity curve from ${formatMoney(start, currency)} to ${formatMoney(points[points.length - 1]?.balance ?? start, currency)}`,
  );
  svg.append(
    path(area, "rgba(224, 194, 122, 0.13)", "none"),
    path(`M${padL} ${baseY.toFixed(2)} L${width - padR} ${baseY.toFixed(2)}`, "none", "#3d4a40"),
    path(line, "none", "#e0c27a"),
  );
  svg.append(
    text(padL + 6, Math.max(16, yOf(max) + 4), formatMoney(max, currency)),
    text(padL + 6, Math.min(height - 8, yOf(min) - 6), formatMoney(min, currency)),
  );
  equityHost.append(svg);
}

function renderBreakdown(host: Element | null, rows: readonly BreakdownRow[], currency: string): void {
  if (!host) return;
  host.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "caption";
    empty.textContent = "No closed trades.";
    host.append(empty);
    return;
  }
  const table = document.createElement("table");
  table.append(head(["", "Trades", "Win rate", "Avg R", "P&L"]));
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.append(
      cell(row.key),
      cell(String(row.trades), true),
      cell(formatPercent(row.winRate), true),
      cell(formatR(row.averageR), true, tone(row.averageR)),
      cell(signed(row.pnl, currency), true, tone(row.pnl)),
    );
    body.append(tr);
  }
  table.append(body);
  host.append(table);
}

function renderTrades(report: AccountReport, currency: string): void {
  const host = document.querySelector("#trades");
  if (!host) return;
  host.replaceChildren();
  const table = document.createElement("table");
  table.append(
    head([
      "#",
      "Opened",
      "Weekday",
      "Session",
      "Setup",
      "Side",
      "Entry",
      "Stop",
      "Target",
      "Exit",
      "Lots",
      "Planned",
      "R",
      "P&L",
      "Balance",
    ]),
  );
  const body = document.createElement("tbody");
  report.trades.forEach((trade, index) => {
    const tr = document.createElement("tr");
    tr.append(
      cell(String(index + 1), true),
      cell(trade.openedAt.slice(0, 16).replace("T", " ")),
      cell(trade.weekday),
      cell(trade.session),
      cell(trade.setup),
      cell(trade.side === "long" ? "Long" : "Short", false, trade.side === "long" ? "up" : "down"),
      cell(trade.entry.toFixed(5), true),
      cell(trade.stopLoss.toFixed(5), true),
      cell(trade.takeProfit.toFixed(5), true),
      cell(trade.exit),
      cell(trade.lots.toFixed(2), true),
      cell(trade.plannedRR.toFixed(2), true),
      cell(formatR(trade.rMultiple), true, tone(trade.rMultiple)),
      cell(signed(trade.pnlCurrency, currency), true, tone(trade.pnlCurrency)),
      cell(formatMoney(trade.balanceAfter, currency), true),
    );
    body.append(tr);
  });
  table.append(body);
  host.append(table);
}

function head(labels: string[]): HTMLTableSectionElement {
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  labels.forEach((label, index) => {
    const th = document.createElement("th");
    th.textContent = label;
    if (index > 0 && label !== "Weekday" && label !== "Session" && label !== "Setup" && label !== "Side" && label !== "Exit" && label !== "Opened") {
      th.classList.add("num");
    }
    tr.append(th);
  });
  thead.append(tr);
  return thead;
}

function cell(value: string, numeric = false, toneName = ""): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = value;
  if (numeric) td.classList.add("num");
  if (toneName) td.classList.add(toneName);
  return td;
}

function path(d: string, fill: string, stroke: string): SVGPathElement {
  const element = document.createElementNS(SVG, "path");
  element.setAttribute("d", d);
  element.setAttribute("fill", fill);
  element.setAttribute("stroke", stroke);
  element.setAttribute("stroke-width", stroke === "none" ? "0" : "2");
  if (stroke !== "none" && stroke !== "#e0c27a") element.setAttribute("stroke-dasharray", "4 4");
  return element;
}

function text(x: number, y: number, value: string): SVGTextElement {
  const element = document.createElementNS(SVG, "text");
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("fill", "#d5ddd4");
  element.setAttribute("stroke", "#171d19");
  element.setAttribute("stroke-width", "4");
  element.setAttribute("paint-order", "stroke");
  element.setAttribute("font-size", "12");
  element.textContent = value;
  return element;
}

function readNumber(id: string): number {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  return Number(input?.value);
}

function readText(id: string): string {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() ?? "";
}

function formatMoney(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "";
  const body = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${body} ${currency}`;
}

function signed(value: number, currency: string): string {
  if (value > 0) return `+${formatMoney(value, currency)}`;
  return formatMoney(value, currency);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatR(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return value === Number.POSITIVE_INFINITY ? "∞" : "—";
  return value.toFixed(2);
}

function tone(value: number): "up" | "down" | "" {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "";
}

interface Card {
  key: string;
  label: string;
  value: string;
  sub: string;
  tone?: "up" | "down" | "";
}
