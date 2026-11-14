// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { assertDecimal } from "./decimal.js";
import { WorkspaceError } from "./errors.js";
import { assertStyle } from "./hooks.js";
import { parsePeriod } from "./period.js";
import { parseUtc } from "./time.js";
import {
  CANDLE_TYPES,
  PRICE_SCALES,
  TREE_KINDS,
  type CandleType,
  type Drawing,
  type Layout,
  type Pane,
  type PlotStyle,
  type PriceScale,
  type SettingValue,
  type StrategyInstance,
  type StudyInstance,
  type TreeKind,
  type TreeNode,
} from "./types.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const NAME = /^[^\p{C}]{1,80}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function needString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new WorkspaceError("invalid_layout", `${label} is required`);
  }
  return value;
}

function needId(value: unknown, label: string): string {
  const id = needString(value, label);
  if (!ID.test(id)) {
    throw new WorkspaceError("invalid_layout", `${label} has an invalid id`);
  }
  return id;
}

function needName(value: unknown, label: string): string {
  const name = needString(value, label).trim();
  if (!NAME.test(name)) {
    throw new WorkspaceError("invalid_layout", `${label} name is empty or too long`);
  }
  return name;
}

function settingValue(value: unknown): SettingValue {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new WorkspaceError("invalid_layout", "a setting value has the wrong type");
}

function styleValue(value: unknown, label: string): PlotStyle {
  if (!isRecord(value)) {
    throw new WorkspaceError("invalid_layout", `${label} style is missing`);
  }
  const style: PlotStyle = {
    color: needString(value.color, `${label} color`),
    lineWidth: typeof value.lineWidth === "number" ? value.lineWidth : NaN,
    lineStyle: value.lineStyle as PlotStyle["lineStyle"],
  };
  assertStyle(style, label);
  return style;
}

function settingsOf(value: unknown): Record<string, SettingValue> {
  if (!isRecord(value)) {
    throw new WorkspaceError("invalid_layout", "settings must be an object");
  }
  const settings: Record<string, SettingValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    settings[key] = settingValue(entry);
  }
  return settings;
}

function stylesOf(value: unknown, label: string): Record<string, PlotStyle> {
  if (!isRecord(value)) {
    throw new WorkspaceError("invalid_layout", `${label} styles must be an object`);
  }
  const styles: Record<string, PlotStyle> = {};
  for (const [key, entry] of Object.entries(value)) {
    styles[key] = styleValue(entry, key);
  }
  return styles;
}

function studyOf(value: unknown): StudyInstance {
  if (!isRecord(value)) {
    throw new WorkspaceError("invalid_layout", "study is missing");
  }
  return {
    id: needId(value.id, "study"),
    hookId: needString(value.hookId, "study hook"),
    settings: settingsOf(value.settings),
    styles: stylesOf(value.styles, "study"),
  };
}

function drawingOf(value: unknown): Drawing {
  if (!isRecord(value) || !Array.isArray(value.anchors)) {
    throw new WorkspaceError("invalid_layout", "drawing is missing");
  }
  const tool = value.tool;
  if (tool !== "horizontal" && tool !== "segment") {
    throw new WorkspaceError("invalid_layout", "drawing tool must be horizontal or segment");
  }
  const anchors = value.anchors.map((anchor) => {
    if (!isRecord(anchor)) {
      throw new WorkspaceError("invalid_layout", "drawing anchor is missing");
    }
    const time = needString(anchor.time, "anchor time");
    parseUtc(time);
    const price = needString(anchor.price, "anchor price");
    assertDecimal(price, "anchor price");
    return { time, price };
  });
  if (tool === "horizontal" && anchors.length !== 1) {
    throw new WorkspaceError("invalid_layout", "a horizontal drawing needs one anchor");
  }
  if (tool === "segment" && anchors.length !== 2) {
    throw new WorkspaceError("invalid_layout", "a segment drawing needs two anchors");
  }
  return {
    id: needId(value.id, "drawing"),
    paneId: needId(value.paneId, "drawing pane"),
    tool,
    anchors,
  };
}

