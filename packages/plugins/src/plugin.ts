// SPDX-License-Identifier: Apache-2.0

import { FlowchartError } from "./errors.js";
import type { Indicator } from "./indicator.js";
import { validateParameterSpecs } from "./parameters.js";
import type { Strategy } from "./strategy.js";
import { API_VERSION } from "./version.js";

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const PLOT_KEY = /^[a-z][a-z0-9]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const PLOT_STYLES = new Set(["line", "histogram", "area", "circles", "columns"]);
const DECIMAL = /^-?\d+(\.\d+)?$/;

export interface FlowchartPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly apiVersion: typeof API_VERSION;
  readonly description?: string;
  readonly license?: string;
  readonly indicators?: readonly Indicator[];
  readonly strategies?: readonly Strategy[];
}

export function definePlugin(plugin: FlowchartPlugin): FlowchartPlugin {
  validatePlugin(plugin);
  return plugin;
}

export function validatePlugin(plugin: FlowchartPlugin): void {
  if (!isPluginId(plugin.id)) {
    throw new FlowchartError("invalid_plugin", `Plugin id ${plugin.id} must be lowercase and contain a dot.`);
  }
  if (plugin.name.trim() === "") {
    throw new FlowchartError("invalid_plugin", "Plugin name is required.");
  }
  if (!VERSION_PATTERN.test(plugin.version)) {
    throw new FlowchartError("invalid_plugin", `Plugin version ${plugin.version} must be major.minor.patch.`);
  }
  if ((plugin.apiVersion as number) !== API_VERSION) {
    throw new FlowchartError(
      "api_version",
      `Plugin ${plugin.id} declares API ${String(plugin.apiVersion)}, host supports ${API_VERSION}.`,
    );
  }
  const indicators = plugin.indicators ?? [];
  const strategies = plugin.strategies ?? [];
  if (indicators.length + strategies.length === 0) {
    throw new FlowchartError("invalid_plugin", `Plugin ${plugin.id} has no contributions.`);
  }
  const ids = new Set<string>();
  const claim = (id: string): void => {
    if (id !== plugin.id && !id.startsWith(`${plugin.id}.`)) {
      throw new FlowchartError("invalid_plugin", `Contribution ${id} must start with ${plugin.id}.`);
    }
    if (ids.has(id)) throw new FlowchartError("duplicate_id", `Duplicate contribution ${id}.`);
    ids.add(id);
  };
  for (const indicator of indicators) {
    claim(indicator.id);
    if (indicator.name.trim() === "") throw new FlowchartError("invalid_plugin", `Indicator ${indicator.id} needs a name.`);
    if (typeof indicator.calculate !== "function") {
      throw new FlowchartError("invalid_plugin", `Indicator ${indicator.id} calculate must be a function.`);
    }
    if (indicator.lookback !== undefined && (!Number.isInteger(indicator.lookback) || indicator.lookback < 0)) {
      throw new FlowchartError("invalid_plugin", `Indicator ${indicator.id} lookback must be a non-negative integer.`);
    }
    validateParameterSpecs(indicator.parameters);
    if (indicator.plots.length === 0) throw new FlowchartError("invalid_plugin", `Indicator ${indicator.id} needs a plot.`);
    const plots = new Set<string>();
    for (const plot of indicator.plots) {
      if (!PLOT_KEY.test(plot.key)) throw new FlowchartError("invalid_plugin", `Plot key ${plot.key} must be lowercase.`);
      if (plots.has(plot.key)) throw new FlowchartError("invalid_plugin", `Duplicate plot ${plot.key}.`);
      plots.add(plot.key);
      if (plot.title.trim() === "") throw new FlowchartError("invalid_plugin", `Plot ${plot.key} needs a title.`);
      if (!PLOT_STYLES.has(plot.style)) throw new FlowchartError("invalid_plugin", `Plot ${plot.key} has an unknown style.`);
      if (plot.color !== undefined && !COLOR_PATTERN.test(plot.color)) {
        throw new FlowchartError("invalid_plugin", `Plot ${plot.key} color must be #RGB or #RRGGBB.`);
      }
    }
  }
  for (const strategy of strategies) {
    claim(strategy.id);
    if (strategy.name.trim() === "") throw new FlowchartError("invalid_plugin", `Strategy ${strategy.id} needs a name.`);
    if (typeof strategy.onBar !== "function") {
      throw new FlowchartError("invalid_plugin", `Strategy ${strategy.id} onBar must be a function.`);
    }
  }
}

export function isPluginId(id: string): boolean {
  return ID_PATTERN.test(id) && id.includes(".");
}

export function isPlotPrice(value: string): boolean {
  return DECIMAL.test(value);
}
