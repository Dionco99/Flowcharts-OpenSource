// SPDX-License-Identifier: Apache-2.0

import { EURUSD, roundPrice, TIMEFRAMES, type Minute, type Timeframe } from "@flowchart/bars";
import { createDesk, loadStudies, type Drawing, type DrawingKind } from "@flowchart/chart-tools";
import { runReplay, type CancelRecord, type Fill, type OrderRecord, type OrderType, type Side } from "@flowchart/orders";
import { downloadSession, formatAxis, formatInstant, loadSession, parseZonedInput, readJsonFile, saveSession, zonedInputValue, type ReplaySession, type SessionFile, type StudySetting } from "@flowchart/replay";
import { loadTrades, saveTrade } from "../../../packages/journal/src/store.ts";
import maCross from "../../../packages/script/examples/ma-cross.flow?raw";
import { DESK_VENUE, fillOnBacktest, venueRows } from "./demo-broker";
import { formatLots, formatMoney, formatPips, formatPrice } from "./format";
import { replayNote, visibleReplay } from "./journal-note";
import { linkedReport } from "./linked";
import { loadDefaultTape, parseUserTape, type LoadedTape } from "./load-tape";
import { scriptOnClosedBars, type ScriptReport } from "./script-study";
import { createSampleStrategy } from "./strategy";
import { jumpTransport, keyTransport, openTransport, retargetTransport, seekTransport, stepTransport } from "./transport";

const ZONES: Array<[string, string]> = [
  ["UTC", "UTC"],
  ["Europe/London", "London"],
  ["America/New_York", "New York"],
  ["Asia/Tokyo", "Tokyo"],
];

