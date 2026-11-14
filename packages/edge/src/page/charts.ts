// SPDX-License-Identifier: Apache-2.0

import type { EdgeReport } from "../types.ts";

const SVG = "http://www.w3.org/2000/svg";
const INK = "#1c1916";
const MUTED = "#5c564c";
const LINE = "#e0d8cc";
const GREEN = "#0f6a40";
const RED = "#8d332b";
const SOFT = "#c4b8a6";

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function mount(label: string, width: number, height: number): SVGSVGElement {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": label,
  });
  const title = svgEl("title", {});
  title.textContent = label;
  svg.append(title);
  return svg;
}

function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const mantissa = rough / power;
  const nice = mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 5 ? 5 : 10;
  return nice * power;
}

function ticks(min: number, max: number, target: number): number[] {
  if (!(max > min)) return [min];
  const step = niceStep((max - min) / Math.max(1, target));
  const start = Math.ceil((min - step * 1e-9) / step) * step;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    const value = Number((start + i * step).toPrecision(12));
    if (value > max + step * 1e-6) break;
    if (value >= min - step * 1e-6) out.push(value);
  }
  return out.length > 0 ? out : [min, max];
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value).toString();
  if (abs >= 10) return (Math.round(value * 10) / 10).toString();
  return (Math.round(value * 100) / 100).toString();
}

export function histogramChart(report: EdgeReport): SVGSVGElement {
  const width = 520;
  const height = 280;
  const pad = { l: 44, r: 12, t: 22, b: 36 };
  const svg = mount(
    `Distribution of the result after ${report.horizon} trades`,
    width,
    height,
  );
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const bins = report.histogram;
  let x0 = bins[0]?.start ?? report.expectedR;
  let x1 = bins[bins.length - 1]?.end ?? report.expectedR;
  if (!(x1 > x0)) {
    x0 -= 1;
    x1 += 1;
  }
  x0 = Math.min(x0, report.expectedR);
  x1 = Math.max(x1, report.expectedR);
  const yMax = Math.max(...bins.map((bin) => bin.probability), 0) * 1.12 || 1;
  const xMap = (value: number) => pad.l + ((value - x0) / (x1 - x0)) * plotW;
  const yMap = (value: number) => pad.t + (1 - value / yMax) * plotH;
  const baseline = yMap(0);

  for (const tick of ticks(0, yMax, 3)) {
    if (tick < 0 || tick > yMax) continue;
    const y = yMap(tick);
    svg.append(
      svgEl("line", {
        x1: String(pad.l),
        x2: String(width - pad.r),
        y1: String(y),
        y2: String(y),
        stroke: LINE,
      }),
    );
    const label = svgEl("text", {
      x: String(pad.l - 6),
      y: String(y + 4),
      "text-anchor": "end",
      fill: MUTED,
      "font-size": "11",
    });
    label.textContent = `${Math.round(tick * 100)}%`;
    svg.append(label);
  }

  const single = bins.length === 1 && bins[0]!.start === bins[0]!.end;
  for (const bin of bins) {
    if (bin.probability <= 0) continue;
    const mid = (bin.start + bin.end) / 2;
    const x = single ? xMap(report.expectedR) - 18 : xMap(bin.start);
    const barW = single ? 36 : Math.max(1, xMap(bin.end) - xMap(bin.start) - 1);
    const y = yMap(bin.probability);
    svg.append(
      svgEl("rect", {
        x: String(x),
        y: String(y),
        width: String(barW),
        height: String(Math.max(0, baseline - y)),
        fill: mid < 0 ? RED : GREEN,
      }),
    );
  }

  if (x0 < 0 && x1 > 0) {
    const zero = xMap(0);
    svg.append(
      svgEl("line", {
        x1: String(zero),
        x2: String(zero),
        y1: String(pad.t),
        y2: String(baseline),
        stroke: MUTED,
        "stroke-dasharray": "3 3",
      }),
    );
  }

  const expectedX = xMap(report.expectedR);
  svg.append(
    svgEl("line", {
      x1: String(expectedX),
      x2: String(expectedX),
      y1: String(pad.t),
      y2: String(baseline),
      stroke: INK,
      "stroke-width": "1.5",
    }),
  );
  const expectedLabel = svgEl("text", {
    x: String(Math.min(width - pad.r, Math.max(pad.l, expectedX))),
    y: "14",
    "text-anchor": expectedX > width - 90 ? "end" : "start",
    fill: INK,
    "font-size": "11",
  });
  expectedLabel.textContent = "expected";
  svg.append(expectedLabel);

  for (const tick of ticks(x0, x1, 4)) {
    const label = svgEl("text", {
      x: String(xMap(tick)),
      y: String(height - 14),
      "text-anchor": "middle",
      fill: MUTED,
      "font-size": "11",
    });
    label.textContent = formatTick(tick);
    svg.append(label);
  }

  svg.append(
    svgEl("line", {
      x1: String(pad.l),
      x2: String(width - pad.r),
      y1: String(baseline),
      y2: String(baseline),
      stroke: INK,
    }),
  );
  return svg;
}

