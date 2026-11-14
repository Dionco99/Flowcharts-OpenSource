// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { ReplayError } from "./errors";
import { addCalendarDays, assertTimeZone, weekdayOf, zonedParts, zonedTimeToUtc, type Weekday } from "./time";

/** Asia, London, and New York opens on the viewer's wall clock. */
export const FX_SESSION_OPENS: readonly SessionOpen[] = [
  { name: "Asia", openMinute: 0 },
  { name: "London", openMinute: 8 * 60 },
  { name: "New York", openMinute: 13 * 60 },
];

export const DEFAULT_TRADING_DAYS: readonly Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export interface TapeBounds {
  /** Close of the first supplied minute, inclusive, UTC milliseconds. */
  firstClose: number;
  /** Close of the last supplied minute, inclusive, UTC milliseconds. */
  lastClose: number;
}

export interface SessionOpen {
  name: string;
  /** Minutes after local midnight, from 0 through 1439. */
  openMinute: number;
}

export interface ReplayClockOptions {
  tape: TapeBounds;
  /** Trading timeframe in whole minutes. Step and play move one of these bars. */
  timeframeMinutes?: number;
  /** Starting cursor. Defaults to the first minute close. */
  cursor?: number;
  /** Trading bars revealed per second while playing. */
  speed?: number;
  /** IANA zone for the next session open. */
  timeZone?: string;
  sessions?: readonly SessionOpen[];
  tradingDays?: readonly Weekday[];
}

export interface SessionJump {
  cursor: number;
  name: string;
}

/**
 * One replay cursor. Pause, play, and speed reveal trading bars.
 * Step moves one bar of the trading timeframe. Seek stays inside the tape.
 * The bars package decides which candles that cursor may draw.
 */
export class ReplayClock {
  readonly tape: TapeBounds;
  private cursorMs: number;
  private minutes: number;
  private barsPerSecond: number;
  private zone: string;
  private sessionOpens: readonly SessionOpen[];
  private days: readonly Weekday[];
  private state: "paused" | "playing" = "paused";
  private bankedMs = 0;

  constructor(options: ReplayClockOptions) {
    this.tape = assertTape(options.tape);
    this.minutes = assertTimeframe(options.timeframeMinutes ?? 1);
    this.barsPerSecond = assertSpeed(options.speed ?? 1);
    this.zone = assertTimeZone(options.timeZone ?? "UTC");
    this.sessionOpens = assertSessions(options.sessions ?? FX_SESSION_OPENS);
    this.days = assertDays(options.tradingDays ?? DEFAULT_TRADING_DAYS);
    const cursor = options.cursor ?? this.tape.firstClose;
    assertInside(cursor, this.tape);
    this.cursorMs = cursor;
  }

  get cursor(): number {
    return this.cursorMs;
  }

  get status(): "paused" | "playing" {
    return this.state;
  }

  get speed(): number {
    return this.barsPerSecond;
  }

  get timeframeMinutes(): number {
    return this.minutes;
  }

  get timeZone(): string {
    return this.zone;
  }

  pause(): void {
    this.state = "paused";
    this.bankedMs = 0;
  }

  play(): void {
    if (this.nextForward() === null) {
      this.pause();
      return;
    }
    this.state = "playing";
  }

  setSpeed(barsPerSecond: number): void {
    this.barsPerSecond = assertSpeed(barsPerSecond);
  }

  /** Move one trading-timeframe bar. `1` reveals the next close. `-1` goes back. */
  step(direction: 1 | -1 = 1): number {
    if (direction !== 1 && direction !== -1) {
      throw new ReplayError("bad_step", "Step direction must be 1 or -1.");
    }
    if (direction === 1) {
      const next = this.nextForward();
      if (next === null) throw new ReplayError("tape_ended", "The next bar is past the end of the tape.");
      this.cursorMs = next;
      return this.cursorMs;
    }
    const previous = this.nextBack();
    if (previous === null) throw new ReplayError("tape_started", "The previous bar is before the tape.");
    this.cursorMs = previous;
    return this.cursorMs;
  }

  /** Put the cursor on a timestamp inside the tape. A time outside the tape is refused. */
  seek(timestamp: number): number {
    assertInside(timestamp, this.tape);
    this.cursorMs = timestamp;
    return this.cursorMs;
  }

  /** Jump to the next session open strictly after the cursor, in the viewer's timezone. */
  nextSession(): SessionJump {
    const found = findNextSession(this.cursorMs, this.zone, this.sessionOpens, this.days, this.tape);
    if (!found) {
      throw new ReplayError("no_session", "No later session open falls inside the tape.");
    }
    this.cursorMs = found.cursor;
    return found;
  }

