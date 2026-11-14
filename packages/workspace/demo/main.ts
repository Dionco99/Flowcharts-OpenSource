// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { dispose, init, registerIndicator, type Chart } from "klinecharts";
import {
  LayoutBook,
  WorkspaceError,
  browserStore,
  buildView,
  crossStrategy,
  effectiveLocked,
  formatUtc,
  generateMinutes,
  groupNodes,
  HookRegistry,
  registerWorkspaceIndicators,
  renameNode,
  reorderNode,
  replaceStudySettings,
  replaceStudyStyles,
  sampleSpec,
  setCandleType,
  setCrosshairSync,
  setLayoutName,
  setLocked,
  setPeriod,
  setPriceScale,
  setVisible,
  showCrosshair,
  smaIndicator,
  starterLayout,
  syncChart,
  syncCursors,
  treeRows,
  deleteNode,
  type CursorRecord,
  type Layout,
} from "../src/index.ts";

const spec = sampleSpec();
const tapeBars = generateMinutes(spec, "2024-06-02T21:00:00Z", "2024-06-16T21:00:00Z", 20240602);
const last = tapeBars[tapeBars.length - 1];
if (!last) {
  throw new Error("sample tape is empty");
}
const tape = { spec, bars: tapeBars };
const cursor = last.closeTime;

const hooks = new HookRegistry();
hooks.registerIndicator(smaIndicator);
hooks.registerStrategy(crossStrategy);
registerWorkspaceIndicators(registerIndicator, hooks.listIndicators());

const book = new LayoutBook(browserStore(window.localStorage));
let layout = starterLayout(last.close, last.openTime);
let cursors: CursorRecord[] = layout.panes.map((pane) => ({ paneId: pane.id, time: null }));
let ranBacktest = false;
let syncing = false;

const charts = new Map<string, Chart>();

declare global {
  interface Window {
    __flowchartCharts?: Chart[];
  }
}

function message(text: string): void {
  const node = document.querySelector("#message");
  if (node) {
    node.textContent = text;
  }
}

function paint(): void {
  let view;
  try {
    view = buildView(tape, cursor, layout, hooks);
  } catch (error) {
    message(error instanceof Error ? error.message : "Could not draw the workspace");
    return;
  }
  const stats = document.querySelector("#stats");
  if (stats) {
    const forming = view.window.forming ? "yes" : "no";
    stats.textContent = `${layout.period} · ${view.window.bars.length} closed · forming ${forming}`;
    stats.setAttribute("data-period", layout.period);
    stats.setAttribute("data-closed", String(view.window.bars.length));
    stats.setAttribute("data-forming", forming);
  }
  for (const pane of view.panes) {
    const chart = charts.get(pane.id);
    if (chart) {
      syncChart(chart, view, pane);
    }
  }
  renderTree();
  renderCursors();
  renderBacktest(view);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-period]")) {
    button.setAttribute("aria-pressed", button.dataset.period === layout.period ? "true" : "false");
  }
  const candle = document.querySelector<HTMLSelectElement>("#candle");
  const scale = document.querySelector<HTMLSelectElement>("#scale");
  const sync = document.querySelector<HTMLInputElement>("#sync");
  if (candle) {
    candle.value = layout.candleType;
  }
  if (scale) {
    scale.value = layout.priceScale;
  }
  if (sync) {
    sync.checked = layout.crosshairSync;
  }
  const study = layout.panes.flatMap((pane) => pane.studies).find((entry) => entry.id === "sma");
  const period = document.querySelector<HTMLInputElement>("#sma-period");
  const color = document.querySelector<HTMLInputElement>("#sma-color");
  const locked = study ? effectiveLocked(layout, study.id) : true;
  if (period && study && document.activeElement !== period) {
    period.value = String(study.settings.period ?? 5);
    period.disabled = !study || locked;
  }
  if (color && study && document.activeElement !== color) {
    const value = study.styles.sma?.color ?? "#4C8DFF";
    color.value = value.length === 4 ? expandColor(value) : value;
    color.disabled = locked;
  }
  const name = document.querySelector<HTMLInputElement>("#layout-name");
  if (name && document.activeElement !== name) {
    name.value = layout.name;
  }
  window.__flowchartCharts = [...charts.values()];
}