export function streakChart(report: EdgeReport): SVGSVGElement {
  const width = 520;
  const height = 280;
  const pad = { l: 44, r: 12, t: 16, b: 36 };
  const svg = mount(
    `Chance of a losing streak at least this long in ${report.horizon} trades`,
    width,
    height,
  );
  const rows = report.streaks;
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const first = rows[0]?.length ?? 1;
  const last = rows[rows.length - 1]?.length ?? first;
  const x0 = first - 0.6;
  const x1 = last + 0.6;
  const xMap = (length: number) => pad.l + ((length - x0) / (x1 - x0)) * plotW;
  const yMap = (probability: number) => pad.t + (1 - probability) * plotH;
  const baseline = yMap(0);
  const slot = rows.length > 1 ? (xMap(rows[1]!.length) - xMap(rows[0]!.length)) * 0.72 : 28;
  const stride = rows.length > 16 ? Math.ceil(rows.length / 12) : 1;

  for (const tick of [0, 0.5, 1]) {
    const y = yMap(tick);
    svg.append(
      svgEl("line", {
        x1: String(pad.l),
        x2: String(width - pad.r),
        y1: String(y),
        y2: String(y),
        stroke: tick === 0 ? INK : LINE,
      }),
    );
    const label = svgEl("text", {
      x: String(pad.l - 6),
      y: String(y + 4),
      "text-anchor": "end",
      fill: MUTED,
      "font-size": "11",
    });
    label.textContent = `${Math.round(tick * 100)}%`;
    svg.append(label);
  }

  rows.forEach((row, index) => {
    const x = xMap(row.length) - slot / 2;
    const y = yMap(row.probability);
    const typical = row.length === report.typicalStreak;
    svg.append(
      svgEl("rect", {
        x: String(x),
        y: String(y),
        width: String(Math.max(2, slot)),
        height: String(Math.max(0, baseline - y)),
        fill: typical ? INK : SOFT,
      }),
    );
    const showLabel = typical || index === 0 || index === rows.length - 1 || index % stride === 0;
    if (!showLabel) return;
    const label = svgEl("text", {
      x: String(xMap(row.length)),
      y: String(height - 14),
      "text-anchor": "middle",
      fill: typical ? INK : MUTED,
      "font-size": "11",
    });
    label.textContent = String(row.length);
    svg.append(label);
  });
  return svg;
}

