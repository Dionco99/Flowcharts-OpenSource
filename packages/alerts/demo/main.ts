// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import {
  ALERTS_STORAGE_KEY,
  AlertLog,
  WATCHLIST_STORAGE_KEY,
  WatchlistBook,
  browserStore,
  demoScenario,
  hotlist,
  recordingPorts,
  screen,
} from "../src/index.ts";

const scenario = demoScenario();
const books = [
  { symbol: "EURUSD", bars: scenario.eurusd.bars },
  { symbol: "GBPUSD", bars: scenario.gbpusd.bars },
];
const recorded = recordingPorts();
const store = browserStore(localStorage);
const lastIndex = scenario.eurusd.bars.length - 1;

const log = loadLog();
const watch = loadWatch();
let cursorIndex = indexFor(log.cursor());
let picked = "";

const cursorInput = document.querySelector<HTMLInputElement>("#cursor")!;
const cursorLabel = document.querySelector<HTMLElement>("#cursor-label")!;
const alertsBody = document.querySelector<HTMLElement>("#alerts")!;
const outbox = document.querySelector<HTMLElement>("#outbox")!;
const screenerBody = document.querySelector<HTMLElement>("#screener")!;
const hotlistEl = document.querySelector<HTMLElement>("#hotlist")!;
const quotesBody = document.querySelector<HTMLElement>("#quotes")!;
const results = document.querySelector<HTMLElement>("#results")!;
const searchInput = document.querySelector<HTMLInputElement>("#search")!;
const spark = document.querySelector<SVGSVGElement>("#spark")!;

cursorInput.max = String(lastIndex);
document.querySelector<HTMLButtonElement>("#run")!.addEventListener("click", () => {
  void show(lastIndex);
});
document.querySelector<HTMLButtonElement>("#start")!.addEventListener("click", () => {
  void show(0);
});
cursorInput.addEventListener("input", () => {
  void show(Number(cursorInput.value));
});
searchInput.addEventListener("input", renderSearch);
results.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("button");
  if (!button) return;
  picked = button.dataset.symbol ?? "";
  for (const item of results.querySelectorAll("button")) item.dataset.picked = item === button ? "1" : "";
});
document.querySelector<HTMLButtonElement>("#add-symbol")!.addEventListener("click", () => {
  if (!picked) return;
  watch.add("main", { symbol: picked, label: picked });
  void show(cursorIndex);
});
quotesBody.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("button");
  const symbol = button?.dataset.remove;
  if (!symbol) return;
  watch.remove("main", symbol);
  void show(cursorIndex);
});

renderSearch();
void show(cursorIndex);

function loadLog(): AlertLog {
  const saved = store.get(ALERTS_STORAGE_KEY);
  if (!saved) {
    const created = new AlertLog(recorded.ports);
    for (const alert of scenario.alerts) created.arm(alert);
    return created;
  }
  return AlertLog.fromJSON(saved, recorded.ports);
}

function loadWatch(): WatchlistBook {
  const saved = store.get(WATCHLIST_STORAGE_KEY);
  if (saved) return WatchlistBook.fromJSON(saved);
  const book = new WatchlistBook();
  book.create("Main", "main");
  book.add("main", { symbol: "EURUSD", label: "Euro" });
  book.add("main", { symbol: "GBPUSD", label: "Cable" });
  return book;
}

function indexFor(cursor: string | null): number {
  if (!cursor) return 0;
  let index = 0;
  for (let i = 0; i < scenario.eurusd.bars.length; i += 1) {
    if (scenario.eurusd.bars[i].closeTime <= cursor) index = i;
  }
  return index;
}

