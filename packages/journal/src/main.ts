// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import "./styles.css";
import { collectTags, defaultFilters, filterTrades, summarize } from "./filter.ts";
import {
  addTag,
  adherenceLabel,
  draftFromTrade,
  formatR,
  formatWhen,
  fromLocalInput,
  newDraft,
  parseR,
  safeImageRef,
  sideLabel,
  sourceLabel,
  tradeFromDraft,
  tradesFromImport,
} from "./record.ts";
import {
  deleteSnapshot,
  deleteTrade,
  loadSnapshot,
  loadTrades,
  saveSnapshot,
  saveTrade,
} from "./store.ts";
import type { Filters, RuleAdherence, Side, Trade, TradeDraft, TradeSource } from "./types.ts";
import { ADHERENCE, SIDES, SOURCES } from "./types.ts";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface PendingSnapshot {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}

interface AppState {
  ready: boolean;
  trades: Trade[];
  filters: Filters;
  draft: TradeDraft | null;
  mode: "none" | "new" | "edit";
  tagDraft: string;
  error: string;
  notice: string;
  confirmDelete: boolean;
  storageError: string;
}

const state: AppState = {
  ready: false,
  trades: [],
  filters: defaultFilters(),
  draft: null,
  mode: "none",
  tagDraft: "",
  error: "",
  notice: "",
  confirmDelete: false,
  storageError: "",
};

const snapshotUrls = new Map<string, string>();
let pending: PendingSnapshot | null = null;
let pendingUrl: string | null = null;
let saving = false;
let viewEpoch = 0;

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app");
const app: HTMLElement = root;

void boot();

async function boot(): Promise<void> {
  paint();
  try {
    state.trades = await loadTrades();
  } catch {
    state.storageError = "This browser blocked local storage, so trades cannot be saved here.";
  }
  state.ready = true;
  openFromHash();
  paint();
}

window.addEventListener("hashchange", () => {
  openFromHash();
  paint();
});

function openFromHash(): void {
  const hash = decodeURIComponent(location.hash);
  if (hash === "#/new") {
    if (state.mode !== "new" || !state.draft) {
      state.draft = newDraft();
      state.mode = "new";
      state.tagDraft = "";
      state.confirmDelete = false;
    }
    return;
  }
  if (hash.startsWith("#/trade/")) {
    const id = hash.slice("#/trade/".length);
    if (state.mode === "edit" && state.draft?.id === id) return;
    const trade = state.trades.find((item) => item.id === id);
    state.mode = trade ? "edit" : "none";
    state.draft = trade ? draftFromTrade(trade) : null;
    state.tagDraft = "";
    state.confirmDelete = false;
    clearPending();
    return;
  }
  if (state.mode !== "none") {
    state.mode = "none";
    state.draft = null;
    state.tagDraft = "";
    state.confirmDelete = false;
    clearPending();
  }
}

function setHash(next: string): void {
  if (location.hash === next) return;
  location.hash = next;
}

function paint(): void {
  viewEpoch += 1;
  const focus = captureFocus();
  app.replaceChildren(renderTop(), renderDesk());
  restoreFocus(focus);
  void hydrateSnapshots(app);
}

function renderTop(): HTMLElement {
  const shown = filterTrades(state.trades, state.filters);
  const stats = summarize(shown);
  const narrowed = shown.length !== state.trades.length;
  const header = el("header", { class: "top" });
  const titles = el("div");
  titles.append(
    el("p", { class: "brand" }, "Flowchart"),
    el("h1", {}, "Journal"),
    el("p", { class: "lede" }, "Replay, backtest, and live trades. Stored in this browser."),
  );
  const dl = el("dl", { class: "stats" });
  dl.append(
    stat("Trades", narrowed ? `${stats.count} of ${state.trades.length}` : String(stats.count), "flat"),
    stat("Net R", formatR(stats.netR), tone(stats.netR)),
    stat("Average R", formatR(stats.averageR), tone(stats.averageR)),
    stat("Rules kept", stats.count === 0 ? "—" : `${Math.round((stats.followed / stats.count) * 100)}%`, "flat"),
  );
  header.append(titles, dl);
  return header;
}

