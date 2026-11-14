// SPDX-License-Identifier: Apache-2.0

import {
  dispose,
  init,
  type Chart,
  type KLineData,
  type OverlayCreate,
} from "klinecharts";
import { aggregate, num, periodOf, type Minute, type SymbolSpec, type Timeframe } from "@flowchart/bars";
import type { WorkingOrder } from "@flowchart/orders";
import type { Drawing, DrawingKind } from "../drawings";
import { loadStudies } from "../studies/load";
import { installChartExtensions } from "./register";
import { chartStyles } from "./theme";

const OVERLAY_NAME: Record<DrawingKind, string> = {
  level: "horizontalStraightLine",
  segment: "segment",
  range: "range",
  fib: "fibonacciLine",
};

type LivePane = {
  id: string;
  timeframe: Timeframe;
  root: HTMLElement;
  host: HTMLElement;
  meta: HTMLElement;
  select: HTMLSelectElement;
  chart: Chart;
  pending: KLineData[];
  push: ((bar: KLineData) => void) | null;
};

export type DeskHandlers = {
  onPaneTimeframe: (id: string, timeframe: Timeframe) => void;
  onPaneClose: (id: string) => void;
  onFollow: (follow: boolean) => void;
  onDrawing: (drawing: Drawing) => void;
  onDrawingMove: (drawing: Drawing) => void;
  onPrice: (price: number) => void;
};

export type StudySelection = { id: string; params: Record<string, number> };

function roundTick(value: number, tick: string): number {
  const size = Number(tick);
  return Math.round(value / size) * size;
}

function toKline(bar: { t: number; ct: number; o: string; h: string; l: string; c: string; partial: boolean }): KLineData {
  return {
    timestamp: bar.t,
    open: num(bar.o),
    high: num(bar.h),
    low: num(bar.l),
    close: num(bar.c),
    volume: 0,
    ct: bar.ct,
    partial: bar.partial,
  };
}

function rightEdge(chart: Chart): number | null {
  const list = chart.getDataList();
  if (list.length === 0) return null;
  const range = chart.getVisibleRange();
  const index = Math.max(0, Math.min(list.length - 1, range.to - 1));
  return list[index]?.timestamp ?? null;
}

function drawingFrom(kind: DrawingKind, id: string, points: Array<{ timestamp?: number; value?: number }>): Drawing | null {
  if (kind === "level") {
    const price = points[0]?.value;
    const t = points[0]?.timestamp;
    if (price === undefined || t === undefined) return null;
    return { id, kind, t, price };
  }
  const t1 = points[0]?.timestamp;
  const p1 = points[0]?.value;
  const t2 = points[1]?.timestamp;
  const p2 = points[1]?.value;
  if (t1 === undefined || p1 === undefined || t2 === undefined || p2 === undefined) return null;
  return { id, kind, t1, p1, t2, p2 };
}

function overlayOf(drawing: Drawing): OverlayCreate {
  const base = { id: drawing.id, groupId: "drawings", name: OVERLAY_NAME[drawing.kind], lock: false };
  if (drawing.kind === "level") {
    return { ...base, points: [{ timestamp: drawing.t, value: drawing.price }], styles: { line: { color: "#e4a85c" } } };
  }
  const color = drawing.kind === "fib" ? "#c9b79a" : "#e7d7be";
  return {
    ...base,
    points: [
      { timestamp: drawing.t1, value: drawing.p1 },
      { timestamp: drawing.t2, value: drawing.p2 },
    ],
    styles: { line: { color } },
  };
}