  /**
   * While playing, reveal one trading bar each `1000 / speed` milliseconds.
   * Leftover time is kept, including across a speed change. Returns bars moved.
   */
  advance(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new ReplayError("bad_elapsed", "Elapsed time must be a non-negative number of milliseconds.");
    }
    if (this.state !== "playing") return 0;
    this.bankedMs += elapsedMs;
    const interval = 1000 / this.barsPerSecond;
    let moved = 0;
    while (this.bankedMs + 1e-9 >= interval) {
      const next = this.nextForward();
      if (next === null) {
        this.pause();
        break;
      }
      this.cursorMs = next;
      this.bankedMs -= interval;
      moved += 1;
    }
    return moved;
  }

  /** Used by the session file after the document has been validated. */
  restore(cursor: number, timeframeMinutes: number, speed: number, timeZone: string): void {
    assertInside(cursor, this.tape);
    const minutes = assertTimeframe(timeframeMinutes);
    const barsPerSecond = assertSpeed(speed);
    const zone = assertTimeZone(timeZone);
    this.cursorMs = cursor;
    this.minutes = minutes;
    this.barsPerSecond = barsPerSecond;
    this.zone = zone;
    this.pause();
  }

  private nextForward(): number | null {
    const span = this.minutes * 60_000;
    const remainder = this.cursorMs % span;
    const next = remainder === 0 ? this.cursorMs + span : this.cursorMs + (span - remainder);
    if (next > this.tape.lastClose) return null;
    return next;
  }

  private nextBack(): number | null {
    const span = this.minutes * 60_000;
    const remainder = this.cursorMs % span;
    const previous = remainder === 0 ? this.cursorMs - span : this.cursorMs - remainder;
    if (previous < this.tape.firstClose) {
      if (this.cursorMs === this.tape.firstClose) return null;
      return this.tape.firstClose;
    }
    return previous;
  }
}

/** Close of the trading bar that has finished at `cursor`, when that close is on the tape. */
export function closedBarTime(cursor: number, timeframeMinutes: number, tape: TapeBounds): number | null {
  const span = assertTimeframe(timeframeMinutes) * 60_000;
  const remainder = cursor % span;
  const close = remainder === 0 ? cursor : cursor - remainder;
  if (close < tape.firstClose || close > tape.lastClose) return null;
  return close;
}

function assertTape(tape: TapeBounds): TapeBounds {
  if (!tape || !Number.isFinite(tape.firstClose) || !Number.isFinite(tape.lastClose)) {
    throw new ReplayError("bad_tape", "The tape needs a first and last minute close.");
  }
  if (tape.lastClose < tape.firstClose) {
    throw new ReplayError("bad_tape", "The tape ends before it starts.");
  }
  return { firstClose: tape.firstClose, lastClose: tape.lastClose };
}

function assertInside(timestamp: number, tape: TapeBounds): void {
  if (!Number.isFinite(timestamp) || timestamp < tape.firstClose || timestamp > tape.lastClose) {
    throw new ReplayError("outside_tape", "That time is outside the tape.");
  }
}

function assertTimeframe(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new ReplayError("bad_timeframe", "The trading timeframe must be a positive whole number of minutes.");
  }
  return minutes;
}

function assertSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new ReplayError("bad_speed", "Speed must be a positive number of bars per second.");
  }
  return speed;
}

function assertSessions(sessions: readonly SessionOpen[]): readonly SessionOpen[] {
  if (sessions.length === 0) throw new ReplayError("bad_session", "At least one session open is required.");
  return sessions.map((session) => {
    if (typeof session.name !== "string" || session.name.trim() === "") {
      throw new ReplayError("bad_session", "A session needs a name.");
    }
    if (!Number.isInteger(session.openMinute) || session.openMinute < 0 || session.openMinute > 1439) {
      throw new ReplayError("bad_session", "A session open is minutes after local midnight.");
    }
    return { name: session.name, openMinute: session.openMinute };
  });
}

function assertDays(days: readonly Weekday[]): readonly Weekday[] {
  if (days.length === 0) throw new ReplayError("bad_session", "At least one trading day is required.");
  for (const day of days) {
    if (!["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].includes(day)) {
      throw new ReplayError("bad_session", "A trading day must be a weekday name.");
    }
  }
  return days;
}

function findNextSession(
  cursor: number,
  timeZone: string,
  sessions: readonly SessionOpen[],
  tradingDays: readonly Weekday[],
  tape: TapeBounds,
): SessionJump | null {
  const start = zonedParts(cursor, timeZone);
  for (let add = 0; add < 14; add += 1) {
    const date = addCalendarDays(start, add);
    if (!tradingDays.includes(weekdayOf(date))) continue;
    const candidates: SessionJump[] = [];
    for (const session of sessions) {
      const hour = Math.floor(session.openMinute / 60);
      const minute = session.openMinute % 60;
      const open = zonedTimeToUtc(date.year, date.month, date.day, hour, minute, timeZone);
      if (open > cursor && open >= tape.firstClose && open <= tape.lastClose) {
        candidates.push({ cursor: open, name: session.name });
      }
    }
    candidates.sort((left, right) => left.cursor - right.cursor);
    if (candidates[0]) return candidates[0];
  }
  return null;
}
