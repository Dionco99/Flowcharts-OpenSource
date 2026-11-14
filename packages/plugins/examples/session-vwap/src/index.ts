// SPDX-License-Identifier: Apache-2.0

import {
  definePlugin,
  readParameters,
  type FlowchartPlugin,
  type Indicator,
  type ParameterSpec,
  type SessionClock,
  type SymbolView,
} from "../../../src/index.js";

const parameters: readonly ParameterSpec[] = [
  {
    key: "session",
    label: "Session",
    type: "select",
    default: "london",
    options: [
      { value: "asia", label: "Asia" },
      { value: "london", label: "London" },
      { value: "newyork", label: "New York" },
      { value: "day", label: "Day" },
    ],
  },
];

/**
 * Session VWAP on decimal-string prices.
 * Typical price is (high + low + close) / 3. A session with no volume weights
 * each bar equally. Outside the session the plot is a gap.
 */
export const sessionVwap: Indicator = {
  id: "example.session-vwap",
  name: "Session VWAP",
  description: "Volume-weighted average price anchored at the session open.",
  overlay: true,
  lookback: 1440,
  parameters,
  plots: [{ key: "vwap", title: "VWAP", style: "line", color: "#E6B450" }],
  calculate(input) {
    const resolved = readParameters(parameters, input.parameters);
    const mode = String(resolved.session);
    const bars = input.window.bars;
    const vwap: (string | null)[] = new Array<string | null>(bars.length).fill(null);
    const volumeBySession = new Map<string, boolean>();
    for (const bar of bars) {
      const key = anchorKey(bar.openTime, input.window.spec, mode);
      if (key === null) continue;
      if (bar.volume > 0) volumeBySession.set(key, true);
      else if (!volumeBySession.has(key)) volumeBySession.set(key, false);
    }
    let key: string | null = null;
    let numerator = 0n;
    let denominator = 0n;
    let weighted = false;
    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index];
      if (!bar) continue;
      const next = anchorKey(bar.openTime, input.window.spec, mode);
      if (next === null) {
        key = null;
        continue;
      }
      if (next !== key) {
        key = next;
        numerator = 0n;
        denominator = 0n;
        weighted = volumeBySession.get(next) === true;
      }
      const weight = BigInt(weighted ? bar.volume : 1);
      if (weight <= 0n) continue;
      const typicalTimesThree = parseDecimal(bar.high) + parseDecimal(bar.low) + parseDecimal(bar.close);
      numerator += typicalTimesThree * weight;
      denominator += 3n * weight;
      vwap[index] = formatDecimal(numerator / denominator);
    }
    return { plots: { vwap } };
  },
};

export const sessionVwapPlugin: FlowchartPlugin = definePlugin({
  id: "example.session-vwap",
  name: "Session VWAP",
  version: "1.0.0",
  apiVersion: 1,
  license: "Apache-2.0",
  description: "Session-anchored VWAP on the Flowchart indicator contract.",
  indicators: [sessionVwap],
});

const SCALE = 12n;

function parseDecimal(value: string): bigint {
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole = "0", frac = ""] = raw.split(".");
  const digits = `${whole}${frac.padEnd(Number(SCALE), "0").slice(0, Number(SCALE))}`;
  const scaled = BigInt(digits);
  return negative ? -scaled : scaled;
}

function formatDecimal(value: bigint): string {
  const negative = value < 0n;
  const abs = (negative ? -value : value).toString().padStart(Number(SCALE) + 1, "0");
  const whole = abs.slice(0, -Number(SCALE));
  const frac = abs.slice(-Number(SCALE)).replace(/0+$/, "");
  const text = frac.length > 0 ? `${whole}.${frac}` : whole;
  return negative ? `-${text}` : text;
}

function anchorKey(openTime: string, spec: SymbolView, mode: string): string | null {
  const instant = Date.parse(openTime);
  if (mode === "day") {
    const civil = zonedParts(instant, spec.timezone);
    return `${civil.year}-${civil.month}-${civil.day}`;
  }
  const session = spec.sessions.find((item) => item.id === mode);
  if (!session) return null;
  const active = activeSession(instant, spec.timezone, session);
  return active === null ? null : String(active);
}

function activeSession(instant: number, timeZone: string, session: SessionClock): number | null {
  const civil = zonedParts(instant, timeZone);
  const minute = civil.hour * 60 + civil.minute;
  const open = clockMinute(session.open);
  const close = clockMinute(session.close);
  const inside = open < close ? minute >= open && minute < close : minute >= open || minute < close;
  if (!inside) return null;
  const dayOffset = open > close && minute < close ? -1 : 0;
  return utcFromParts(addDays(civil, dayOffset), open, timeZone);
}

function clockMinute(clock: string): number {
  const [hour = "0", minute = "0"] = clock.split(":");
  return Number(hour) * 60 + Number(minute);
}

interface Civil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(utcMs: number, timeZone: string): Civil {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = format.formatToParts(new Date(utcMs));
  const read = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(read("hour"));
  let year = Number(read("year"));
  let month = Number(read("month"));
  let day = Number(read("day"));
  if (hour === 24) {
    hour = 0;
    const next = addDays({ year, month, day, hour: 0, minute: 0 }, 1);
    year = next.year;
    month = next.month;
    day = next.day;
  }
  return { year, month, day, hour, minute: Number(read("minute")) };
}

function addDays(civil: Civil, days: number): Civil {
  const shifted = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: civil.hour,
    minute: civil.minute,
  };
}

function utcFromParts(civil: Civil, minuteOfDay: number, timeZone: string): number {
  const desired = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
    0,
  );
  let utc = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zoned = zonedParts(utc, timeZone);
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, 0);
    const next = desired - (zonedAsUtc - utc);
    if (next === utc) break;
    utc = next;
  }
  return utc;
}