function strategyOf(value: unknown): StrategyInstance {
  if (!isRecord(value)) {
    throw new WorkspaceError("invalid_layout", "strategy is missing");
  }
  return {
    id: needId(value.id, "strategy"),
    hookId: needString(value.hookId, "strategy hook"),
    settings: settingsOf(value.settings),
    styles: stylesOf(value.styles, "strategy"),
  };
}

function nodeOf(value: unknown): TreeNode {
  if (!isRecord(value)) {
    throw new WorkspaceError("invalid_layout", "tree node is missing");
  }
  const kind = value.kind;
  if (typeof kind !== "string" || !TREE_KINDS.includes(kind as TreeKind)) {
    throw new WorkspaceError("invalid_layout", "tree kind is invalid");
  }
  if (typeof value.visible !== "boolean" || typeof value.locked !== "boolean") {
    throw new WorkspaceError("invalid_layout", "tree visibility and lock must be booleans");
  }
  if (typeof value.index !== "number" || !Number.isInteger(value.index)) {
    throw new WorkspaceError("invalid_layout", "tree index must be a whole number");
  }
  const parentId = value.parentId === null ? null : needId(value.parentId, "tree parent");
  return {
    id: needId(value.id, "tree node"),
    kind: kind as TreeKind,
    name: needName(value.name, "tree node"),
    visible: value.visible,
    locked: value.locked,
    parentId,
    index: value.index,
  };
}

function paneAncestor(nodes: Map<string, TreeNode>, id: string): string | null {
  const seen = new Set<string>();
  let current = nodes.get(id);
  while (current) {
    if (seen.has(current.id)) {
      throw new WorkspaceError("invalid_layout", "object tree has a cycle");
    }
    seen.add(current.id);
    if (current.kind === "pane") {
      return current.id;
    }
    if (current.parentId === null) {
      return null;
    }
    current = nodes.get(current.parentId);
  }
  return null;
}

export function normalizeTree(nodes: TreeNode[]): TreeNode[] {
  const groups = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    const key = node.parentId ?? "";
    const list = groups.get(key) ?? [];
    list.push(node);
    groups.set(key, list);
  }
  const next: TreeNode[] = [];
  for (const list of groups.values()) {
    list.sort((left, right) => left.index - right.index || left.id.localeCompare(right.id));
    list.forEach((node, index) => {
      next.push({ ...node, index });
    });
  }
  return next;
}