function stat(label: string, value: string, toneName: "pos" | "neg" | "flat"): HTMLElement {
  const wrap = el("div");
  const dd = el("dd", { class: toneName }, value);
  wrap.append(el("dt", {}, label), dd);
  return wrap;
}

function renderDesk(): HTMLElement {
  const desk = el("div", { class: "desk" });
  desk.append(renderRail(), renderSheet());
  return desk;
}

function renderRail(): HTMLElement {
  const rail = el("aside", { class: "rail" });
  const create = el("button", { class: "primary", id: "new-trade", type: "button" }, "Log a trade");
  create.addEventListener("click", () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    clearPending();
    state.draft = newDraft();
    state.mode = "new";
    state.tagDraft = "";
    state.error = "";
    state.notice = "";
    state.confirmDelete = false;
    setHash("#/new");
    paint();
  });

  rail.append(create, renderFilters(), renderList(), renderRailActions());
  return rail;
}

function renderFilters(): HTMLElement {
  const form = el("form", { class: "filters" });
  form.addEventListener("submit", (event) => event.preventDefault());

  const query = el("input", {
    class: "search",
    id: "filter-query",
    type: "search",
    placeholder: "Symbol, notes, session",
    "aria-label": "Filter trades",
    value: state.filters.query,
  }) as HTMLInputElement;
  query.addEventListener("input", () => {
    state.filters = { ...state.filters, query: query.value };
    paint();
  });

  const sourceBox = el("div");
  sourceBox.append(el("p", { class: "kicker" }, "Source"));
  const checks = el("div", { class: "checks" });
  for (const source of SOURCES) {
    const id = `filter-source-${source}`;
    const label = el("label", { class: state.filters.sources[source] ? "on" : "" });
    const input = el("input", { type: "checkbox", id, value: source }) as HTMLInputElement;
    input.checked = state.filters.sources[source];
    input.addEventListener("change", () => {
      state.filters = {
        ...state.filters,
        sources: { ...state.filters.sources, [source]: input.checked },
      };
      paint();
    });
    label.append(input, document.createTextNode(sourceLabel(source)));
    checks.append(label);
  }
  sourceBox.append(checks);

  const pair = el("div", { class: "pair" });
  pair.append(
    labeledSelect("Result", "filter-result", state.filters.result, [
      ["any", "Any result"],
      ["win", "Winners"],
      ["loss", "Losers"],
      ["scratch", "Scratches"],
    ], (value) => {
      state.filters = { ...state.filters, result: value as Filters["result"] };
      paint();
    }),
    labeledSelect("Rules", "filter-adherence", state.filters.adherence, [
      ["any", "Any adherence"],
      ["followed", "Followed"],
      ["partial", "Partial"],
      ["broken", "Broken"],
    ], (value) => {
      state.filters = { ...state.filters, adherence: value as Filters["adherence"] };
      paint();
    }),
  );

  const tagBox = el("div");
  const tags = collectTags(state.trades);
  if (tags.length > 0) {
    tagBox.append(el("p", { class: "kicker" }, "Tags"));
    const row = el("div", { class: "tags" });
    for (const tag of tags) {
      const pressed = state.filters.tag.toLowerCase() === tag.toLowerCase();
      const button = el("button", {
        type: "button",
        class: "tag",
        "data-tag": tag,
        "aria-pressed": pressed ? "true" : "false",
      }, tag);
      button.addEventListener("click", () => {
        state.filters = { ...state.filters, tag: pressed ? "" : tag };
        paint();
      });
      row.append(button);
    }
    tagBox.append(row);
  }

  form.append(query, sourceBox, pair, tagBox);
  if (filtersNarrowed(state.filters)) {
    const clear = el("button", { type: "button", class: "texty", id: "clear-filters" }, "Clear filters");
    clear.addEventListener("click", () => {
      state.filters = defaultFilters();
      paint();
    });
    form.append(clear);
  }
  return form;
}

