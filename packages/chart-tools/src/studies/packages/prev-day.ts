// SPDX-License-Identifier: Apache-2.0

import { fxDayStart } from "@flowchart/bars";
import type { IndicatorPackage } from "../../study";

export const study: IndicatorPackage = {
  id: "prev-day",
  name: "Previous day high / low",
  params: [],
  series: [
    { key: "pdh", title: "PDH", color: "#e7a094" },
    { key: "pdl", title: "PDL", color: "#8fd0b0", dashed: true },
  ],
  compute(window) {
    const pdh = new Array<number | null>(window.bars.length).fill(null);
    const pdl = new Array<number | null>(window.bars.length).fill(null);
    let day = Number.NaN;
    let hi = 0;
    let lo = 0;
    let prevHi: number | null = null;
    let prevLo: number | null = null;
    let started = false;
    window.bars.forEach((bar, index) => {
      const start = fxDayStart(bar.t, window.spec.dayRollUtcMinute);
      if (!started) {
        day = start;
        hi = Number(bar.h);
        lo = Number(bar.l);
        started = true;
      } else if (start !== day) {
        prevHi = hi;
        prevLo = lo;
        day = start;
        hi = Number(bar.h);
        lo = Number(bar.l);
      } else {
        if (Number(bar.h) > hi) hi = Number(bar.h);
        if (Number(bar.l) < lo) lo = Number(bar.l);
      }
      pdh[index] = prevHi;
      pdl[index] = prevLo;
    });
    return { pdh, pdl };
  },
};
