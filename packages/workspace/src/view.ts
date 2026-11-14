// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { runBacktest, runIndicator, type HookRegistry } from "./hooks.js";
import { effectiveLocked, effectiveVisible, findNode } from "./tree.js";
import type {
  BacktestResult,
  Bar,
  Drawing,
  Layout,
  PlotStyle,
  SealedWindow,
  Tape,
} from "./types.js";
import { windowAt } from "./window.js";

export interface StudyView {
  id: string;
  hookId: string;
  name: string;
  overlay: boolean;
  visible: boolean;
  locked: boolean;
  z: number;
  revision: string;
  plots: Record<string, Array<number | null>>;
  styles: Record<string, PlotStyle>;
  plotOrder: string[];
  paramsText: string;
}

export interface DrawingView {
  drawing: Drawing;
  visible: boolean;
  locked: boolean;
  z: number;
}

export interface MarkerView {
  id: string;
  time: string;
  price: string;
  side: "buy" | "sell";
  color: string;
}

export interface BacktestView {
  id: string;
  name: string;
  visible: boolean;
  result: BacktestResult;
}

export interface PaneView {
  id: string;
  name: string;
  visible: boolean;
  studies: StudyView[];
  drawings: DrawingView[];
}

export interface DeskView {
  layout: Layout;
  window: SealedWindow;
  panes: PaneView[];
  backtests: BacktestView[];
}

const MARKER_CAP = 30;

function revisionOf(length: number, settings: unknown, plots: Record<string, Array<number | null>>): string {
  const last = Object.values(plots)
    .map((series) => series.at(-1) ?? null)
    .join(",");
  return `${length}:${JSON.stringify(settings)}:${last}`;
}

export function buildView(
  tape: Tape,
  cursor: string,
  layout: Layout,
  hooks: HookRegistry,
): DeskView {
  const sealed = windowAt(tape, cursor, layout.period);
  const panes: PaneView[] = layout.panes.map((pane) => {
    const studies: StudyView[] = pane.studies.map((study) => {
      const hook = hooks.indicator(study.hookId);
      const node = findNode(layout, study.id);
      const plots = runIndicator(hook, sealed, study.settings).plots;
      return {
        id: study.id,
        hookId: hook.id,
        name: node.name,
        overlay: hook.overlay,
        visible: effectiveVisible(layout, study.id),
        locked: effectiveLocked(layout, study.id),
        z: node.index,
        revision: revisionOf(sealed.bars.length, study.settings, plots),
        plots,
        styles: study.styles,
        plotOrder: hook.plots.map((plot) => plot.key),
        paramsText: hook.settings
          .map((field) => study.settings[field.key])
          .filter((value) => value !== undefined)
          .join(", "),
      };
    });
    const drawings: DrawingView[] = layout.drawings
      .filter((drawing) => drawing.paneId === pane.id)
      .map((drawing) => {
        const node = findNode(layout, drawing.id);
        return {
          drawing,
          visible: effectiveVisible(layout, drawing.id),
          locked: effectiveLocked(layout, drawing.id),
          z: node.index,
        };
      });
    const paneNode = findNode(layout, pane.id);
    return {
      id: pane.id,
      name: paneNode.name,
      visible: effectiveVisible(layout, pane.id),
      studies,
      drawings,
    };
  });

  const backtests: BacktestView[] = layout.strategies.map((strategy) => {
    const hook = hooks.strategy(strategy.hookId);
    const node = findNode(layout, strategy.id);
    const visible = effectiveVisible(layout, strategy.id);
    const result = visible
      ? runBacktest(hook, sealed, strategy.settings)
      : { trades: [], summary: { tradeCount: 0, net: "0" } };
    return { id: strategy.id, name: node.name, visible, result };
  });

  return { layout, window: sealed, panes, backtests };
}

export function markersFor(view: DeskView, strategyId: string): MarkerView[] {
  const strategy = view.layout.strategies.find((entry) => entry.id === strategyId);
  const backtest = view.backtests.find((entry) => entry.id === strategyId);
  if (!strategy || !backtest?.visible) {
    return [];
  }
  const trades = backtest.result.trades.slice(-MARKER_CAP);
  return trades.map((trade, index) => {
    const bar = view.window.bars.find((entry) => entry.closeTime === trade.time);
    const color = strategy.styles[trade.side]?.color ?? "#888888";
    return {
      id: `${strategyId}-mark-${index}`,
      time: bar?.openTime ?? trade.time,
      price: trade.price,
      side: trade.side,
      color,
    };
  });
}

export function chartSeries(window: SealedWindow): Bar[] {
  return window.forming ? [...window.bars, window.forming] : [...window.bars];
}