function renderList(): HTMLElement {
  const wrap = el("div");
  if (!state.ready) {
    wrap.append(el("p", { class: "empty" }, "Opening the journal…"));
    return wrap;
  }
  const shown = filterTrades(state.trades, state.filters);
  if (state.trades.length === 0) {
    wrap.append(el("p", { class: "empty" }, "No trades yet."));
    return wrap;
  }
  if (shown.length === 0) {
    wrap.append(el("p", { class: "empty" }, "Nothing matches these filters."));
    return wrap;
  }
  const list = el("ul", { class: "list" });
  for (const trade of shown) {
    const item = el("li");
    const button = el("button", {
      type: "button",
      class: state.draft?.id === trade.id ? "trade active" : "trade",
      "data-trade-id": trade.id,
    });
    button.append(
      el("span", { class: "sym" }, trade.symbol),
      el("span", { class: `r ${tone(trade.rResult)}` }, formatR(trade.rResult)),
      el("small", {}, `${trade.setup} · ${sourceLabel(trade.source)} · ${adherenceLabel(trade.ruleAdherence)}`),
    );
    button.addEventListener("click", () => selectTrade(trade.id));
    item.append(button);
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function renderRailActions(): HTMLElement {
  const row = el("div", { class: "rail-actions" });
  const exportButton = el("button", { type: "button", class: "quiet", id: "export-json" }, "Export");
  exportButton.addEventListener("click", exportJournal);
  const importLabel = el("label", { class: "quiet" });
  importLabel.append(document.createTextNode("Import"));
  const file = el("input", { type: "file", id: "import-json", accept: "application/json,.json" }) as HTMLInputElement;
  file.hidden = true;
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (chosen) void importJournal(chosen);
  });
  importLabel.append(file);
  row.append(exportButton, importLabel);
  return row;
}