export function validateLayout(value: unknown): Layout {
  if (!isRecord(value)) {
    throw new WorkspaceError("invalid_layout", "layout must be an object");
  }
  if (value.format !== "flowchart.layout" || value.version !== 1) {
    throw new WorkspaceError("invalid_layout", "layout format must be flowchart.layout version 1");
  }
  const candleType = value.candleType;
  if (typeof candleType !== "string" || !CANDLE_TYPES.includes(candleType as CandleType)) {
    throw new WorkspaceError("invalid_layout", "candle type is invalid");
  }
  const priceScale = value.priceScale;
  if (typeof priceScale !== "string" || !PRICE_SCALES.includes(priceScale as PriceScale)) {
    throw new WorkspaceError("invalid_layout", "price scale is invalid");
  }
  const period = needString(value.period, "period");
  parsePeriod(period);
  const timezone = needString(value.timezone, "timezone");
  if (typeof value.crosshairSync !== "boolean") {
    throw new WorkspaceError("invalid_layout", "crosshairSync must be a boolean");
  }
  if (!Array.isArray(value.panes) || value.panes.length < 1 || value.panes.length > 8) {
    throw new WorkspaceError("invalid_layout", "a layout has from one to eight panes");
  }
  const panes: Pane[] = value.panes.map((pane) => {
    if (!isRecord(pane) || !Array.isArray(pane.studies)) {
      throw new WorkspaceError("invalid_layout", "pane is missing");
    }
    return { id: needId(pane.id, "pane"), studies: pane.studies.map(studyOf) };
  });
  const drawings = Array.isArray(value.drawings) ? value.drawings.map(drawingOf) : null;
  const strategies = Array.isArray(value.strategies) ? value.strategies.map(strategyOf) : null;
  const tree = Array.isArray(value.tree) ? value.tree.map(nodeOf) : null;
  if (!drawings || !strategies || !tree) {
    throw new WorkspaceError("invalid_layout", "drawings, strategies, and tree are required");
  }
  const paneIds = new Set(panes.map((pane) => pane.id));
  if (paneIds.size !== panes.length) {
    throw new WorkspaceError("invalid_layout", "pane ids must be unique");
  }
  const studyIds = new Set<string>();
  for (const pane of panes) {
    for (const study of pane.studies) {
      if (studyIds.has(study.id)) {
        throw new WorkspaceError("invalid_layout", "study ids must be unique");
      }
      studyIds.add(study.id);
    }
  }
  const drawingIds = new Set(drawings.map((drawing) => drawing.id));
  const strategyIds = new Set(strategies.map((strategy) => strategy.id));
  if (drawingIds.size !== drawings.length || strategyIds.size !== strategies.length) {
    throw new WorkspaceError("invalid_layout", "drawing and strategy ids must be unique");
  }
  for (const drawing of drawings) {
    if (!paneIds.has(drawing.paneId)) {
      throw new WorkspaceError("invalid_layout", "drawing pane is missing");
    }
  }
  const nodes = new Map<string, TreeNode>();
  for (const node of tree) {
    if (nodes.has(node.id)) {
      throw new WorkspaceError("invalid_layout", "tree ids must be unique");
    }
    nodes.set(node.id, node);
  }
  const expected = new Map<string, TreeKind>();
  for (const pane of panes) {
    expected.set(pane.id, "pane");
    for (const study of pane.studies) {
      expected.set(study.id, "study");
    }
  }
  for (const drawing of drawings) {
    expected.set(drawing.id, "drawing");
  }
  for (const strategy of strategies) {
    expected.set(strategy.id, "strategy");
  }
  for (const node of nodes.values()) {
    if (node.kind === "group") {
      if (expected.has(node.id)) {
        throw new WorkspaceError("invalid_layout", `group ${node.id} reuses another id`);
      }
      expected.set(node.id, "group");
    }
  }
  if (expected.size !== nodes.size) {
    throw new WorkspaceError(
      "invalid_layout",
      "the object tree must list every pane, study, drawing, strategy, and group",
    );
  }
  for (const [id, kind] of expected) {
    const node = nodes.get(id);
    if (!node || node.kind !== kind) {
      throw new WorkspaceError("invalid_layout", `object tree is missing ${kind} ${id}`);
    }
  }
  for (const node of nodes.values()) {
    if (node.parentId !== null && !nodes.has(node.parentId)) {
      throw new WorkspaceError("invalid_layout", "a tree parent is missing");
    }
    if (node.parentId !== null) {
      const parent = nodes.get(node.parentId);
      if (parent && parent.kind !== "pane" && parent.kind !== "group") {
        throw new WorkspaceError("invalid_layout", "a tree parent must be a pane or a group");
      }
    }
    if (node.kind === "pane" && node.parentId !== null) {
      throw new WorkspaceError("invalid_layout", "a pane stays at the root of the object tree");
    }
  }
  for (const node of nodes.values()) {
    paneAncestor(nodes, node.id);
  }
  for (const pane of panes) {
    for (const study of pane.studies) {
      if (paneAncestor(nodes, study.id) !== pane.id) {
        throw new WorkspaceError("invalid_layout", "a study must sit inside its pane");
      }
    }
  }
  for (const drawing of drawings) {
    if (paneAncestor(nodes, drawing.id) !== drawing.paneId) {
      throw new WorkspaceError("invalid_layout", "a drawing must sit inside its pane");
    }
  }
  const layout: Layout = {
    format: "flowchart.layout",
    version: 1,
    name: needName(value.name, "layout"),
    symbol: needString(value.symbol, "symbol"),
    candleType: candleType as CandleType,
    period,
    priceScale: priceScale as PriceScale,
    timezone,
    crosshairSync: value.crosshairSync,
    panes,
    drawings,
    strategies,
    tree: normalizeTree([...nodes.values()]),
  };
  return layout;
}

export function parseLayout(text: string): Layout {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new WorkspaceError("invalid_layout", "layout text is not JSON");
  }
  return validateLayout(value);
}

export function stringifyLayout(layout: Layout): string {
  return JSON.stringify(validateLayout(layout));
}

export function cloneLayout(layout: Layout): Layout {
  return validateLayout(structuredClone(layout));
}
