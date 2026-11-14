// SPDX-License-Identifier: Apache-2.0

/**
 * Synthetic replay trades for the dashboard and tests.
 * Prices are a seeded walk around 1.10. This is not a market recording,
 * and the package does not bundle historical bars.
 */

import type { ExitKind, Side, TradePlan } from "./types.js";

const SESSIONS = ["Asia", "London", "New York"] as const;
const SETUPS = ["Breakout", "Continuation", "Range fade", "Reversal"] as const;
const REWARD_CHOICES = [1.5, 2, 2, 2.5, 3] as const;

export function createFixture(seed = 20261114, count = 80): TradePlan[] {
  const random = mulberry32(seed);
  const plans: TradePlan[] = [];
  let mid = 1.1;
  let day = Date.UTC(2026, 0, 5);
  let sequence = 0;

  while (plans.length < count) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      day += 86_400_000;
      continue;
    }
    const tradesToday = random() < 0.45 ? 2 : 1;
    for (let slot = 0; slot < tradesToday && plans.length < count; slot += 1) {
      const session = SESSIONS[Math.floor(random() * SESSIONS.length)] ?? "London";
      const hour =
        session === "Asia"
          ? 1 + Math.floor(random() * 6)
          : session === "London"
            ? 7 + Math.floor(random() * 5)
            : 13 + Math.floor(random() * 7);
      const minute = Math.floor(random() * 12) * 5;
      mid = clamp(roundTick(mid + (random() - 0.48) * 0.004), 1.02, 1.25);
      const side: Side = random() < 0.5 ? "long" : "short";
      const stopDistance = (10 + Math.floor(random() * 21)) / 10_000;
      const reward = REWARD_CHOICES[Math.floor(random() * REWARD_CHOICES.length)] ?? 2;
      const entry = mid;
      const stopLoss = quote(side === "long" ? entry - stopDistance : entry + stopDistance, entry, side, "stop");
      const takeProfit = quote(
        side === "long" ? entry + reward * Math.abs(entry - stopLoss) : entry - reward * Math.abs(entry - stopLoss),
        entry,
        side,
        "target",
      );
      const roll = random();
      let exit: ExitKind;
      let exitPrice: number | undefined;
      if (roll < 0.42) {
        exit = "target";
      } else if (roll < 0.84) {
        exit = "stop";
      } else {
        exit = "manual";
        const fraction = -0.4 + random() * 1.8;
        const distance = Math.abs(entry - stopLoss);
        exitPrice = quote(
          side === "long" ? entry + fraction * distance : entry - fraction * distance,
          entry,
          side,
          "either",
        );
      }
      sequence += 1;
      const openedAt = new Date(day);
      openedAt.setUTCHours(hour, minute, 0, 0);
      plans.push({
        id: `T${String(sequence).padStart(3, "0")}`,
        side,
        entry,
        stopLoss,
        takeProfit,
        openedAt: openedAt.toISOString(),
        session,
        setup: SETUPS[Math.floor(random() * SETUPS.length)] ?? "Breakout",
        exit,
        exitPrice,
      });
    }
    day += 86_400_000;
  }
  return plans;
}

function quote(
  price: number,
  entry: number,
  side: Side,
  role: "stop" | "target" | "either",
): number {
  let quoted = roundTick(price);
  const tick = 0.00001;
  if (role === "stop") {
    if (side === "long" && quoted >= entry) quoted = roundTick(entry - tick);
    if (side === "short" && quoted <= entry) quoted = roundTick(entry + tick);
  } else if (role === "target") {
    if (side === "long" && quoted <= entry) quoted = roundTick(entry + tick);
    if (side === "short" && quoted >= entry) quoted = roundTick(entry - tick);
  } else if (quoted <= 0) {
    quoted = tick;
  }
  return quoted;
}

function roundTick(price: number): number {
  return Math.round(price * 100_000) / 100_000;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