function renderSheet(): HTMLElement {
  const main = el("main", { class: "sheet" });
  if (!state.draft) {
    const blank = el("div", { class: "sheet-inner blank" });
    blank.append(
      el("p", { class: "kicker" }, "Open entry"),
      el("h2", {}, "No trade open"),
      el("p", {}, "Log a replay, a backtest, or a live fill. The chart stays a snapshot reference, and the entry stays in this browser when you come back."),
    );
    if (state.storageError) blank.append(el("p", { class: "alert", role: "alert" }, state.storageError));
    main.append(blank);
    return main;
  }

  const draft = state.draft;
  const parsed = parseR(draft.rResult);
  const inner = el("div", { class: "sheet-inner paper" });
  const head = el("div", { class: "sheet-head" });
  const heading = el("div");
  heading.append(
    el("p", { class: "kicker" }, state.mode === "new" ? "New trade" : sourceLabel(draft.source)),
    el("h2", { id: "trade-title" }, draft.setup.trim() || "Untitled setup"),
  );
  head.append(heading, el("p", { class: `result ${parsed === null ? "flat" : tone(parsed)}`, id: "trade-r" }, parsed === null ? "— R" : formatR(parsed)));

  const opened = fromLocalInput(draft.openedAt);
  const closed = fromLocalInput(draft.closedAt);
  const meta = [
    draft.symbol.trim() ? draft.symbol.trim().toUpperCase() : "Symbol",
    sideLabel(draft.side),
    opened && closed ? `${formatWhen(opened)} → ${formatWhen(closed)}` : "",
    draft.sessionRef.trim(),
  ].filter(Boolean).join(" · ");
  inner.append(head, el("p", { class: "meta" }, meta));
  const visible = filterTrades(state.trades, state.filters);
  if (state.mode === "edit" && !visible.some((trade) => trade.id === draft.id)) {
    inner.append(el("p", { class: "meta", id: "hidden-by-filter" }, "Hidden by the current filter."));
  }
  const shot = renderSnapshot(draft);
  if (shot) inner.append(shot);

  const form = el("form", { id: "trade-form", autocomplete: "off" });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void commitTrade();
  });

  form.append(
    field("Source", segmented("source", draft.source, SOURCES.map((source) => [source, sourceLabel(source)]), (value) => {
      updateDraft({ source: value as TradeSource });
    })),
    field("Symbol", textInput("field-symbol", draft.symbol, "EURUSD", (value) => updateDraft({ symbol: value }))),
    field("Side", segmented("side", draft.side, SIDES.map((side) => [side, sideLabel(side)]), (value) => {
      updateDraft({ side: value as Side });
    })),
    field("Opened", timeInput("field-open", draft.openedAt, (value) => updateDraft({ openedAt: value }))),
    field("Closed", timeInput("field-close", draft.closedAt, (value) => updateDraft({ closedAt: value }))),
    field("Setup / strategy", textInput("field-setup", draft.setup, "London sweep", (value) => updateDraft({ setup: value }), "Setup or strategy")),
    field("R result", numberInput(draft.rResult)),
    field("Rules", segmented("adherence", draft.ruleAdherence, ADHERENCE.map((item) => [item, adherenceLabel(item)]), (value) => {
      updateDraft({ ruleAdherence: value as RuleAdherence });
    })),
    field("Chart", snapshotFields(draft)),
    field("Session", textInput("field-session", draft.sessionRef, "eurusd-2024-03-12", (value) => updateDraft({ sessionRef: value }), "Session or run")),
    field("Tags", tagEditor(draft), true),
    field("Notes", area("field-notes", draft.notes, "What the tape did", (value) => updateDraft({ notes: value }), "Notes"), true),
    field("Emotions or mistakes", area("field-emotions", draft.emotions, "What you did", (value) => updateDraft({ emotions: value }), "Emotions or mistakes"), true),
  );

  const saveRow = el("div", { class: "save-row" });
  const save = el("button", { class: "primary", id: "save-trade", type: "submit" }, saving ? "Saving…" : "Save trade");
  if (saving) save.setAttribute("disabled", "true");
  saveRow.append(save);
  if (state.mode === "edit") {
    const remove = el("button", {
      type: "button",
      class: "danger",
      id: "delete-trade",
    }, state.confirmDelete ? "Confirm delete" : "Delete trade");
    remove.addEventListener("click", () => {
      if (!state.confirmDelete) {
        state.confirmDelete = true;
        paint();
        return;
      }
      void removeTrade();
    });
    saveRow.append(remove);
  }
  form.append(saveRow);
  if (state.error) form.append(el("p", { class: "alert", id: "form-error", role: "alert" }, state.error));
  if (state.notice) form.append(el("p", { class: "notice", id: "form-notice" }, state.notice));
  if (state.storageError) form.append(el("p", { class: "alert", role: "alert" }, state.storageError));
  inner.append(form);
  main.append(inner);
  return main;
}

function renderSnapshot(draft: TradeDraft): HTMLElement | null {
  const remote = safeImageRef(draft.snapshotRef);
  if (!draft.snapshotId && !remote) return null;
  const figure = el("figure", { class: "shot" });
  const image = el("img", { alt: "Chart snapshot", id: "snapshot-preview" }) as HTMLImageElement;
  if (draft.snapshotId) image.dataset.snapshotId = draft.snapshotId;
  if (draft.snapshotId && draft.snapshotId === pending?.id && pendingUrl) image.src = pendingUrl;
  else if (draft.snapshotId && snapshotUrls.has(draft.snapshotId)) image.src = snapshotUrls.get(draft.snapshotId) ?? "";
  else if (remote) image.src = remote;
  else image.hidden = true;
  figure.append(image, el("figcaption", { id: "snapshot-caption" }, draft.snapshotRef.trim() || "Chart snapshot"));
  return figure;
}

