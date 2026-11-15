// SPDX-License-Identifier: Apache-2.0

import { TF_MS, type Timeframe } from "@flowchart/bars";
import { ReplayError, ReplaySession, applyReplayKey, type KeyInput, type KeyResult } from "@flowchart/replay";

export function timeframeMinutes(timeframe: Timeframe): number {
  return TF_MS[timeframe] / 60_000;
}

export function openTransport(input: {
  symbol: string;
  firstClose: number;
  lastClose: number;
  cursor: number;
  timeframe: Timeframe;
  speed: number;
  timeZone: string;
}): ReplaySession {
  const cursor = Math.min(input.lastClose, Math.max(input.firstClose, input.cursor));
  return new ReplaySession({
    symbol: input.symbol,
    tape: { firstClose: input.firstClose, lastClose: input.lastClose },
    cursor,
    timeframeMinutes: timeframeMinutes(input.timeframe),
    speed: input.speed,
    timeZone: input.timeZone,
  });
}

/** Pause, then move one trading bar. A step past the tape leaves the cursor where it is. */
export function stepTransport(session: ReplaySession, direction: 1 | -1): boolean {
  session.clock.pause();
  try {
    session.clock.step(direction);
    return true;
  } catch (error) {
    if (error instanceof ReplayError) return false;
    throw error;
  }
}

export function seekTransport(session: ReplaySession, timestamp: number): boolean {
  try {
    session.clock.seek(timestamp);
    return true;
  } catch (error) {
    if (error instanceof ReplayError) return false;
    throw error;
  }
}

/** Next session open in the viewer's timezone. Null when none remains on the tape. */
export function jumpTransport(session: ReplaySession): string | null {
  try {
    return session.clock.nextSession().name;
  } catch (error) {
    if (error instanceof ReplayError) return null;
    throw error;
  }
}

export function retargetTransport(session: ReplaySession, timeframe: Timeframe, timeZone: string, keepPlaying: boolean): void {
  const clock = session.clock;
  clock.restore(clock.cursor, timeframeMinutes(timeframe), clock.speed, timeZone);
  if (keepPlaying) clock.play();
}

export function keyTransport(session: ReplaySession, input: KeyInput): KeyResult {
  return applyReplayKey(session.clock, input);
}
