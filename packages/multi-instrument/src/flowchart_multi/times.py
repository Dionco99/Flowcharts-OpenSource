# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""UTC timestamps and minute clocks."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flowchart_multi.errors import MultiInstrumentError

_STAMP = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z$")
_HHMM = re.compile(r"^(\d{2}):(\d{2})$")
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def weekday_name(day: date) -> str:
    return WEEKDAYS[day.weekday()]


def parse_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise MultiInstrumentError(f"unknown timezone {name}") from exc


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise MultiInstrumentError("timestamp needs a timezone")
    return value.astimezone(timezone.utc)


def parse_timestamp(value: object, *, field: str) -> datetime:
    """Parse `YYYY-MM-DDTHH:MM:SSZ` into an aware UTC datetime."""
    if not isinstance(value, str) or _STAMP.fullmatch(value) is None:
        raise MultiInstrumentError(f"{field} must be YYYY-MM-DDTHH:MM:SSZ")
    parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    if parsed.second != 0 or parsed.microsecond != 0:
        raise MultiInstrumentError(f"{field} must fall on a minute")
    return parsed


def format_timestamp(value: datetime) -> str:
    utc = ensure_utc(value)
    if utc.second != 0 or utc.microsecond != 0:
        raise MultiInstrumentError("timestamp must fall on a minute")
    return utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_hhmm(value: object, *, field: str) -> time:
    if not isinstance(value, str) or _HHMM.fullmatch(value) is None:
        raise MultiInstrumentError(f"{field} must be HH:MM")
    hour, minute = (int(part) for part in value.split(":"))
    if hour > 23 or minute > 59:
        raise MultiInstrumentError(f"{field} must be HH:MM")
    return time(hour, minute)


def format_hhmm(value: time) -> str:
    return f"{value.hour:02d}:{value.minute:02d}"


def local_instant(day: date, clock: time, zone: ZoneInfo) -> datetime:
    """The real instant of a wall-clock time, or an error if that minute is skipped."""
    local = datetime(day.year, day.month, day.day, clock.hour, clock.minute, tzinfo=zone)
    back = local.astimezone(timezone.utc).astimezone(zone)
    observed = (back.year, back.month, back.day, back.hour, back.minute)
    wanted = (day.year, day.month, day.day, clock.hour, clock.minute)
    if observed != wanted:
        raise MultiInstrumentError(
            f"{format_hhmm(clock)} does not occur in {zone.key} on {day.isoformat()}"
        )
    return local


def require_minute(value: datetime, *, field: str) -> datetime:
    utc = ensure_utc(value)
    if utc.second != 0 or utc.microsecond != 0:
        raise MultiInstrumentError(f"{field} must fall on a minute")
    return utc


def clock_of(value: datetime) -> time:
    return time(value.hour, value.minute, value.second, value.microsecond)


def add_minutes(value: datetime, minutes: int) -> datetime:
    return ensure_utc(value) + timedelta(minutes=minutes)