function snapshotFields(draft: TradeDraft): HTMLElement {
  const wrap = el("div", { class: "file-row" });
  wrap.append(textInput("field-snapshot", draft.snapshotRef, "sessions/london-short.png", (value) => {
    updateDraft({ snapshotRef: value });
  }, "Chart snapshot reference"));
  const attach = el("label", { class: "attach" }, "Attach image");
  const file = el("input", {
    type: "file",
    id: "field-snapshot-file",
    accept: "image/*",
    "aria-label": "Attach chart image",
  }) as HTMLInputElement;
  file.hidden = true;
  listen(file, "change", () => {
    const chosen = file.files?.[0];
    if (chosen) attachImage(chosen);
  });
  attach.append(file);
  wrap.append(attach);
  return wrap;
}

function tagEditor(draft: TradeDraft): HTMLElement {
  const wrap = el("div", { class: "tag-editor" });
  const draftId = draft.id;
  for (const tag of draft.tags) {
    const chip = el("span", { class: "chip" });
    const remove = el("button", { type: "button", "aria-label": `Remove tag ${tag}` }, "×");
    listen(remove, "click", () => {
      if (state.draft?.id !== draftId) return;
      updateDraft({ tags: draft.tags.filter((item) => item !== tag) });
    });
    chip.append(document.createTextNode(tag), remove);
    wrap.append(chip);
  }
  const input = textInput("field-tag", state.tagDraft, "Add a tag", (value) => {
    state.tagDraft = value;
    state.error = "";
    paint();
  }, "Add a tag");
  const epoch = viewEpoch;
  input.addEventListener("keydown", (event) => {
    if (epoch !== viewEpoch || state.draft?.id !== draftId) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commitTag();
    }
  });
  const add = el("button", { type: "button", class: "quiet", id: "add-tag" }, "Add tag");
  listen(add, "click", () => {
    if (state.draft?.id !== draftId) return;
    commitTag();
  });
  wrap.append(input, add);
  return wrap;
}

function field(label: string, control: HTMLElement, stack = false): HTMLElement {
  const row = el("div", { class: stack ? "field stack" : "field" });
  const name = document.createElement("label");
  name.className = "field-label";
  name.textContent = label;
  if ((control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) && control.id) {
    name.htmlFor = control.id;
  }
  if (control.getAttribute("role") === "radiogroup") control.setAttribute("aria-label", label);
  row.append(name, control);
  return row;
}

function textInput(
  id: string,
  value: string,
  placeholder: string,
  onInput: (value: string) => void,
  label?: string,
): HTMLInputElement {
  const input = el("input", {
    id,
    type: "text",
    placeholder,
    value,
    autocomplete: "off",
  }) as HTMLInputElement;
  if (label) input.setAttribute("aria-label", label);
  listen(input, "input", () => onInput(input.value), true);
  return input;
}

function numberInput(value: string): HTMLInputElement {
  const input = el("input", {
    id: "field-r",
    type: "text",
    inputmode: "decimal",
    placeholder: "1.5",
    value,
    "aria-label": "R result",
    autocomplete: "off",
  }) as HTMLInputElement;
  listen(input, "input", () => updateDraft({ rResult: input.value }), true);
  return input;
}

function timeInput(id: string, value: string, onInput: (value: string) => void): HTMLInputElement {
  const input = el("input", { id, type: "datetime-local", value }) as HTMLInputElement;
  listen(input, "input", () => onInput(input.value), true);
  return input;
}

function area(
  id: string,
  value: string,
  placeholder: string,
  onInput: (value: string) => void,
  label: string,
): HTMLTextAreaElement {
  const input = el("textarea", { id, placeholder, "aria-label": label }) as HTMLTextAreaElement;
  input.value = value;
  listen(input, "input", () => onInput(input.value), true);
  return input;
}

