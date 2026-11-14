// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { ReplayClock } from "./playback";
import { ReplayError } from "./errors";

export interface KeyInput {
  key: string;
  code?: string;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export type ReplayCommand = "step" | "stepBack" | "pause" | "play";

export interface KeyResult {
  handled: boolean;
  command: ReplayCommand | null;
  ok: boolean;
  code?: string;
}

/**
 * ArrowRight steps one trading bar. ArrowLeft steps back.
 * Space pauses while playing, and plays while paused.
 * Modified chords are left for the browser.
 */
export function applyReplayKey(clock: ReplayClock, input: KeyInput): KeyResult {
  const command = commandForKey(input, clock.status);
  if (!command) return { handled: false, command: null, ok: true };
  try {
    if (command === "step") clock.step(1);
    else if (command === "stepBack") clock.step(-1);
    else if (command === "pause") clock.pause();
    else clock.play();
    return { handled: true, command, ok: true };
  } catch (error) {
    if (error instanceof ReplayError) {
      return { handled: true, command, ok: false, code: error.code };
    }
    throw error;
  }
}

function commandForKey(input: KeyInput, status: "paused" | "playing"): ReplayCommand | null {
  if (input.altKey || input.ctrlKey || input.metaKey) return null;
  if (input.key === "ArrowRight") return "step";
  if (input.key === "ArrowLeft") return "stepBack";
  const space = input.key === " " || input.key === "Spacebar" || input.code === "Space";
  if (!space || input.repeat) return null;
  return status === "playing" ? "pause" : "play";
}