export function createDesk(
  mount: HTMLElement,
  spec: SymbolSpec,
  handlers: DeskHandlers,
  formatTime: (ms: number, zone: string) => string,
) {
  const studies = loadStudies();
  installChartExtensions(studies, spec);
  const live: LivePane[] = [];
  let minutes: Minute[] = [];
  let cursor = 0;
  let timezone = "UTC";
  let follow = true;
  let quiet = 0;
  let selected = "";
  let drawingKind: DrawingKind | null = null;
  let drawSeq = 1;
  let studySelection: StudySelection[] = [];
  let drawingList: Drawing[] = [];
  let drawingSig = "";
  let orderList: WorkingOrder[] = [];
  let orderSig = "";
  let eventList: { time: number; label: string }[] = [];
  let eventSig = "";
  let flagList: { time: number; price: number; label: string }[] = [];
  let flagSig = "";
  let layoutKey = "";

  const runQuiet = (fn: () => void) => {
    quiet += 1;
    try {
      fn();
    } finally {
      quiet -= 1;
    }
  };

  const paneById = (id: string) => live.find((pane) => pane.id === id);

  const applyStudies = (pane: LivePane) => {
    const names = new Set(pane.chart.getIndicators({ paneId: "candle_pane" }).map((item) => item.name));
    if (!names.has("sessionShade")) {
      pane.chart.createIndicator(
        {
          name: "sessionShade",
          paneId: "candle_pane",
          extendData: { sessions: spec.sessions },
          styles: { tooltip: { showRule: "none" } },
        },
        true,
      );
    }
    const enabled = new Set(studySelection.map((study) => study.id));
    for (const study of studySelection) {
      const pkg = studies.find((item) => item.id === study.id);
      if (!pkg) continue;
      const calcParams = pkg.params.map((param) => study.params[param.key] ?? param.default);
      const extendData = { timeframe: pane.timeframe, cursor };
      if (!names.has(study.id)) {
        pane.chart.createIndicator(
          {
            name: study.id,
            paneId: "candle_pane",
            calcParams,
            extendData,
            styles: { lastValueMark: { show: false }, tooltip: { showRule: "always" } },
          },
          true,
        );
      } else {
        pane.chart.overrideIndicator({ name: study.id, paneId: "candle_pane", calcParams, extendData });
      }
    }
    for (const name of names) {
      if (name !== "sessionShade" && !enabled.has(name)) pane.chart.removeIndicator({ name, paneId: "candle_pane" });
    }
  };

  const paintDrawings = () => {
    for (const pane of live) {
      pane.chart.removeOverlay({ groupId: "drawings" });
      if (drawingSig === "[]") continue;
      for (const drawing of JSON.parse(drawingSig) as Drawing[]) {
        pane.chart.createOverlay({
          ...overlayOf(drawing),
          onSelected: (event) => {
            selected = String(event.overlay.extendData ?? event.overlay.id);
          },
          onPressedMoveEnd: (event) => {
            const kind = (Object.keys(OVERLAY_NAME) as DrawingKind[]).find((key) => OVERLAY_NAME[key] === event.overlay.name);
            if (!kind) return;
            const next = drawingFrom(kind, event.overlay.id, event.overlay.points);
            if (next) handlers.onDrawingMove(next);
          },
        });
      }
    }
  };

  const attachChart = (pane: LivePane) => {
    const chart = init(pane.host, {
      styles: "dark",
      timezone,
      locale: "en-US",
      hotkey: { enabled: false },
      formatter: {
        formatDate: ({ timestamp }) => formatTime(timestamp, timezone),
      },
    });
    if (!chart) throw new Error("Chart failed to start");
    pane.chart = chart;
    chart.setStyles(chartStyles());
    chart.setSymbol({ ticker: spec.symbol, pricePrecision: spec.pricePrecision, volumePrecision: 0 });
    chart.setPeriod(periodOf(pane.timeframe));
    chart.setDecimalFold({ threshold: 20, format: (value) => String(value) });
    chart.setBarSpace(8);
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        callback(type === "init" ? pane.pending : [], false);
      },
      subscribeBar: ({ callback }) => {
        pane.push = callback;
      },
      unsubscribeBar: () => {
        pane.push = null;
      },
    });
    chart.subscribeAction("onCrosshairChange", (raw) => {
      if (quiet > 0) return;
      const data = raw as { kLineData?: { timestamp?: number }; timestamp?: number };
      const time = data?.kLineData?.timestamp ?? data?.timestamp;
      if (!time) return;
      runQuiet(() => {
        for (const other of live) {
          if (other === pane) continue;
          const coord = other.chart.convertToPixel({ timestamp: time });
          const x = Array.isArray(coord) ? undefined : coord.x;
          if (typeof x === "number") other.chart.executeAction("onCrosshairChange", { x, paneId: "candle_pane" });
        }
      });
    });
    chart.subscribeAction("onScroll", () => {
      if (quiet > 0) return;
      follow = false;
      handlers.onFollow(false);
      const time = rightEdge(chart);
      if (time === null) return;
      runQuiet(() => {
        for (const other of live) {
          if (other !== pane) other.chart.scrollToTimestamp(time);
        }
      });
    });
    let down: { x: number; y: number } | null = null;
    pane.host.addEventListener("pointerdown", (event) => {
      down = { x: event.clientX, y: event.clientY };
    });
    pane.host.addEventListener("pointerup", (event) => {
      if (!down || drawingKind) {
        down = null;
        return;
      }
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      down = null;
      if (moved > 4) return;
      const rect = pane.host.getBoundingClientRect();
      const converted = chart.convertFromPixel([{ x: event.clientX - rect.left, y: event.clientY - rect.top }], { absolute: true });
      const point = Array.isArray(converted) ? converted[0] : converted;
      if (typeof point?.value === "number") handlers.onPrice(roundTick(point.value, spec.tickSize));
    });
    applyStudies(pane);
  };

  const buildPane = (id: string, timeframe: Timeframe): LivePane => {
    const root = document.createElement("section");
    root.className = "pane";
    root.dataset.pane = id;
    const header = document.createElement("header");
    header.className = "pane-head";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Pane timeframe");
    for (const tf of ["1m", "5m", "15m", "1h", "4h"] as Timeframe[]) {
      const option = document.createElement("option");
      option.value = tf;
      option.textContent = tf;
      select.append(option);
    }
    select.value = timeframe;
    select.addEventListener("change", () => handlers.onPaneTimeframe(id, select.value as Timeframe));
    const meta = document.createElement("span");
    meta.className = "pane-meta";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "pane-close";
    close.textContent = "×";
    close.title = "Remove pane";
    close.addEventListener("click", () => handlers.onPaneClose(id));
    header.append(select, meta, close);
    const host = document.createElement("div");
    host.className = "chart-host";
    root.append(header, host);
    mount.append(root);
    const pane: LivePane = { id, timeframe, root, host, meta, select, chart: null as unknown as Chart, pending: [], push: null };
    attachChart(pane);
    return pane;
  };

  const refreshMeta = (pane: LivePane, bars: KLineData[]) => {
    const last = bars[bars.length - 1];
    pane.root.dataset.lastCt = last ? String(last.ct ?? "") : "";
    pane.root.dataset.lastHigh = last ? String(last.high) : "";
    pane.root.dataset.lastOpen = last ? String(last.timestamp) : "";
    pane.root.dataset.partial = last && last.partial ? "1" : "0";
    pane.meta.textContent = last
      ? `${last.partial ? "forming · " : ""}${formatTime(Number(last.ct ?? last.timestamp), timezone)}`
      : "";
  };

  return {
    setPanes(panes: { id: string; timeframe: Timeframe }[]) {
      const key = panes.map((pane) => `${pane.id}:${pane.timeframe}`).join("|");
      if (key === layoutKey) return;
      const previousIds = live.map((pane) => pane.id).join("|");
      layoutKey = key;
      const nextIds = new Set(panes.map((pane) => pane.id));
      for (const pane of live.slice()) {
        if (nextIds.has(pane.id)) continue;
        dispose(pane.chart);
        pane.root.remove();
        live.splice(live.indexOf(pane), 1);
      }
      for (const specPane of panes) {
        const existing = paneById(specPane.id);
        if (!existing) {
          live.push(buildPane(specPane.id, specPane.timeframe));
          continue;
        }
        if (existing.timeframe !== specPane.timeframe) {
          existing.timeframe = specPane.timeframe;
          existing.select.value = specPane.timeframe;
          existing.pending = aggregate(minutes, specPane.timeframe, cursor).map(toKline);
          runQuiet(() => existing.chart.setPeriod(periodOf(specPane.timeframe)));
          applyStudies(existing);
        }
      }
      const closers = mount.querySelectorAll<HTMLButtonElement>(".pane-close");
      closers.forEach((button) => {
        button.hidden = live.length < 2;
      });
      const structureChanged = previousIds !== panes.map((pane) => pane.id).join("|");
      if (structureChanged) {
        drawingSig = "";
        orderSig = "";
        eventSig = "";
        flagSig = "";
        this.setDrawings(drawingList);
        this.setOrders(orderList);
        this.setEvents(eventList);
        this.setFlags(flagList);
      }
      requestAnimationFrame(() => {
        for (const pane of live) {
          pane.chart.resize();
          if (follow) runQuiet(() => pane.chart.scrollToRealTime());
        }
      });
    },
    setTimezone(next: string) {
      timezone = next;
      for (const pane of live) pane.chart.setTimezone(next);
    },
    setStudies(next: StudySelection[]) {
      studySelection = next;
      for (const pane of live) applyStudies(pane);
    },
    sync(nextMinutes: Minute[], nextCursor: number, nextFollow: boolean) {
      minutes = nextMinutes;
      cursor = nextCursor;
      follow = nextFollow;
      for (const pane of live) {
        const bars = aggregate(minutes, pane.timeframe, cursor).map(toKline);
        const current = pane.chart.getDataList();
        const overlap =
          pane.push &&
          current.length > 0 &&
          bars.length >= current.length &&
          bars.length - current.length < 500 &&
          bars[current.length - 1]?.timestamp === current[current.length - 1]?.timestamp;
        runQuiet(() => {
          if (overlap && pane.push) {
            for (let i = current.length - 1; i < bars.length; i++) pane.push(bars[i]);
          } else {
            pane.pending = bars;
            pane.chart.resetData();
          }
          if (follow) pane.chart.scrollToRealTime();
        });
        pane.chart.overrideIndicator({ name: "sessionShade", paneId: "candle_pane", extendData: { sessions: spec.sessions } });
        for (const study of studySelection) {
          pane.chart.overrideIndicator({
            name: study.id,
            paneId: "candle_pane",
            extendData: { timeframe: pane.timeframe, cursor },
          });
        }
        refreshMeta(pane, bars);
      }
    },
    setDrawings(drawings: Drawing[]) {
      drawingList = drawings;
      const sig = JSON.stringify(drawings);
      if (sig === drawingSig) return;
      drawingSig = sig;
      for (const drawing of drawings) {
        const num = Number(drawing.id.replace(/\D/g, ""));
        if (Number.isFinite(num)) drawSeq = Math.max(drawSeq, num + 1);
      }
      paintDrawings();
    },
    beginDraw(kind: DrawingKind) {
      drawingKind = kind;
      for (const pane of live) {
        pane.chart.removeOverlay({ groupId: "draft" });
        pane.chart.createOverlay({
          name: OVERLAY_NAME[kind],
          groupId: "draft",
          onDrawEnd: (event) => {
            const id = `d${drawSeq++}`;
            const drawing = drawingFrom(kind, id, event.overlay.points);
            drawingKind = null;
            for (const other of live) other.chart.removeOverlay({ groupId: "draft" });
            if (drawing) handlers.onDrawing(drawing);
          },
        });
      }
    },
    cancelDraw() {
      drawingKind = null;
      for (const pane of live) pane.chart.removeOverlay({ groupId: "draft" });
    },
    selectedDrawing() {
      return selected;
    },
    clearSelection() {
      selected = "";
    },
    setOrders(orders: WorkingOrder[]) {
      orderList = orders;
      const sig = JSON.stringify(orders);
      if (sig === orderSig) return;
      orderSig = sig;
      for (const pane of live) {
        pane.chart.removeOverlay({ groupId: "orders" });
        const list = pane.chart.getDataList();
        const timestamp = list[list.length - 1]?.timestamp ?? cursor;
        for (const order of orders) {
          const color = order.side === "buy" ? "#8fd0b0" : "#e7a094";
          const label = `${order.role === "entry" ? order.type : order.role} ${order.side} ${order.lots}`;
          pane.chart.createOverlay({
            name: "simpleTag",
            id: `ord-${pane.id}-${order.id}`,
            groupId: "orders",
            lock: true,
            points: [{ timestamp, value: Number(order.price) }],
            extendData: label,
            styles: { line: { color, style: "dashed", dashedValue: [4, 3], size: 1 } },
          });
        }
      }
    },
    setEvents(events: { time: number; label: string }[]) {
      eventList = events;
      const visible = events.filter((event) => event.time <= cursor);
      const sig = JSON.stringify(visible);
      if (sig === eventSig) return;
      eventSig = sig;
      for (const pane of live) {
        pane.chart.removeOverlay({ groupId: "events" });
        const list = pane.chart.getDataList();
        for (const event of visible) {
          const bar = list.find((item) => item.timestamp <= event.time && Number(item.ct ?? item.timestamp) >= event.time) ?? list[list.length - 1];
          if (!bar) continue;
          pane.chart.createOverlay({
            name: "eventMark",
            id: `evt-${pane.id}-${event.time}`,
            groupId: "events",
            lock: true,
            points: [{ timestamp: bar.timestamp, value: bar.high }],
            extendData: event.label,
          });
        }
      }
    },
    setFlags(flags: { time: number; price: number; label: string }[]) {
      flagList = flags;
      const sig = JSON.stringify(flags);
      if (sig === flagSig) return;
      flagSig = sig;
      for (const pane of live) {
        pane.chart.removeOverlay({ groupId: "flags" });
        for (const flag of flags) {
          pane.chart.createOverlay({
            name: "flagMark",
            id: `flag-${pane.id}-${flag.time}-${flag.price}`,
            groupId: "flags",
            lock: true,
            points: [{ timestamp: flag.time, value: flag.price }],
            extendData: flag.label,
          });
        }
      }
    },
    resize() {
      for (const pane of live) pane.chart.resize();
    },
    destroy() {
      for (const pane of live) dispose(pane.chart);
      live.splice(0, live.length);
      mount.replaceChildren();
    },
  };
}

export type Desk = ReturnType<typeof createDesk>;
