// SPDX-License-Identifier: Apache-2.0

import { fxDayStart } from "@flowchart/bars";
import type { IndicatorPackage } from "../../study";

export const study: IndicatorPackage = {
  id: "session-hl",
  name: "Session high / low",
  params: [],
  series: [
    { key: "high", title: "SH", color: "#8fb4d4" },
    { key: "low", title: "SL", color: "#8fb4d4", dashed: true },
  ],
  compute(window) {
    const high = new Array<number | null>(window.bars.length).fill(null);
    const low = new Array<number | null>(window.bars.length).fill(null);
    let day = Number.NaN;
    let hi = 0;
    let lo = 0;
    window.bars.forEach((bar, index) => {
      const start = fxDayStart(bar.t, window.spec.dayRollUtcMinute);
      if (start !== day) {
        day = start;
        hi = Number(bar.h);
        lo = Number(bar.l);
      } else {
        if (Number(bar.h) > hi) hi = Number(bar.h);
        if (Number(bar.l) < lo) lo = Number(bar.l);
      }
      high[index] = hi;
      low[index] = lo;
    });
    return { high, low };
  },
};
