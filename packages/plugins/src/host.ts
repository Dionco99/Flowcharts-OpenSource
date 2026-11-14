// SPDX-License-Identifier: Apache-2.0

import { FlowchartError } from "./errors.js";
import type { Indicator, IndicatorResult } from "./indicator.js";
import { readParameters } from "./parameters.js";
import { isPlotPrice, validatePlugin, type FlowchartPlugin } from "./plugin.js";
import type { Strategy } from "./strategy.js";
import { assertSealed, assertSymbolView, type Window } from "./window.js";

/**
 * In-process registry. v1 does not sandbox a plugin: install one the way you
 * would depend on any other library. An indicator still has no broker port.
 */
export class PluginHost {
  private readonly plugins = new Map<string, FlowchartPlugin>();
  private readonly indicators = new Map<string, Indicator>();
  private readonly strategies = new Map<string, Strategy>();

  register(plugin: FlowchartPlugin): void {
    validatePlugin(plugin);
    if (this.plugins.has(plugin.id)) {
      throw new FlowchartError("duplicate_id", `Plugin ${plugin.id} is already registered.`);
    }
    for (const indicator of plugin.indicators ?? []) this.ensureFree(indicator.id);
    for (const strategy of plugin.strategies ?? []) this.ensureFree(strategy.id);
    this.plugins.set(plugin.id, plugin);
    for (const indicator of plugin.indicators ?? []) this.indicators.set(indicator.id, indicator);
    for (const strategy of plugin.strategies ?? []) this.strategies.set(strategy.id, strategy);
  }

  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new FlowchartError("unknown_plugin", `Plugin ${pluginId} is not registered.`);
    for (const indicator of plugin.indicators ?? []) this.indicators.delete(indicator.id);
    for (const strategy of plugin.strategies ?? []) this.strategies.delete(strategy.id);
    this.plugins.delete(pluginId);
  }

  list(): readonly FlowchartPlugin[] {
    return [...this.plugins.values()];
  }

  getIndicator(id: string): Indicator {
    const found = this.indicators.get(id);
    if (!found) throw new FlowchartError("unknown_plugin", `Indicator ${id} is not registered.`);
    return found;
  }

  getStrategy(id: string): Strategy {
    const found = this.strategies.get(id);
    if (!found) throw new FlowchartError("unknown_plugin", `Strategy ${id} is not registered.`);
    return found;
  }

  /**
   * Run an indicator on a sealed window. A bar that closes after the cursor
   * throws `window_leak` and the study is not called.
   */
  runIndicator(id: string, window: Window, parameters?: Readonly<Record<string, unknown>>): IndicatorResult {
    const indicator = this.getIndicator(id);
    assertSymbolView(window.spec);
    assertSealed(window);
    const resolved = readParameters(indicator.parameters, parameters);
    const result = indicator.calculate({ window, parameters: resolved });
    assertResult(indicator, window, result);
    return result;
  }

  private ensureFree(id: string): void {
    if (this.indicators.has(id) || this.strategies.has(id)) {
      throw new FlowchartError("duplicate_id", `Contribution ${id} is already registered.`);
    }
  }
}

function assertResult(indicator: Indicator, window: Window, result: IndicatorResult): void {
  for (const plot of indicator.plots) {
    const values = result.plots[plot.key];
    if (!values) {
      throw new FlowchartError("indicator_result", `Indicator ${indicator.id} omitted plot ${plot.key}.`);
    }
    if (values.length !== window.bars.length) {
      throw new FlowchartError(
        "indicator_result",
        `Indicator ${indicator.id} plot ${plot.key} has ${values.length} points for ${window.bars.length} bars.`,
      );
    }
    for (const value of values) {
      if (value !== null && !isPlotPrice(value)) {
        throw new FlowchartError("indicator_result", `Indicator ${indicator.id} plot ${plot.key} must be a decimal string or null.`);
      }
    }
  }
}
