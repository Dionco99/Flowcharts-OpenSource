// SPDX-License-Identifier: Apache-2.0

import { roundPrice, type MarketWindow, type SymbolSpec } from "@flowchart/bars";
import type { BrokerPort } from "@flowchart/orders";

const FAST = 9;
const SLOW = 21;
const LOTS = 0.1;
const STOP_PIPS = 15;
const TARGET_PIPS = 30;

/**
 * EMA cross. Orders go out only through the broker port.
 * The running average is the indicatorts `seed: "sma"` recurrence
 * (k = 2 / (period + 1) after the first period's simple average).
 */
export function createSampleStrategy(spec: SymbolSpec) {
  let fast = Number.NaN;
  let slow = Number.NaN;
  let fastSum = 0;
  let slowSum = 0;
  let count = 0;
  let prevDiff = 0;
  let primed = false;

  const kFast = 2 / (FAST + 1);
  const kSlow = 2 / (SLOW + 1);

  function reset() {
    fast = Number.NaN;
    slow = Number.NaN;
    fastSum = 0;
    slowSum = 0;
    count = 0;
    prevDiff = 0;
    primed = false;
  }

  function push(close: number) {
    count += 1;
    if (count <= FAST) {
      fastSum += close;
      if (count === FAST) fast = fastSum / FAST;
    } else {
      fast = close * kFast + fast * (1 - kFast);
    }
    if (count <= SLOW) {
      slowSum += close;
      if (count === SLOW) slow = slowSum / SLOW;
    } else {
      slow = close * kSlow + slow * (1 - kSlow);
    }
  }

  function onBar(window: MarketWindow, port: BrokerPort) {
    const bars = window.bars;
    if (bars.length !== count + 1) {
      reset();
      for (const bar of bars) push(Number(bar.c));
      if (Number.isFinite(fast) && Number.isFinite(slow)) {
        prevDiff = fast - slow;
        primed = true;
      }
      return;
    }
    const close = Number(bars[bars.length - 1].c);
    push(close);
    if (!Number.isFinite(fast) || !Number.isFinite(slow)) return;
    const diff = fast - slow;
    if (primed) {
      if (prevDiff <= 0 && diff > 0) enter("buy", close, port);
      else if (prevDiff >= 0 && diff < 0) enter("sell", close, port);
    }
    prevDiff = diff;
    primed = true;
  }

  function enter(side: "buy" | "sell", close: number, port: BrokerPort) {
    const openLots = Number(port.snapshot().position.lots);
    if ((side === "buy" && openLots < 0) || (side === "sell" && openLots > 0)) port.close();
    if (Number(port.snapshot().position.lots) !== 0) return;
    const stopDist = STOP_PIPS * Number(spec.pipSize);
    const targetDist = TARGET_PIPS * Number(spec.pipSize);
    const level = (value: number) => roundPrice(value.toFixed(spec.pricePrecision), spec.tickSize);
    port.place({
      side,
      type: "market",
      lots: LOTS.toFixed(2),
      stopLoss: level(side === "buy" ? close - stopDist : close + stopDist),
      takeProfit: level(side === "buy" ? close + targetDist : close - targetDist),
    });
  }

  return { reset, onBar, snapshot: () => ({ fast, slow, count }) };
}