function segmented(
  name: string,
  current: string,
  options: Array<[string, string]>,
  onChange: (value: string) => void,
): HTMLElement {
  const group = el("div", { class: "seg", role: "radiogroup", "aria-label": name });
  for (const [value, label] of options) {
    const option = el("label", { class: value === current ? "on" : "" });
    const input = el("input", { type: "radio", name, value }) as HTMLInputElement;
    input.checked = value === current;
    listen(input, "change", () => {
      if (input.checked) onChange(value);
    });
    option.append(input, document.createTextNode(label));
    group.append(option);
  }
  return group;
}

function labeledSelect(
  label: string,
  id: string,
  value: string,
  options: Array<[string, string]>,
  onChange: (value: string) => void,
): HTMLElement {
  const wrap = el("label");
  wrap.append(el("span", { class: "kicker" }, label));
  const select = el("select", { id, class: "select" }) as HTMLSelectElement;
  for (const [optionValue, text] of options) {
    const option = el("option", { value: optionValue }, text) as HTMLOptionElement;
    option.selected = optionValue === value;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  wrap.append(select);
  return wrap;
}

function listen(node: HTMLElement, type: string, handler: () => void, onlyWhenFocused = false): void {
  const epoch = viewEpoch;
  node.addEventListener(type, () => {
    if (epoch !== viewEpoch || !node.isConnected) return;
    if (onlyWhenFocused && document.activeElement !== node) return;
    handler();
  });
}

function updateDraft(patch: Partial<TradeDraft>): void {
  if (!state.draft) return;
  state.draft = { ...state.draft, ...patch };
  state.error = "";
  state.notice = "";
  state.confirmDelete = false;
  paint();
}

function commitTag(): void {
  if (!state.draft) return;
  const result = addTag(state.draft.tags, state.tagDraft);
  state.draft = { ...state.draft, tags: result.tags };
  state.tagDraft = "";
  state.error = result.error;
  state.notice = "";
  paint();
}

function selectTrade(id: string): void {
  const trade = state.trades.find((item) => item.id === id);
  if (!trade) return;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  clearPending();
  state.draft = draftFromTrade(trade);
  state.mode = "edit";
  state.tagDraft = "";
  state.error = "";
  state.notice = "";
  state.confirmDelete = false;
  setHash(`#/trade/${encodeURIComponent(id)}`);
  paint();
}

function attachImage(file: File): void {
  if (!state.draft) return;
  if (!file.type.startsWith("image/")) {
    state.error = "Attach a PNG, JPEG, GIF, or WebP image.";
    paint();
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    state.error = "Chart images stay under 8 MB.";
    paint();
    return;
  }
  clearPending();
  const id = crypto.randomUUID();
  pending = { id, blob: file, name: file.name, type: file.type || "application/octet-stream" };
  pendingUrl = URL.createObjectURL(file);
  state.draft = {
    ...state.draft,
    snapshotId: id,
    snapshotRef: state.draft.snapshotRef.trim() || file.name,
  };
  state.error = "";
  paint();
}

async function commitTrade(): Promise<void> {
  if (!state.draft || saving) return;
  const built = tradeFromDraft(state.draft);
  if ("error" in built) {
    state.error = built.error;
    state.notice = "";
    paint();
    return;
  }
  if (state.storageError) {
    state.error = state.storageError;
    paint();
    return;
  }
  saving = true;
  paint();
  try {
    const previous = state.trades.find((trade) => trade.id === built.trade.id);
    if (pending && pending.id === built.trade.snapshotId) {
      await saveSnapshot({ id: pending.id, blob: pending.blob, name: pending.name, type: pending.type });
      if (pendingUrl) snapshotUrls.set(pending.id, pendingUrl);
      pending = null;
      pendingUrl = null;
    }
    await saveTrade(built.trade);
    if (previous?.snapshotId && previous.snapshotId !== built.trade.snapshotId) {
      await deleteSnapshotIfUnused(previous.snapshotId);
    }
    state.trades = upsert(state.trades, built.trade);
    state.draft = draftFromTrade(built.trade);
    state.mode = "edit";
    state.notice = "Saved in this browser.";
    state.error = "";
    state.confirmDelete = false;
    setHash(`#/trade/${encodeURIComponent(built.trade.id)}`);
  } catch {
    state.error = "Could not save this trade.";
    state.notice = "";
  } finally {
    saving = false;
    paint();
  }
}

async function removeTrade(): Promise<void> {
  if (!state.draft) return;
  const id = state.draft.id;
  const snapshotId = state.draft.snapshotId;
  try {
    await deleteTrade(id);
    state.trades = state.trades.filter((trade) => trade.id !== id);
    if (snapshotId) await deleteSnapshotIfUnused(snapshotId);
    clearPending();
    state.draft = null;
    state.mode = "none";
    state.notice = "";
    state.error = "";
    state.confirmDelete = false;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    paint();
  } catch {
    state.error = "Could not delete this trade.";
    paint();
  }
}

async function deleteSnapshotIfUnused(id: string): Promise<void> {
  const used = state.trades.some((trade) => trade.snapshotId === id) || pending?.id === id;
  if (used) return;
  await deleteSnapshot(id);
  const url = snapshotUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    snapshotUrls.delete(id);
  }
}

