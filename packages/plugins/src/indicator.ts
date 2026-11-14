// SPDX-License-Identifier: Apache-2.0

import type { ParameterSpec, Scalar } from "./parameters.js";
import type { Window } from "./window.js";

export type PlotStyle = "line" | "histogram" | "area" | "circles" | "columns";

export interface PlotSpec {
  readonly key: string;
  readonly title: string;
  readonly style: PlotStyle;
  readonly color?: string;
  readonly precision?: number;
}

/** Plot arrays line up with `window.bars`. A price is a decimal string. `null` is a gap. */
export interface IndicatorResult {
  readonly plots: Readonly<Record<string, readonly (string | null)[]>>;
}

export interface IndicatorInput {
  readonly window: Window;
  readonly parameters: Readonly<Record<string, Scalar>>;
}

/**
 * A pure function of the sealed window and its parameters.
 * It returns plots. It does not receive a broker port.
 */
export interface Indicator {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Drawn on the price pane when true, otherwise in its own pane. */
  readonly overlay: boolean;
  /** Minimum bars a host should pass. The study must still handle a shorter window. */
  readonly lookback?: number;
  readonly parameters: readonly ParameterSpec[];
  readonly plots: readonly PlotSpec[];
  calculate(input: IndicatorInput): IndicatorResult;
}