type State = {
  minutes: Minute[];
  events: { time: number; label: string }[];
  tapeId: string;
  source: string;
  cursor: number;
  timezone: string;
  tradingTimeframe: Timeframe;
  speed: number;
  follow: boolean;
  playing: boolean;
  panes: { id: string; timeframe: Timeframe }[];
  studies: StudySetting[];
  strategy: boolean;
  drawings: Drawing[];
  orders: OrderRecord[];
  cancels: CancelRecord[];
  tool: DrawingKind | "cursor";
  orderSeq: number;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function paintScript(report: ScriptReport) {
  const readout = $("script-readout");
  const note = $("script-note");
  if (report.error) {
    readout.textContent = report.error;
    note.textContent = "Flowchart Script on bars that have closed. Intents stay off the ticket.";
    return;
  }
  const plots = report.plots.map((plot) => `${plot.label} ${plot.last === null ? "—" : formatPrice(plot.last)}`).join(" · ");
  const side = report.position === "flat" ? "flat" : `${report.position} ${formatLots(report.lots)}`;
  readout.textContent = `${report.name} · ${plots || "no plot"} · ${report.bars} bars · ${side}`;
  const last = report.lastAlert ? ` Last alert: ${report.lastAlert}.` : "";
  note.textContent = `${report.orders} order intents, ${report.alerts} alerts. Intents stay off the ticket.${last}`;
}

function bounds(minutes: Minute[]) {
  return { min: minutes[0].t + 60_000, max: minutes[minutes.length - 1].t + 60_000 };
}

function defaultCursor(minutes: Minute[]): number {
  const { min, max } = bounds(minutes);
  for (let i = Math.floor(minutes.length * 0.3); i < minutes.length; i++) {
    const time = minutes[i].t;
    const date = new Date(time);
    if (date.getUTCDay() === 3 && date.getUTCHours() === 7 && date.getUTCMinutes() === 0 && max - time > 86_400_000) return time;
  }
  return min + Math.floor((max - min) * 0.45);
}

function freshStudies(): StudySetting[] {
  return loadStudies().map((study) => ({
    id: study.id,
    enabled: true,
    params: Object.fromEntries(study.params.map((param) => [param.key, param.default])),
  }));
}

function initialState(tape: LoadedTape, saved: SessionFile | null): State {
  const base: State = {
    minutes: tape.minutes,
    events: tape.events,
    tapeId: tape.tapeId,
    source: tape.source,
    cursor: defaultCursor(tape.minutes),
    timezone: "Europe/London",
    tradingTimeframe: "5m",
    speed: 2,
    follow: true,
    playing: false,
    panes: [{ id: "p1", timeframe: "5m" }],
    studies: freshStudies(),
    strategy: false,
    drawings: [],
    orders: [],
    cancels: [],
    tool: "cursor",
    orderSeq: 1,
  };
  if (!saved || saved.tapeId !== tape.tapeId) return base;
  const { min, max } = bounds(tape.minutes);
  return {
    ...base,
    cursor: Math.min(max, Math.max(min, saved.cursor)),
    timezone: saved.timezone || base.timezone,
    tradingTimeframe: saved.tradingTimeframe || base.tradingTimeframe,
    speed: saved.speed || base.speed,
    follow: saved.follow,
    panes: saved.panes?.length ? saved.panes.slice(0, 4) : base.panes,
    studies: saved.studies?.length ? saved.studies : base.studies,
    strategy: saved.strategy,
    drawings: saved.drawings ?? [],
    orders: saved.orders ?? [],
    cancels: saved.cancels ?? [],
    orderSeq: 1 + (saved.orders?.length ?? 0),
  };
}

function addPane(panes: readonly { id: string; timeframe: Timeframe }[]): { id: string; timeframe: Timeframe }[] | null {
  if (panes.length >= 4) return null;
  const usedTf = new Set(panes.map((pane) => pane.timeframe));
  const usedIds = new Set(panes.map((pane) => pane.id));
  const timeframe = TIMEFRAMES.find((tf) => !usedTf.has(tf)) ?? "15m";
  let n = 1;
  while (usedIds.has(`p${n}`)) n += 1;
  return [...panes, { id: `p${n}`, timeframe }];
}

function boot() {
  const stepSelect = $<HTMLSelectElement>("step-tf");
  for (const tf of TIMEFRAMES) {
    const option = document.createElement("option");
    option.value = tf;
    option.textContent = tf;
    stepSelect.append(option);
  }
  const zoneSelect = $<HTMLSelectElement>("timezone");
  for (const [zone, label] of ZONES) {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = label;
    zoneSelect.append(option);
  }

  const studies = loadStudies();
  const studyHost = $("studies");
  for (const study of studies) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.study = study.id;
    label.append(box, document.createTextNode(study.name));
    for (const param of study.params) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = String(param.min);
      input.max = String(param.max);
      input.step = String(param.step);
      input.dataset.param = param.key;
      input.dataset.study = study.id;
      input.setAttribute("aria-label", `${study.name} ${param.label}`);
      label.append(input);
    }
    studyHost.append(label);
  }

  let state!: State;
  let ready = false;
  let transport: ReplaySession | null = null;
  let raf = 0;
  let lastFrame = 0;
  let hostTimer = 0;
  let tapeSig = "*";
  let workSig = "*";
  let saveTimer = 0;

  const desk = createDesk($("panes"), EURUSD, {
    onPaneTimeframe: (id, timeframe) => {
      state.panes = state.panes.map((pane) => (pane.id === id ? { ...pane, timeframe } : pane));
      render();
    },
    onPaneClose: (id) => {
      if (state.panes.length < 2) return;
      state.panes = state.panes.filter((pane) => pane.id !== id);
      render();
    },
    onFollow: (follow) => {
      state.follow = follow;
      $<HTMLButtonElement>("follow").classList.toggle("on", follow);
    },
    onDrawing: (drawing) => {
      state.drawings = [...state.drawings, drawing];
      state.tool = "cursor";
      render();
    },
    onDrawingMove: (drawing) => {
      state.drawings = state.drawings.map((item) => (item.id === drawing.id ? drawing : item));
      render();
    },
    onPrice: (price) => {
      const active = document.activeElement;
      const formatted = formatPrice(price);
      if (active instanceof HTMLInputElement && (active.id === "stop" || active.id === "target" || active.id === "price")) {
        active.value = formatted;
        return;
      }
      if ($<HTMLSelectElement>("order-type").value !== "market") $<HTMLInputElement>("price").value = formatted;
    },
  }, formatAxis);

  const viewOf = () =>
    runReplay({
      minutes: state.minutes,
      cursor: state.cursor,
      spec: EURUSD,
      tradingTimeframe: state.tradingTimeframe,
      orders: state.orders,
      cancels: state.cancels,
      strategy: state.strategy ? createSampleStrategy(EURUSD) : null,
    });

  const persist = (fills: Fill[]) => {
    const file: SessionFile = {
      version: 1,
      tapeId: state.tapeId,
      savedAt: Date.now(),
      cursor: state.cursor,
      timezone: state.timezone,
      tradingTimeframe: state.tradingTimeframe,
      speed: state.speed,
      follow: state.follow,
      panes: state.panes,
      studies: state.studies,
      strategy: state.strategy,
      drawings: state.drawings,
      orders: state.orders,
      cancels: state.cancels,
      fills,
    };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveSession(file), 120);
    return file;
  };

  const render = () => {
    if (!ready) return;
    const { min, max } = bounds(state.minutes);
    state.cursor = Math.min(max, Math.max(min, state.cursor));
    const view = viewOf();
    const enabled = state.studies.filter((study) => study.enabled).map((study) => ({ id: study.id, params: study.params }));
    desk.setPanes(state.panes);
    desk.setTimezone(state.timezone);
    desk.setStudies(enabled);
    desk.sync(state.minutes, state.cursor, state.follow);
    desk.setDrawings(state.drawings);
    desk.setOrders([...view.orders]);
    desk.setEvents(state.events);
    desk.setFlags(
      view.fills.filter((fill) => fill.ambiguous).map((fill) => ({ time: fill.time - 60_000, price: Number(fill.price), label: "ambiguous" })),
    );

    stepSelect.value = state.tradingTimeframe;
    zoneSelect.value = state.timezone;
    $<HTMLInputElement>("strategy").checked = state.strategy;
    $<HTMLSelectElement>("speed").value = String(state.speed);
    $<HTMLButtonElement>("follow").classList.toggle("on", state.follow);
    $<HTMLButtonElement>("play").textContent = state.playing ? "Pause" : "Play";
    $<HTMLButtonElement>("add-pane").disabled = state.panes.length >= 4;
    const slider = $<HTMLInputElement>("slider");
    slider.min = String(min);
    slider.max = String(max);
    slider.step = "60000";
    if (document.activeElement !== slider) slider.value = String(state.cursor);
    const seek = $<HTMLInputElement>("seek");
    if (document.activeElement !== seek) seek.value = zonedInputValue(state.cursor, state.timezone);
    $("clock").textContent = formatInstant(state.cursor, state.timezone);
    document.querySelectorAll<HTMLButtonElement>(".tool").forEach((button) => {
      button.classList.toggle("on", button.dataset.tool === state.tool);
    });
    for (const study of state.studies) {
      const box = studyHost.querySelector<HTMLInputElement>(`input[type="checkbox"][data-study="${study.id}"]`);
      if (box) box.checked = study.enabled;
      for (const [key, value] of Object.entries(study.params)) {
        const input = studyHost.querySelector<HTMLInputElement>(`input[data-param="${key}"][data-study="${study.id}"]`);
        if (input && document.activeElement !== input) input.value = String(value);
      }
    }

    const pos = view.position;
    const posLots = Number(pos.lots);
    $("position").textContent = Math.abs(posLots) < 0.005 ? "Flat" : `${posLots > 0 ? "Long" : "Short"} ${formatLots(Math.abs(posLots))} @ ${formatPrice(pos.avgPrice)}`;
    $("quote").textContent = `Bid ${formatPrice(view.bid)} · Ask ${formatPrice(view.ask)}`;
    paintScript(scriptOnClosedBars(maCross, state.minutes, state.tradingTimeframe, state.cursor));
    const realized = Number(view.realized);
    const commission = Number(view.commission);
    const unrealized = Number(view.unrealized);
    const net = realized - commission + unrealized;
    $("pnl").innerHTML = `
      <dt>Realized</dt><dd class="${realized >= 0 ? "up" : "down"}">${formatMoney(realized)}</dd>
      <dt>Commission</dt><dd>${formatMoney(-commission)}</dd>
      <dt>Unrealized</dt><dd class="${unrealized >= 0 ? "up" : "down"}">${formatMoney(unrealized)}</dd>
      <dt>Net</dt><dd class="${net >= 0 ? "up" : "down"}">${formatMoney(net)}</dd>`;
    const ambiguous = view.fills.filter((fill) => fill.ambiguous).length;
    $("ambiguous-count").textContent = ambiguous ? `${ambiguous} ambiguous` : "";
    $<HTMLButtonElement>("close").disabled = Math.abs(posLots) < 0.005;
    $<HTMLButtonElement>("half").disabled = Math.abs(posLots) < 0.02;
    const lots = Number($<HTMLInputElement>("lots").value) || 0;
    $("costs").textContent = `Spread ${formatPips(EURUSD.spread, EURUSD.pipSize)} · commission ${formatMoney(lots * Number(EURUSD.commissionPerLot)).replace("+", "")} / side`;

    const workKey = view.orders.map((order) => `${order.id}:${order.price}:${order.lots}`).join("|");
    if (workKey !== workSig) {
      workSig = workKey;
      const host = $("working");
      host.replaceChildren();
      if (view.orders.length === 0) host.textContent = "No working orders.";
      for (const order of view.orders) {
        const row = document.createElement("div");
        row.className = "row";
        const text = document.createElement("span");
        const bracket = [order.stopLoss ? `SL ${formatPrice(order.stopLoss)}` : "", order.takeProfit ? `TP ${formatPrice(order.takeProfit)}` : ""].filter(Boolean).join(" ");
        text.textContent = `${order.role} ${order.side} ${formatLots(order.lots)} ${formatPrice(order.price)} ${bracket}`;
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        cancel.addEventListener("click", () => {
          state.cancels = [...state.cancels, { id: order.id, at: state.cursor }];
          render();
        });
        row.append(text, cancel);
        host.append(row);
      }
    }

    const tapeKey = view.fills.map((fill) => fill.id).join("|");
    if (tapeKey !== tapeSig) {
      tapeSig = tapeKey;
      const host = $("tape");
      host.replaceChildren();
      const rows = view.fills.slice(-200).reverse();
      if (rows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "No fills yet. Only completed minutes at or before the cursor can fill you.";
        host.append(empty);
      }
      for (const fill of rows) {
        const row = document.createElement("div");
        row.className = fill.ambiguous ? "fill ambiguous" : "fill";
        const when = formatInstant(fill.time, state.timezone);
        row.innerHTML = `<span>${when} ${fill.side.toUpperCase()} ${formatLots(fill.lots)} @ ${formatPrice(fill.price)}</span>
          <span>spr ${formatPips(fill.spread, EURUSD.pipSize)} · comm ${formatMoney(fill.commission).replace("+", "")} · pnl ${formatMoney(fill.realizedPnl)} · ${fill.source === "strategy" ? "strategy" : "you"}</span>
          ${fill.ambiguous ? '<span class="tag">ambiguous</span>' : ""}`;
        host.append(row);
      }
    }

    if (transport) {
      try {
        transport.setDrawings(state.drawings.map((drawing) => ({ ...drawing })));
        transport.setWorkingOrders(
          view.orders.map((order) => ({
            id: order.id,
            clientOrderId: order.id,
            side: order.side,
            type: order.type,
            lots: order.lots,
          })),
        );
        transport.setFills(
          view.fills.map((fill) => ({
            id: fill.id,
            time: fill.time,
            lots: fill.lots,
            price: fill.price,
            side: fill.side,
          })),
        );
      } catch {
        // The replay ticket keeps an order the session file does not store.
      }
    }
    scheduleHost(view.ask);

    const mode = state.playing ? `Playing ${state.speed}×` : "Paused";
    const loaded = state.source === "fixture" ? "" : state.source === "generated" ? " · generated tape" : " · user tape";
    $("status").textContent = `${mode} · step ${state.tradingTimeframe}${loaded}`;
    persist([...view.fills]);
  };

  const bindTransport = () => {
    const { min, max } = bounds(state.minutes);
    transport = openTransport({
      symbol: EURUSD.symbol,
      firstClose: min,
      lastClose: max,
      cursor: state.cursor,
      timeframe: state.tradingTimeframe,
      speed: state.speed,
      timeZone: state.timezone,
    });
    state.cursor = transport.clock.cursor;
  };
  const syncTransport = () => {
    if (!transport) return;
    state.cursor = transport.clock.cursor;
    state.playing = transport.clock.status === "playing";
    state.speed = transport.clock.speed;
  };
  const stopAdvance = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  };
  const startAdvance = () => {
    stopAdvance();
    const tick = (now: number) => {
      if (!transport || transport.clock.status !== "playing") return;
      const elapsed = lastFrame === 0 ? 0 : now - lastFrame;
      lastFrame = now;
      const before = transport.clock.cursor;
      if (elapsed > 0) transport.clock.advance(elapsed);
      const moved = transport.clock.cursor !== before || transport.clock.status !== "playing";
      syncTransport();
      if (moved) render();
      if (transport.clock.status === "playing") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };
  const scheduleHost = (ask: string) => {
    window.clearTimeout(hostTimer);
    hostTimer = window.setTimeout(() => {
      void refreshHost(ask);
    }, 180);
  };
  const refreshHost = async (ask: string) => {
    const tail = state.minutes.filter((minute) => minute.t + 60_000 <= state.cursor).slice(-240);
    const linked = await linkedReport(state.minutes, state.cursor, ask, []);
    const venue = venueRows("market").find((row) => row.venue === DESK_VENUE);
    let remote = "Hosted checkout stays optional.";
    try {
      const response = await fetch("/api/desk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cursor: state.cursor,
          price: ask,
          minutes: tail.map((minute) => ({ t: minute.t, o: minute.o, h: minute.h, l: minute.l, c: minute.c })),
          timeframes: [state.tradingTimeframe, "7m"],
        }),
      });
      if (response.ok) {
        const report = (await response.json()) as {
          accounts: { revision: number };
          symbol: { name: string; sessions: string[]; pip: string };
          bars: Record<string, number>;
          billing: { implementation: string; required: boolean };
        };
        const sessions = report.symbol.sessions.length ? report.symbol.sessions.join(", ") : "closed";
        remote = `${report.symbol.name} ${sessions} · pip ${report.symbol.pip} · 7m ${report.bars["7m"] ?? 0} · accounts rev ${report.accounts.revision} · ${report.billing.implementation} required ${report.billing.required}`;
      }
    } catch {
      remote = "Symbol registry is unavailable.";
    }
    $("package-readout").textContent = `${linked.workspace} · ${linked.plugin} · risk ${linked.risk} · alerts ${linked.alerts} · edge ${linked.edge} · ${venue?.venue ?? DESK_VENUE} ${venue?.placement ?? "local"}`;
    $("package-note").textContent = `${remote} Swap ticket closed: EURUSD has no mint, and replay does not request a quote.`;
  };
  const refreshJournal = async () => {
    try {
      const notes = visibleReplay(await loadTrades());
      $("journal-readout").textContent = notes.length === 0 ? "No replay notes yet." : `${notes.length} replay notes`;
    } catch {
      $("journal-readout").textContent = "Journal stays in this browser.";
    }
  };

  const place = (side: Side, reduceOnly = false, lotsOverride?: number) => {
    if (!ready) return;
    const lots = Math.round((lotsOverride ?? Number($<HTMLInputElement>("lots").value)) * 100) / 100;
    const type = $<HTMLSelectElement>("order-type").value as OrderType;
    if (!(lots >= 0.01)) return;
    let price: string | undefined;
    if (!reduceOnly && type !== "market") {
      const raw = Number($<HTMLInputElement>("price").value);
      if (!Number.isFinite(raw)) {
        $("costs").textContent = "Enter a price, or click the chart.";
        return;
      }
      price = roundPrice(raw.toFixed(EURUSD.pricePrecision), EURUSD.tickSize);
    }
    const stopRaw = $<HTMLInputElement>("stop").value.trim();
    const targetRaw = $<HTMLInputElement>("target").value.trim();
    const stopLoss = stopRaw ? roundPrice(Number(stopRaw).toFixed(EURUSD.pricePrecision), EURUSD.tickSize) : undefined;
    const takeProfit = targetRaw ? roundPrice(Number(targetRaw).toFixed(EURUSD.pricePrecision), EURUSD.tickSize) : undefined;
    state.orders = [
      ...state.orders,
      {
        id: `m${state.orderSeq++}`,
        side,
        type: reduceOnly ? "market" : type,
        lots: lots.toFixed(2),
        price,
        stopLoss: reduceOnly ? undefined : stopLoss,
        takeProfit: reduceOnly ? undefined : takeProfit,
        reduceOnly,
        submittedAt: state.cursor,
        source: "manual",
      },
    ];
    render();
  };

  $<HTMLButtonElement>("buy").addEventListener("click", () => place("buy"));
  $<HTMLButtonElement>("sell").addEventListener("click", () => place("sell"));
  $<HTMLButtonElement>("close").addEventListener("click", () => {
    const view = viewOf();
    const openLots = Number(view.position.lots);
    if (Math.abs(openLots) < 0.005) return;
    place(openLots > 0 ? "sell" : "buy", true, Math.abs(openLots));
  });
  $<HTMLButtonElement>("half").addEventListener("click", () => {
    const view = viewOf();
    const open = Number(view.position.lots);
    const lots = Math.round((Math.abs(open) / 2) * 100) / 100;
    if (lots < 0.01) return;
    place(open > 0 ? "sell" : "buy", true, lots);
  });
  $<HTMLSelectElement>("order-type").addEventListener("change", () => {
    $<HTMLInputElement>("price").disabled = $<HTMLSelectElement>("order-type").value === "market";
  });
  stepSelect.addEventListener("change", () => {
    state.tradingTimeframe = stepSelect.value as Timeframe;
    if (transport) retargetTransport(transport, state.tradingTimeframe, state.timezone, transport.clock.status === "playing");
    syncTransport();
    if (transport?.clock.status === "playing") startAdvance();
    render();
  });
  zoneSelect.addEventListener("change", () => {
    state.timezone = zoneSelect.value;
    if (transport) retargetTransport(transport, state.tradingTimeframe, state.timezone, transport.clock.status === "playing");
    syncTransport();
    render();
  });
  $<HTMLInputElement>("strategy").addEventListener("change", () => {
    state.strategy = $<HTMLInputElement>("strategy").checked;
    render();
  });
  $<HTMLSelectElement>("speed").addEventListener("change", () => {
    state.speed = Number($<HTMLSelectElement>("speed").value);
    transport?.clock.setSpeed(state.speed);
  });
  $<HTMLButtonElement>("play").addEventListener("click", () => {
    if (!transport) return;
    if (transport.clock.status === "playing") transport.clock.pause();
    else transport.clock.play();
    syncTransport();
    if (transport.clock.status === "playing") startAdvance();
    else stopAdvance();
    render();
  });
  $<HTMLButtonElement>("step-forward").addEventListener("click", () => {
    if (!transport) return;
    stepTransport(transport, 1);
    syncTransport();
    stopAdvance();
    render();
  });
  $<HTMLButtonElement>("step-back").addEventListener("click", () => {
    if (!transport) return;
    stepTransport(transport, -1);
    syncTransport();
    stopAdvance();
    render();
  });
  $<HTMLButtonElement>("follow").addEventListener("click", () => {
    state.follow = !state.follow;
    render();
  });
  $<HTMLInputElement>("slider").addEventListener("input", () => {
    if (!transport) return;
    seekTransport(transport, Number($<HTMLInputElement>("slider").value));
    syncTransport();
    render();
  });
  $<HTMLInputElement>("seek").addEventListener("change", () => {
    const time = parseZonedInput($<HTMLInputElement>("seek").value, state.timezone);
    if (!transport || !Number.isFinite(time)) return;
    const { min, max } = bounds(state.minutes);
    seekTransport(transport, Math.min(max, Math.max(min, time)));
    syncTransport();
    render();
  });
  $<HTMLButtonElement>("next-session").addEventListener("click", () => {
    if (!transport) return;
    const name = jumpTransport(transport);
    if (!name) return;
    syncTransport();
    state.follow = true;
    render();
  });
  $<HTMLButtonElement>("add-pane").addEventListener("click", () => {
    const panes = addPane(state.panes);
    if (!panes) return;
    state.panes = panes;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".tool").forEach((button) => {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool as DrawingKind | "cursor";
      state.tool = tool;
      if (tool === "cursor") desk.cancelDraw();
      else desk.beginDraw(tool);
      render();
    });
  });
  studyHost.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const id = target.dataset.study;
    if (!id) return;
    state.studies = state.studies.map((study) => {
      if (study.id !== id) return study;
      if (target.type === "checkbox") return { ...study, enabled: target.checked };
      const key = target.dataset.param;
      if (!key) return study;
      return { ...study, params: { ...study.params, [key]: Number(target.value) } };
    });
    render();
  });

  $<HTMLButtonElement>("save-session").addEventListener("click", () => {
    const view = viewOf();
    downloadSession(persist([...view.fills]));
  });
  $<HTMLButtonElement>("open-session").addEventListener("click", () => $<HTMLInputElement>("session-file").click());
  $<HTMLInputElement>("session-file").addEventListener("change", async () => {
    const file = $<HTMLInputElement>("session-file").files?.[0];
    if (!file) return;
    const parsed = (await readJsonFile(file)) as SessionFile;
    if (parsed.version !== 1) return;
    if (parsed.tapeId !== state.tapeId) {
      $("status").textContent = "That session belongs to a different tape.";
      return;
    }
    stopAdvance();
    state = initialState({ minutes: state.minutes, events: state.events, tapeId: state.tapeId, source: state.source }, parsed);
    bindTransport();
    tapeSig = "*";
    workSig = "*";
    render();
  });
  $<HTMLButtonElement>("open-tape").addEventListener("click", () => $<HTMLInputElement>("tape-file").click());
  $<HTMLInputElement>("tape-file").addEventListener("change", async () => {
    const file = $<HTMLInputElement>("tape-file").files?.[0];
    if (!file) return;
    const tape = parseUserTape(await readJsonFile(file));
    if (!tape) {
      $("status").textContent = "Could not read that 1-minute file.";
      return;
    }
    stopAdvance();
    state = initialState(tape, null);
    bindTransport();
    tapeSig = "*";
    workSig = "*";
    render();
  });

  window.addEventListener("keydown", (event) => {
    if (!ready) return;
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
    if (typing) return;
    if (transport) {
      const result = keyTransport(transport, {
        key: event.key,
        code: event.code,
        repeat: event.repeat,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
      if (result.handled) {
        event.preventDefault();
        syncTransport();
        if (transport.clock.status === "playing") startAdvance();
        else stopAdvance();
        render();
        return;
      }
    }
    if (event.key === "Escape") {
      state.tool = "cursor";
      desk.cancelDraw();
      render();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      const id = desk.selectedDrawing();
      if (!id) return;
      event.preventDefault();
      state.drawings = state.drawings.filter((drawing) => drawing.id !== id);
      desk.clearSelection();
      render();
    }
  });
  window.addEventListener("resize", () => desk.resize());

  $("app").addEventListener(
    "pointerdown",
    (event) => {
      if (ready) return;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  $<HTMLButtonElement>("demo-fill").addEventListener("click", () => {
    if (!ready) return;
    const view = viewOf();
    const lots = Number($<HTMLInputElement>("lots").value);
    const type = $<HTMLSelectElement>("order-type").value as "market" | "limit" | "stop";
    const price = $<HTMLInputElement>("price").value.trim();
    void fillOnBacktest({
      clientOrderId: `desk-${state.orderSeq}`,
      side: "buy",
      type,
      lots: (lots >= 0.01 ? lots : 0.1).toFixed(2),
      markPrice: view.ask,
      limitPrice: type === "limit" ? price : undefined,
      stopPrice: type === "stop" ? price : undefined,
      now: new Date(state.cursor).toISOString(),
    }).then((fill) => {
      $("package-note").textContent = fill.ok
        ? `Local ${fill.status} ${fill.price}. Not transmitted. Swap ticket stays closed.`
        : `Local fill refused (${fill.code}). Swap ticket stays closed.`;
    });
  });
  $<HTMLButtonElement>("billing-preview").addEventListener("click", () => {
    if (!ready) return;
    const tail = state.minutes.filter((minute) => minute.t + 60_000 <= state.cursor).slice(-30);
    void fetch("/api/desk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cursor: state.cursor,
        price: viewOf().ask,
        minutes: tail.map((minute) => ({ t: minute.t, o: minute.o, h: minute.h, l: minute.l, c: minute.c })),
        timeframes: ["1m"],
        previewCheckout: true,
      }),
    })
      .then((response) => response.json())
      .then((report: { billing?: { url?: string | null; checkouts?: number } }) => {
        const url = report.billing?.url ?? "";
        $("package-note").textContent = url.startsWith("https://billing.invalid/")
          ? `Optional checkout ${url}. Replay did not require it.`
          : "Checkout preview did not run. Replay still does not require it.";
      })
      .catch(() => {
        $("package-note").textContent = "Checkout preview did not run. Replay still does not require it.";
      });
  });
  $<HTMLButtonElement>("journal-save").addEventListener("click", () => {
    if (!ready) return;
    const lots = Number(viewOf().position.lots);
    const note = replayNote({
      symbol: EURUSD.symbol,
      side: lots < 0 ? "short" : "long",
      at: new Date(state.cursor).toISOString(),
      r: $<HTMLInputElement>("journal-r").value,
    });
    if ("error" in note) {
      $("journal-readout").textContent = note.error;
      return;
    }
    void saveTrade(note.trade).then(() => refreshJournal());
  });

  void loadDefaultTape().then((tape) => {
    state = initialState(tape, loadSession());
    bindTransport();
    ready = true;
    render();
    void refreshJournal();
  });
}

boot();
