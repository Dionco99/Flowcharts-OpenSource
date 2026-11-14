// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceError } from "./errors.js";
import { cloneLayout, normalizeTree, validateLayout } from "./layout.js";
import type { Layout, TreeNode } from "./types.js";

function nodeMap(layout: Layout): Map<string, TreeNode> {
  return new Map(layout.tree.map((node) => [node.id, node]));
}

export function findNode(layout: Layout, id: string): TreeNode {
  const node = layout.tree.find((entry) => entry.id === id);
  if (!node) {
    throw new WorkspaceError("invalid_argument", `object ${id} is not in the tree`);
  }
  return node;
}

export function effectiveVisible(layout: Layout, id: string): boolean {
  const nodes = nodeMap(layout);
  let current = nodes.get(id);
  if (!current) {
    throw new WorkspaceError("invalid_argument", `object ${id} is not in the tree`);
  }
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) {
      throw new WorkspaceError("invalid_layout", "object tree has a cycle");
    }
    seen.add(current.id);
    if (!current.visible) {
      return false;
    }
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return true;
}

export function effectiveLocked(layout: Layout, id: string): boolean {
  const nodes = nodeMap(layout);
  let current = nodes.get(id);
  if (!current) {
    throw new WorkspaceError("invalid_argument", `object ${id} is not in the tree`);
  }
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) {
      throw new WorkspaceError("invalid_layout", "object tree has a cycle");
    }
    seen.add(current.id);
    if (current.locked) {
      return true;
    }
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return false;
}

function commit(layout: Layout, tree: TreeNode[]): Layout {
  return validateLayout({ ...layout, tree: normalizeTree(tree) });
}

function descendants(layout: Layout, id: string): string[] {
  const ids = [id];
  for (const node of layout.tree) {
    if (node.parentId === id) {
      ids.push(...descendants(layout, node.id));
    }
  }
  return ids;
}

function assertEditable(layout: Layout, id: string): void {
  if (effectiveLocked(layout, id)) {
    throw new WorkspaceError("locked", `${id} is locked`);
  }
}

export function setVisible(layout: Layout, id: string, visible: boolean): Layout {
  findNode(layout, id);
  const tree = layout.tree.map((node) => (node.id === id ? { ...node, visible } : node));
  return commit(layout, tree);
}

export function setLocked(layout: Layout, id: string, locked: boolean): Layout {
  findNode(layout, id);
  const tree = layout.tree.map((node) => (node.id === id ? { ...node, locked } : node));
  return commit(layout, tree);
}

export function renameNode(layout: Layout, id: string, name: string): Layout {
  assertEditable(layout, id);
  const tree = layout.tree.map((node) => (node.id === id ? { ...node, name } : node));
  return commit(layout, tree);
}

export function reorderNode(layout: Layout, id: string, index: number): Layout {
  assertEditable(layout, id);
  const node = findNode(layout, id);
  if (!Number.isInteger(index)) {
    throw new WorkspaceError("invalid_argument", "index must be a whole number");
  }
  const siblings = layout.tree
    .filter((entry) => entry.parentId === node.parentId)
    .sort((left, right) => left.index - right.index);
  const from = siblings.findIndex((entry) => entry.id === id);
  const next = siblings.filter((entry) => entry.id !== id);
  const target = Math.max(0, Math.min(index, next.length));
  next.splice(target, 0, siblings[from] ?? node);
  const order = new Map(next.map((entry, position) => [entry.id, position]));
  const tree = layout.tree.map((entry) =>
    order.has(entry.id) ? { ...entry, index: order.get(entry.id) ?? entry.index } : entry,
  );
  return commit(layout, tree);
}

export function groupNodes(
  layout: Layout,
  ids: string[],
  group: { id: string; name: string },
): Layout {
  if (ids.length < 2) {
    throw new WorkspaceError("invalid_argument", "a group needs at least two objects");
  }
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw new WorkspaceError("invalid_argument", "group ids must be unique");
  }
  const nodes = unique.map((id) => findNode(layout, id));
  for (const node of nodes) {
    assertEditable(layout, node.id);
    if (node.kind === "pane") {
      throw new WorkspaceError("invalid_argument", "panes are not grouped");
    }
  }
  const parentId = nodes[0]?.parentId ?? null;
  if (nodes.some((node) => node.parentId !== parentId)) {
    throw new WorkspaceError("invalid_argument", "grouped objects must share a parent");
  }
  if (layout.tree.some((node) => node.id === group.id)) {
    throw new WorkspaceError("invalid_argument", "group id is already used");
  }
  const siblings = layout.tree
    .filter((node) => node.parentId === parentId)
    .sort((left, right) => left.index - right.index);
  const insertAt = Math.min(...nodes.map((node) => node.index));
  const groupNode: TreeNode = {
    id: group.id,
    kind: "group",
    name: group.name,
    visible: true,
    locked: false,
    parentId,
    index: insertAt,
  };
  const memberIds = new Set(unique);
  let child = 0;
  const tree = layout.tree.map((node) => {
    if (!memberIds.has(node.id)) {
      return node;
    }
    const next: TreeNode = { ...node, parentId: group.id, index: child };
    child += 1;
    return next;
  });
  tree.push(groupNode);
  const reindexed = tree.map((node) => {
    if (node.parentId !== parentId || node.id === group.id) {
      return node;
    }
    if (node.index > insertAt) {
      return { ...node, index: node.index + 1 };
    }
    return node;
  });
  return commit(layout, reindexed);
}

