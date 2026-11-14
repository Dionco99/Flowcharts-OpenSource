// SPDX-License-Identifier: Apache-2.0

import type { MarketWindow } from "@flowchart/bars";

export type IndicatorParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

export type IndicatorSeries = {
  key: string;
  title: string;
  color: string;
  dashed?: boolean;
};

/** Pure function of the window. It returns plots and cannot place orders. */
export type IndicatorPackage = {
  id: string;
  name: string;
  params: IndicatorParam[];
  series: IndicatorSeries[];
  compute(window: MarketWindow, params: Record<string, number>): Record<string, Array<number | null>>;
};
