// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { WorkspaceError } from "./errors.js";
import { assertSealed } from "./window.js";
import type {
  BacktestResult,
  IndicatorHook,
  PlotStyle,
  SealedWindow,
  SettingField,
  SettingValue,
  StrategyHook,
} from "./types.js";

const KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function readSettings(
  fields: SettingField[],
  input: Record<string, unknown> | undefined,
): Record<string, SettingValue> {
  const source = input ?? {};
  const values: Record<string, SettingValue> = {};
  for (const field of fields) {
    if (!KEY.test(field.key)) {
      throw new WorkspaceError("invalid_settings", `bad setting key ${field.key}`);
    }
    const raw = Object.prototype.hasOwnProperty.call(source, field.key)
      ? source[field.key]
      : field.default;
    values[field.key] = readField(field, raw);
  }
  return values;
}

function readField(field: SettingField, raw: unknown): SettingValue {
  switch (field.type) {
    case "number":
    case "integer": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new WorkspaceError("invalid_settings", `${field.key} must be a number`);
      }
      if (field.type === "integer" && !Number.isInteger(raw)) {
        throw new WorkspaceError("invalid_settings", `${field.key} must be a whole number`);
      }
      if (field.min !== undefined && raw < field.min) {
        throw new WorkspaceError("invalid_settings", `${field.key} is below ${field.min}`);
      }
      if (field.max !== undefined && raw > field.max) {
        throw new WorkspaceError("invalid_settings", `${field.key} is above ${field.max}`);
      }
      return raw;
    }
    case "boolean":
      if (typeof raw !== "boolean") {
        throw new WorkspaceError("invalid_settings", `${field.key} must be a boolean`);
      }
      return raw;
    case "string":
      if (typeof raw !== "string") {
        throw new WorkspaceError("invalid_settings", `${field.key} must be a string`);
      }
      return raw;
    case "select":
      if (typeof raw !== "string" || !field.options.some((option) => option.value === raw)) {
        throw new WorkspaceError("invalid_settings", `${field.key} is not a listed choice`);
      }
      return raw;
    case "color":
      if (typeof raw !== "string" || !COLOR.test(raw)) {
        throw new WorkspaceError("invalid_settings", `${field.key} must be a #RGB or #RRGGBB color`);
      }
      return raw;
    default:
      throw new WorkspaceError("invalid_settings", "unknown setting type");
  }
}

export function assertStyle(style: PlotStyle, label: string): void {
  if (!COLOR.test(style.color)) {
    throw new WorkspaceError("invalid_settings", `${label} color must be #RGB or #RRGGBB`);
  }
  if (!Number.isInteger(style.lineWidth) || style.lineWidth < 1 || style.lineWidth > 8) {
    throw new WorkspaceError("invalid_settings", `${label} line width must be from 1 to 8`);
  }
  if (style.lineStyle !== "solid" && style.lineStyle !== "dashed" && style.lineStyle !== "dotted") {
    throw new WorkspaceError("invalid_settings", `${label} line style is invalid`);
  }
}

export function checkPlots(
  hook: IndicatorHook,
  bars: number,
  plots: Record<string, Array<number | null>>,
): void {
  for (const plot of hook.plots) {
    const series = plots[plot.key];
    if (!series || series.length !== bars) {
      throw new WorkspaceError("invalid_argument", `${hook.id} plot ${plot.key} must match the window`);
    }
    for (const value of series) {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new WorkspaceError("invalid_argument", `${hook.id} plot ${plot.key} has a non-finite value`);
      }
    }
  }
}

export class HookRegistry {
  private readonly indicators = new Map<string, IndicatorHook>();
  private readonly strategies = new Map<string, StrategyHook>();

  registerIndicator(hook: IndicatorHook): void {
    if (this.indicators.has(hook.id)) {
      throw new WorkspaceError("invalid_argument", `indicator ${hook.id} is already registered`);
    }
    this.indicators.set(hook.id, hook);
  }

  registerStrategy(hook: StrategyHook): void {
    if (this.strategies.has(hook.id)) {
      throw new WorkspaceError("invalid_argument", `strategy ${hook.id} is already registered`);
    }
    this.strategies.set(hook.id, hook);
  }

  indicator(id: string): IndicatorHook {
    const hook = this.indicators.get(id);
    if (!hook) {
      throw new WorkspaceError("unknown_hook", `indicator ${id} is not registered`);
    }
    return hook;
  }

  strategy(id: string): StrategyHook {
    const hook = this.strategies.get(id);
    if (!hook) {
      throw new WorkspaceError("unknown_hook", `strategy ${id} is not registered`);
    }
    return hook;
  }

  listIndicators(): IndicatorHook[] {
    return [...this.indicators.values()];
  }

  listStrategies(): StrategyHook[] {
    return [...this.strategies.values()];
  }
}

export function runIndicator(
  hook: IndicatorHook,
  window: SealedWindow,
  settings: Record<string, unknown> | undefined,
): { plots: Record<string, Array<number | null>> } {
  assertSealed(window);
  const read = readSettings(hook.settings, settings);
  const result = hook.calculate({ bars: window.bars, settings: read });
  checkPlots(hook, window.bars.length, result.plots);
  return result;
}

export function runBacktest(
  hook: StrategyHook,
  window: SealedWindow,
  settings: Record<string, unknown> | undefined,
): BacktestResult {
  assertSealed(window);
  const read = readSettings(hook.settings, settings);
  const result = hook.backtest({
    bars: window.bars,
    spec: window.spec,
    settings: read,
  });
  if (!Array.isArray(result.trades) || typeof result.summary?.tradeCount !== "number") {
    throw new WorkspaceError("invalid_argument", "backtest hook returned an incomplete result");
  }
  return result;
}