async function show(index: number): Promise<void> {
  cursorIndex = Math.max(0, Math.min(lastIndex, index));
  const cursor = scenario.eurusd.bars[cursorIndex].closeTime;
  document.body.dataset.ready = "0";
  await log.advance(books, cursor);
  store.set(ALERTS_STORAGE_KEY, log.toJSON());
  store.set(WATCHLIST_STORAGE_KEY, watch.toJSON());
  cursorInput.value = String(cursorIndex);
  cursorLabel.textContent = cursor;
  drawSpark(cursorIndex);
  renderAlerts();
  renderOutbox();
  renderScreener(cursor);
  renderQuotes(cursor);
  document.body.dataset.cursor = cursor;
  document.body.dataset.ready = "1";
}

function renderAlerts(): void {
  alertsBody.replaceChildren(
    ...log.list().map((row) => {
      const tr = document.createElement("tr");
      tr.append(cell(row.name), cell(row.status, `status-${row.id}`, `status-${row.status}`), cell(row.message ?? ""));
      return tr;
    }),
  );
}

function renderOutbox(): void {
  outbox.replaceChildren(
    ...recorded.outbox.map((item) => {
      const li = document.createElement("li");
      li.dataset.kind = item.kind;
      li.textContent = `${item.kind}: ${item.event.message}`;
      return li;
    }),
  );
}

function renderScreener(cursor: string): void {
  const rows = [
    { symbol: "EURUSD", bars: scenario.eurusd.bars },
    { symbol: "GBPUSD", bars: scenario.gbpusd.bars },
  ];
  const hits = screen(rows, scenario.filters, cursor);
  screenerBody.replaceChildren(
    ...hits.map((hit) => {
      const tr = document.createElement("tr");
      tr.dataset.testid = `screen-${hit.symbol}`;
      tr.append(cell(hit.symbol), cell(hit.metrics.percent ?? ""), cell(hit.metrics.volumeRatio ?? ""));
      return tr;
    }),
  );
  const movers = hotlist(rows, cursor, { by: "percent", lookback: 10, side: "gainers" });
  hotlistEl.replaceChildren(
    ...movers.map((row) => {
      const li = document.createElement("li");
      if (row.rank === 1) li.dataset.testid = "hotlist-top";
      li.textContent = `${row.symbol} ${row.metric}%`;
      return li;
    }),
  );
}

function renderQuotes(cursor: string): void {
  const quotes = watch.quotes("main", books, cursor);
  quotesBody.replaceChildren(
    ...quotes.map((quote) => {
      const tr = document.createElement("tr");
      tr.dataset.testid = `quote-${quote.symbol}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.remove = quote.symbol;
      remove.dataset.testid = `remove-${quote.symbol}`;
      remove.textContent = "Remove";
      const action = document.createElement("td");
      action.append(remove);
      tr.append(cell(quote.label ? `${quote.symbol} ${quote.label}` : quote.symbol), cell(quote.last ?? "—", `last-${quote.symbol}`), cell(quote.change ?? "—"), action);
      return tr;
    }),
  );
}

function renderSearch(): void {
  const matches = watch.search(searchInput.value, scenario.catalog);
  results.replaceChildren(
    ...matches.map((match) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.symbol = match.symbol;
      button.dataset.testid = `pick-${match.symbol}`;
      button.textContent = `${match.symbol} · ${match.name ?? match.venue ?? ""}`;
      if (match.symbol === picked) button.dataset.picked = "1";
      return button;
    }),
  );
}

function drawSpark(index: number): void {
  spark.replaceChildren();
  const closes = scenario.eurusd.bars.slice(0, index + 1).map((bar) => Number(bar.close));
  if (closes.length < 2) {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", "8");
    dot.setAttribute("cy", "40");
    dot.setAttribute("r", "3");
    dot.setAttribute("fill", "#1c1915");
    spark.append(dot);
    return;
  }
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const points = closes
    .map((close, point) => {
      const x = (point / (closes.length - 1)) * 400;
      const y = 74 - ((close - min) / span) * 68;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "#1c1915");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("points", points);
  spark.append(line);
}

function cell(text: string, testId?: string, className?: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  if (testId) td.dataset.testid = testId;
  if (className) td.className = className;
  return td;
}