function expandColor(value: string): string {
  return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
}

function renderCursors(): void {
  for (const record of cursors) {
    const node = document.querySelector(`[data-testid="cursor-${record.paneId}"]`);
    if (node) {
      node.textContent = record.time ?? "—";
    }
  }
}

function renderBacktest(view: ReturnType<typeof buildView>): void {
  const node = document.querySelector("#backtest-summary");
  if (!node) {
    return;
  }
  const backtest = view.backtests.find((entry) => entry.id === "cross");
  if (!ranBacktest || !backtest) {
    node.textContent = "Not run";
    return;
  }
  node.textContent = `${backtest.result.summary.tradeCount} trades · net ${backtest.result.summary.net}`;
}

function renderTree(): void {
  const list = document.querySelector("#tree");
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const row of treeRows(layout)) {
    const item = document.createElement("li");
    item.dataset.id = row.node.id;
    item.dataset.kind = row.node.kind;
    item.dataset.parent = row.node.parentId ?? "";
    item.dataset.index = String(row.node.index);
    item.dataset.visible = String(row.node.visible);
    item.dataset.locked = String(row.node.locked);
    item.style.paddingLeft = `${row.depth * 14}px`;
    const pick = document.createElement("input");
    pick.type = "checkbox";
    pick.dataset.action = "pick";
    const body = document.createElement("div");
    body.className = "row";
    const name = document.createElement("input");
    name.dataset.action = "name";
    name.value = row.node.name;
    name.addEventListener("change", () => {
      try {
        layout = renameNode(layout, row.node.id, name.value);
        message("");
        paint();
      } catch (error) {
        message(errorText(error));
        paint();
      }
    });
    body.append(name, button(row.node.visible ? "Hide" : "Show", () => {
      layout = setVisible(layout, row.node.id, !row.node.visible);
      paint();
    }, "visible"), button(row.node.locked ? "Unlock" : "Lock", () => {
      layout = setLocked(layout, row.node.id, !row.node.locked);
      paint();
    }, "lock"), button("Up", () => {
      try {
        layout = reorderNode(layout, row.node.id, row.node.index - 1);
        message("");
      } catch (error) {
        message(errorText(error));
      }
      paint();
    }, "up"), button("Down", () => {
      try {
        layout = reorderNode(layout, row.node.id, row.node.index + 1);
        message("");
      } catch (error) {
        message(errorText(error));
      }
      paint();
    }, "down"), button("Delete", () => {
      try {
        layout = deleteNode(layout, row.node.id);
        message("");
      } catch (error) {
        message(errorText(error));
      }
      paint();
    }, "delete"));
    item.append(pick, body);
    list.append(item);
  }
}

function button(label: string, onClick: () => void, action: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.dataset.action = action;
  node.addEventListener("click", onClick);
  return node;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

function selectedIds(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('#tree [data-action="pick"]:checked')].flatMap((box) => {
    const id = box.closest("li")?.dataset.id;
    return id ? [id] : [];
  });
}

function refreshSaved(): void {
  const select = document.querySelector<HTMLSelectElement>("#saved");
  if (!select) {
    return;
  }
  const names = book.list();
  select.replaceChildren();
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  }
}

function onCrosshair(paneId: string, timeMs: number, price: number): void {
  if (syncing) {
    return;
  }
  const time = formatUtc(timeMs);
  cursors = syncCursors(cursors, time, layout.crosshairSync, paneId);
  renderCursors();
  if (!layout.crosshairSync) {
    return;
  }
  syncing = true;
  try {
    for (const [id, chart] of charts) {
      if (id !== paneId) {
        showCrosshair(chart, time, price);
      }
    }
  } finally {
    syncing = false;
  }
}

