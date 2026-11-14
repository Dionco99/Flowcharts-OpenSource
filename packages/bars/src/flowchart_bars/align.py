# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Clock buckets for higher timeframes.

A bucket starts on the market-open grid in the symbol timezone. It closes
one timeframe of real time later, so a spring-forward gap cannot invent a
close timestamp the cursor will never reach.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flowchart_bars.model import TapeError


def bucket_bounds(
    open_time: datetime,
    timeframe_minutes: int,
    tz: ZoneInfo,
    anchor: time,
) -> tuple[datetime, datetime]:
    local = open_time.astimezone(tz)
    minute_of_day = local.hour * 60 + local.minute
    anchor_minute = anchor.hour * 60 + anchor.minute
    delta = minute_of_day - anchor_minute
    start_minute = anchor_minute + (delta // timeframe_minutes) * timeframe_minutes
    start_day = local.date()
    while start_minute < 0:
        start_day -= timedelta(days=1)
        start_minute += 24 * 60
    while start_minute >= 24 * 60:
        start_day += timedelta(days=1)
        start_minute -= 24 * 60
    start_hour, start_min = divmod(start_minute, 60)
    start = _instant_at_or_before(start_day, start_hour, start_min, tz, open_time)
    end = start + timedelta(minutes=timeframe_minutes)
    if end <= start:
        raise TapeError("bucket close must be after its open")
    return start, end


def _civil_instants(day: date, hour: int, minute: int, tz: ZoneInfo) -> list[datetime]:
    found: list[datetime] = []
    for fold in (0, 1):
        local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz, fold=fold)
        utc = local.astimezone(timezone.utc)
        back = utc.astimezone(tz)
        same = (back.date(), back.hour, back.minute, back.fold) == (day, hour, minute, fold)
        if same and utc not in found:
            found.append(utc)
    return found


def _instant_at_or_before(
    day: date,
    hour: int,
    minute: int,
    tz: ZoneInfo,
    not_after: datetime,
) -> datetime:
    instants = _civil_instants(day, hour, minute, tz)
    if not instants:
        instants = _next_real_instant(day, hour, minute, tz)
    eligible = [instant for instant in instants if instant <= not_after]
    if not eligible:
        label = f"{day.isoformat()} {hour:02d}:{minute:02d}"
        raise TapeError(f"no bucket start at or before the bar for {label} in {tz.key}")
    return max(eligible)


def _next_real_instant(day: date, hour: int, minute: int, tz: ZoneInfo) -> list[datetime]:
    total = hour * 60 + minute
    for extra in range(1, 181):
        stepped = total + extra
        stepped_day = day + timedelta(days=stepped // (24 * 60))
        stepped %= 24 * 60
        hour2, minute2 = divmod(stepped, 60)
        instants = _civil_instants(stepped_day, hour2, minute2, tz)
        if instants:
            return instants
    return []
