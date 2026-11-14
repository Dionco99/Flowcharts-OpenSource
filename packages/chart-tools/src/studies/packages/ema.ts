// SPDX-License-Identifier: Apache-2.0

import { ema } from "indicatorts";
import type { IndicatorPackage } from "../../study";

export const study: IndicatorPackage = {
  id: "ema",
  name: "EMA",
  params: [{ key: "length", label: "Length", min: 2, max: 200, step: 1, default: 20 }],
  series: [{ key: "ema", title: "EMA", color: "#e4a85c" }],
  compute(window, params) {
    const length = Math.max(2, Math.round(params.length ?? 20));
    const values = ema(
      window.bars.map((bar) => Number(bar.c)),
      { period: length, seed: "sma" },
    );
    return { ema: values.map((value) => (Number.isFinite(value) ? value : null)) };
  },
};