async function importJournal(file: File): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    state.error = "That file is not JSON.";
    state.notice = "";
    paint();
    return;
  }
  const incoming = tradesFromImport(parsed);
  if (incoming.length === 0) {
    state.error = "No trades in that file. Each trade needs a symbol, setup, source, rules, and R result.";
    state.notice = "";
    paint();
    return;
  }
  try {
    for (const trade of incoming) await saveTrade(trade);
    state.trades = await loadTrades();
    const current = state.draft ? state.trades.find((trade) => trade.id === state.draft?.id) : undefined;
    if (current) state.draft = draftFromTrade(current);
    state.notice = incoming.length === 1 ? "Imported 1 trade." : `Imported ${incoming.length} trades.`;
    state.error = "";
  } catch {
    state.error = "Could not import those trades.";
    state.notice = "";
  }
  paint();
}

function exportJournal(): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "flowchart-journal",
    trades: state.trades,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: "flowchart-journal.json" }) as HTMLAnchorElement;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function hydrateSnapshots(root: ParentNode): Promise<void> {
  const image = root.querySelector<HTMLImageElement>("#snapshot-preview");
  if (!image) return;
  const id = image.dataset.snapshotId;
  if (!id || image.getAttribute("src")) return;
  try {
    const record = await loadSnapshot(id);
    if (!record || !image.isConnected) return;
    const url = URL.createObjectURL(record.blob);
    snapshotUrls.set(id, url);
    image.src = url;
    image.hidden = false;
  } catch {
    image.alt = "Chart snapshot could not be loaded";
  }
}

function upsert(trades: Trade[], trade: Trade): Trade[] {
  const next = trades.filter((item) => item.id !== trade.id);
  next.push(trade);
  return next;
}

function clearPending(): void {
  if (pendingUrl && pending && !snapshotUrls.has(pending.id)) URL.revokeObjectURL(pendingUrl);
  pending = null;
  pendingUrl = null;
}

function filtersNarrowed(filters: Filters): boolean {
  if (filters.query.trim()) return true;
  if (filters.tag) return true;
  if (filters.adherence !== "any" || filters.result !== "any") return true;
  return SOURCES.some((source) => !filters.sources[source]);
}

function tone(value: number): "pos" | "neg" | "flat" {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "flat";
}

function captureFocus(): { id: string; start: number | null; end: number | null } | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.id) return null;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return { id: active.id, start: active.selectionStart, end: active.selectionEnd };
  }
  return { id: active.id, start: null, end: null };
}

function restoreFocus(focus: { id: string; start: number | null; end: number | null } | null): void {
  if (!focus) return;
  const node = document.getElementById(focus.id);
  if (!node) return;
  node.focus();
  if ((node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) && focus.start !== null && focus.end !== null) {
    node.setSelectionRange(focus.start, focus.end);
  }
}

function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}