function withoutEntities(layout: Layout, ids: Set<string>): Layout {
  return {
    ...layout,
    panes: layout.panes
      .filter((pane) => !ids.has(pane.id))
      .map((pane) => ({
        ...pane,
        studies: pane.studies.filter((study) => !ids.has(study.id)),
      })),
    drawings: layout.drawings.filter((drawing) => !ids.has(drawing.id)),
    strategies: layout.strategies.filter((strategy) => !ids.has(strategy.id)),
    tree: layout.tree.filter((node) => !ids.has(node.id)),
  };
}

export function deleteNode(layout: Layout, id: string): Layout {
  const node = findNode(layout, id);
  const ids = new Set(descendants(layout, id));
  for (const entry of ids) {
    if (effectiveLocked(layout, entry) && entry !== id) {
      throw new WorkspaceError("locked", `${entry} is locked`);
    }
  }
  assertEditable(layout, id);
  if (node.kind === "pane") {
    const panes = layout.panes.filter((pane) => !ids.has(pane.id));
    if (panes.length < 1) {
      throw new WorkspaceError("invalid_argument", "a layout keeps at least one pane");
    }
  }
  const next = withoutEntities(layout, ids);
  return commit(next, next.tree);
}

export interface TreeRow {
  node: TreeNode;
  depth: number;
}

export function treeRows(layout: Layout): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const children = layout.tree
      .filter((node) => node.parentId === parentId)
      .sort((left, right) => left.index - right.index);
    for (const node of children) {
      rows.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export function replaceStudySettings(
  layout: Layout,
  id: string,
  settings: StudySettings,
): Layout {
  assertEditable(layout, id);
  let found = false;
  const panes = layout.panes.map((pane) => ({
    ...pane,
    studies: pane.studies.map((study) => {
      if (study.id !== id) {
        return study;
      }
      found = true;
      return { ...study, settings: { ...settings } };
    }),
  }));
  if (!found) {
    throw new WorkspaceError("invalid_argument", `study ${id} is missing`);
  }
  return cloneLayout({ ...layout, panes });
}

export function replaceStudyStyles(
  layout: Layout,
  id: string,
  styles: Layout["panes"][number]["studies"][number]["styles"],
): Layout {
  assertEditable(layout, id);
  let found = false;
  const panes = layout.panes.map((pane) => ({
    ...pane,
    studies: pane.studies.map((study) => {
      if (study.id !== id) {
        return study;
      }
      found = true;
      return { ...study, styles };
    }),
  }));
  if (!found) {
    throw new WorkspaceError("invalid_argument", `study ${id} is missing`);
  }
  return cloneLayout({ ...layout, panes });
}

type StudySettings = Layout["panes"][number]["studies"][number]["settings"];

export function replaceStrategySettings(
  layout: Layout,
  id: string,
  settings: StudySettings,
): Layout {
  assertEditable(layout, id);
  let found = false;
  const strategies = layout.strategies.map((strategy) => {
    if (strategy.id !== id) {
      return strategy;
    }
    found = true;
    return { ...strategy, settings: { ...settings } };
  });
  if (!found) {
    throw new WorkspaceError("invalid_argument", `strategy ${id} is missing`);
  }
  return cloneLayout({ ...layout, strategies });
}

export function setPeriod(layout: Layout, period: string): Layout {
  return cloneLayout({ ...layout, period });
}

export function setCandleType(layout: Layout, candleType: Layout["candleType"]): Layout {
  return cloneLayout({ ...layout, candleType });
}

export function setPriceScale(layout: Layout, priceScale: Layout["priceScale"]): Layout {
  return cloneLayout({ ...layout, priceScale });
}

export function setCrosshairSync(layout: Layout, crosshairSync: boolean): Layout {
  return cloneLayout({ ...layout, crosshairSync });
}

export function setLayoutName(layout: Layout, name: string): Layout {
  return cloneLayout({ ...layout, name });
}
