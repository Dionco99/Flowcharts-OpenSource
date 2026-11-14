# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Session windows, the week clock, and funding instants."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.spec import SymbolSpec, WeekTime
from flowchart_multi.times import clock_of, ensure_utc, local_instant, parse_zone, weekday_name


def sessions_at(spec: SymbolSpec, instant: datetime) -> tuple[str, ...]:
    """Session names that contain `instant`. The close minute is excluded.

    A weekend instant matches nothing, even when its clock sits inside a
    named window. Overlapping sessions are all returned, in spec order.
    """
    local = _local(spec, instant)
    if not _in_week(spec, local):
        return ()
    found = []
    for session in spec.sessions:
        if _in_window(clock_of(local), session.open, session.close):
            found.append(session.name)
    return tuple(found)


def is_market_open(spec: SymbolSpec, instant: datetime) -> bool:
    """True when the week is open and at least one session contains the instant."""
    return bool(sessions_at(spec, instant))


def funding_instants(
    spec: SymbolSpec,
    start: datetime,
    end: datetime,
) -> tuple[datetime, ...]:
    """Funding stamps in `[start, end)`, UTC. Instruments without funding return none."""
    if spec.funding is None:
        return ()
    start_utc = ensure_utc(start)
    end_utc = ensure_utc(end)
    if end_utc < start_utc:
        raise MultiInstrumentError("funding end is before start")
    found: list[datetime] = []
    day = (start_utc - timedelta(days=1)).date()
    last = (end_utc + timedelta(days=1)).date()
    while day <= last:
        for clock in spec.funding.times_utc:
            stamp = datetime(
                day.year,
                day.month,
                day.day,
                clock.hour,
                clock.minute,
                tzinfo=timezone.utc,
            )
            if start_utc <= stamp < end_utc and is_market_open(spec, stamp):
                found.append(stamp)
        day += timedelta(days=1)
    return tuple(found)


def _local(spec: SymbolSpec, instant: datetime) -> datetime:
    return ensure_utc(instant).astimezone(parse_zone(spec.timezone))


def _in_week(spec: SymbolSpec, local: datetime) -> bool:
    if _same_clock(spec.market.open, spec.market.close):
        return True
    zone = local.tzinfo
    if not isinstance(zone, ZoneInfo):
        raise MultiInstrumentError("symbol timezone is missing")
    open_at = _latest_open(spec, local, zone)
    close_at = _next_clock(open_at, spec.market.close, zone)
    return open_at <= local < close_at


def _same_clock(left: WeekTime, right: WeekTime) -> bool:
    return left.weekday == right.weekday and left.time == right.time


def _latest_open(spec: SymbolSpec, local: datetime, zone: ZoneInfo) -> datetime:
    found: datetime | None = None
    for delta in range(8):
        day = local.date() - timedelta(days=delta)
        if weekday_name(day) != spec.market.open.weekday:
            continue
        candidate = local_instant(day, spec.market.open.time, zone)
        if candidate <= local and (found is None or candidate > found):
            found = candidate
    if found is None:
        raise MultiInstrumentError("no market open at or before the timestamp")
    return found


def _next_clock(start: datetime, clock: WeekTime, zone: ZoneInfo) -> datetime:
    for delta in range(8):
        day = start.date() + timedelta(days=delta)
        if weekday_name(day) != clock.weekday:
            continue
        candidate = local_instant(day, clock.time, zone)
        if candidate > start:
            return candidate
    raise MultiInstrumentError("no market close after the open")


def _in_window(clock: time, open_clock: time, close_clock: time) -> bool:
    if open_clock == close_clock:
        return True
    if open_clock < close_clock:
        return open_clock <= clock < close_clock
    return clock >= open_clock or clock < close_clock