export function pathChart(report: EdgeReport): SVGSVGElement {
  const width = 520;
  const height = 280;
  const pad = { l: 48, r: 12, t: 12, b: 32 };
  const svg = mount(`Account paths over ${report.horizon} trades, in R`, width, height);
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  let y0 = Infinity;
  let y1 = -Infinity;
  const consider = (value: number) => {
    if (value < y0) y0 = value;
    if (value > y1) y1 = value;
  };
  for (const path of report.chartPaths) for (const value of path) consider(value);
  for (const value of report.expectedEquity) consider(value);
  if (!Number.isFinite(y0) || !Number.isFinite(y1) || y0 === y1) {
    y0 = (Number.isFinite(y0) ? y0 : report.startingR) - 1;
    y1 = y0 + 2;
  }
  const room = (y1 - y0) * 0.08;
  y0 -= room;
  y1 += room;
  const showRuin = report.ruinAt >= y0 && report.ruinAt <= y1;
  const xMap = (trade: number) => pad.l + (trade / report.horizon) * plotW;
  const yMap = (value: number) => pad.t + ((y1 - value) / (y1 - y0)) * plotH;

  for (const tick of ticks(y0, y1, 4)) {
    const y = yMap(tick);
    svg.append(
      svgEl("line", {
        x1: String(pad.l),
        x2: String(width - pad.r),
        y1: String(y),
        y2: String(y),
        stroke: LINE,
      }),
    );
    const label = svgEl("text", {
      x: String(pad.l - 6),
      y: String(y + 4),
      "text-anchor": "end",
      fill: MUTED,
      "font-size": "11",
    });
    label.textContent = formatTick(tick);
    svg.append(label);
  }

  for (const path of report.chartPaths) {
    const coords = path
      .map((value, trade) => `${xMap(trade).toFixed(1)},${yMap(value).toFixed(1)}`)
      .join(" ");
    svg.append(
      svgEl("polyline", {
        points: coords,
        fill: "none",
        stroke: MUTED,
        "stroke-width": "1.25",
        opacity: "0.45",
      }),
    );
  }

  const expected = report.expectedEquity
    .map((value, trade) => `${xMap(trade).toFixed(1)},${yMap(value).toFixed(1)}`)
    .join(" ");
  svg.append(
    svgEl("polyline", {
      points: expected,
      fill: "none",
      stroke: INK,
      "stroke-width": "2",
    }),
  );

  if (showRuin) {
    const y = yMap(report.ruinAt);
    svg.append(
      svgEl("line", {
        x1: String(pad.l),
        x2: String(width - pad.r),
        y1: String(y),
        y2: String(y),
        stroke: RED,
        "stroke-dasharray": "4 3",
      }),
    );
  }

  for (const trade of [0, Math.round(report.horizon / 2), report.horizon]) {
    const label = svgEl("text", {
      x: String(xMap(trade)),
      y: String(height - 10),
      "text-anchor": trade === 0 ? "start" : trade === report.horizon ? "end" : "middle",
      fill: MUTED,
      "font-size": "11",
    });
    label.textContent = String(trade);
    svg.append(label);
  }
  return svg;
}

export function drawdownChart(report: EdgeReport): SVGSVGElement {
  const width = 520;
  const height = 220;
  const svg = mount("Worst drawdown across repetitions, in R", width, height);
  const rows = [
    { label: "50%", value: report.maxDrawdownR.p50, emphasis: false },
    { label: "75%", value: report.maxDrawdownR.p75, emphasis: false },
    { label: "90%", value: report.maxDrawdownR.p90, emphasis: true },
    { label: "95%", value: report.maxDrawdownR.p95, emphasis: false },
  ];
  const max = Math.max(report.maxDrawdownR.p95, 1e-9);
  const labelW = 44;
  const valueW = 72;
  const left = 16 + labelW;
  const right = width - 16 - valueW;
  const barW = right - left;
  const top = 18;
  const rowH = 42;

  rows.forEach((row, index) => {
    const y = top + index * rowH;
    const name = svgEl("text", {
      x: "16",
      y: String(y + 16),
      fill: row.emphasis ? INK : MUTED,
      "font-size": "13",
    });
    name.textContent = row.label;
    svg.append(name);
    svg.append(
      svgEl("rect", {
        x: String(left),
        y: String(y),
        width: String(barW),
        height: "22",
        fill: "#f3f0e8",
      }),
    );
    const span = Math.max(0, Math.min(barW, (row.value / (max * 1.05)) * barW));
    svg.append(
      svgEl("rect", {
        x: String(left),
        y: String(y),
        width: String(span),
        height: "22",
        fill: row.emphasis ? INK : GREEN,
      }),
    );
    const value = svgEl("text", {
      x: String(right + 8),
      y: String(y + 16),
      fill: INK,
      "font-size": "13",
    });
    value.textContent = `${(Math.round(row.value * 100) / 100).toFixed(2)}R`;
    svg.append(value);
  });
  return svg;
}