function mount(): void {
  for (const pane of layout.panes) {
    const container = document.querySelector(`#chart-${pane.id}`);
    if (!(container instanceof HTMLElement)) {
      continue;
    }
    const chart = init(container);
    if (!chart) {
      continue;
    }
    charts.set(pane.id, chart);
    chart.subscribeAction("onCrosshairChange", (data) => {
      const point = data as {
        x?: number;
        y?: number;
        kLineData?: { timestamp?: number; close?: number };
      };
      if (typeof point?.kLineData?.timestamp === "number") {
        onCrosshair(pane.id, point.kLineData.timestamp, point.kLineData.close ?? 0);
        return;
      }
      if (typeof point?.x !== "number") {
        return;
      }
      const converted = chart.convertFromPixel([{ x: point.x, y: point.y ?? 0 }]);
      const hit = Array.isArray(converted) ? converted[0] : converted;
      if (typeof hit?.timestamp === "number") {
        onCrosshair(pane.id, hit.timestamp, typeof hit.value === "number" ? hit.value : 0);
      }
    });
  }
  window.__flowchartCharts = [...charts.values()];
}

document.querySelector("#periods")?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.dataset.period) {
    return;
  }
  try {
    layout = setPeriod(layout, target.dataset.period);
    ranBacktest = false;
    message("");
  } catch (error) {
    message(errorText(error));
  }
  paint();
});

document.querySelector("#candle")?.addEventListener("change", (event) => {
  const value = (event.target as HTMLSelectElement).value as Layout["candleType"];
  layout = setCandleType(layout, value);
  paint();
});

document.querySelector("#scale")?.addEventListener("change", (event) => {
  const value = (event.target as HTMLSelectElement).value as Layout["priceScale"];
  layout = setPriceScale(layout, value);
  paint();
});

document.querySelector("#sync")?.addEventListener("change", (event) => {
  layout = setCrosshairSync(layout, (event.target as HTMLInputElement).checked);
  paint();
});

document.querySelector("#group")?.addEventListener("click", () => {
  const ids = selectedIds();
  try {
    layout = groupNodes(layout, ids, { id: `group-${ids.join("-")}`, name: "Group" });
    message("");
  } catch (error) {
    message(errorText(error));
  }
  paint();
});

document.querySelector("#sma-period")?.addEventListener("change", (event) => {
  const period = Number((event.target as HTMLInputElement).value);
  const study = layout.panes.flatMap((pane) => pane.studies).find((entry) => entry.id === "sma");
  if (!study) {
    return;
  }
  try {
    layout = replaceStudySettings(layout, "sma", { ...study.settings, period });
    message("");
  } catch (error) {
    message(error instanceof WorkspaceError ? error.message : errorText(error));
  }
  paint();
});

document.querySelector("#sma-color")?.addEventListener("change", (event) => {
  const color = (event.target as HTMLInputElement).value;
  const study = layout.panes.flatMap((pane) => pane.studies).find((entry) => entry.id === "sma");
  if (!study?.styles.sma) {
    return;
  }
  try {
    layout = replaceStudyStyles(layout, "sma", {
      ...study.styles,
      sma: { ...study.styles.sma, color },
    });
    message("");
  } catch (error) {
    message(errorText(error));
  }
  paint();
});

document.querySelector("#backtest")?.addEventListener("click", () => {
  ranBacktest = true;
  paint();
});

document.querySelector("#save")?.addEventListener("click", () => {
  const name = document.querySelector<HTMLInputElement>("#layout-name")?.value ?? layout.name;
  try {
    layout = setLayoutName(layout, name);
    book.save(layout);
    refreshSaved();
    message(`Saved ${layout.name}`);
  } catch (error) {
    message(errorText(error));
  }
  paint();
});

document.querySelector("#load")?.addEventListener("click", () => {
  const name = document.querySelector<HTMLSelectElement>("#saved")?.value;
  if (!name) {
    message("No saved layout");
    return;
  }
  try {
    layout = book.load(name);
    cursors = layout.panes.map((pane) => ({ paneId: pane.id, time: null }));
    ranBacktest = false;
    message(`Loaded ${name}`);
  } catch (error) {
    message(errorText(error));
  }
  paint();
});

mount();
refreshSaved();
paint();

window.addEventListener("beforeunload", () => {
  for (const chart of charts.values()) {
    dispose(chart);
  }
});
