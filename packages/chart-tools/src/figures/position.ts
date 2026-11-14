// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

export interface PositionPlan {
  side: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  risk: number;
  reward: number;
  /** Reward divided by risk. */
  r: number;
}

function finitePrice(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite price`);
  }
}

/** Long or short with entry, stop, target, and R. The stop and target must sit on the correct sides. */
export function positionPlan(
  side: "long" | "short",
  entry: number,
  stop: number,
  target: number,
): PositionPlan {
  finitePrice("entry", entry);
  finitePrice("stop", stop);
  finitePrice("target", target);
  if (side === "long") {
    if (!(stop < entry && entry < target)) {
      throw new Error("a long position needs the stop below the entry and the target above it");
    }
  } else if (side === "short") {
    if (!(target < entry && entry < stop)) {
      throw new Error("a short position needs the target below the entry and the stop above it");
    }
  } else {
    throw new Error(`unknown position side: ${String(side)}`);
  }
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  return { side, entry, stop, target, risk, reward, r: reward / risk };
}
