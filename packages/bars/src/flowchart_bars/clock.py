# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""UTC instants and civil clocks. Arithmetic is done in UTC so a daylight-saving gap is real time."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flowchart_bars.errors import BarsError

_STAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_CLOCK = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
UTC = timezone.utc
DAY_ORIGIN = datetime(1970, 1, 4).date()
WEEK_ORIGIN = datetime(1970, 1, 5, tzinfo=UTC)


def ensure_utc(value: datetime, label: str = "timestamp") -> datetime:
    if not isinstance(value, datetime) or isinstance(value, bool):
        raise BarsError(f"{label} must be a timestamp")
    if value.tzinfo is None or value.utcoffset() is None:
        raise BarsError(f"{label} must carry a timezone")
    return value.astimezone(UTC)


def parse_stamp(value: object, label: str = "timestamp") -> datetime:
    if not isinstance(value, str) or not _STAMP.fullmatch(value):
        raise BarsError(f"{label} must be YYYY-MM-DDTHH:MM:SSZ", code="invalid_bar")
    parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    return parsed


def format_stamp(value: datetime) -> str:
    return ensure_utc(value).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_clock(value: object, label: str) -> tuple[int, int]:
    if not isinstance(value, str) or not _CLOCK.fullmatch(value):
        raise BarsError(f"{label} must be HH:MM")
    hour, minute = value.split(":")
    return int(hour), int(minute)


def require_weekday(value: object, label: str) -> str:
    if not isinstance(value, str) or value not in WEEKDAYS:
        raise BarsError(f"{label} must be a weekday (Sun through Sat)")
    return value


def zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise BarsError(f"unknown timezone {name}") from exc


def civil_utc(tz: tzinfo, year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    """The UTC instant of a civil clock. The clock is one that exists in that zone."""
    local = datetime(year, month, day, hour, minute, tzinfo=tz)
    return local.astimezone(UTC)


def add_real(instant: datetime, delta: timedelta) -> datetime:
    return ensure_utc(instant) + delta


def weekday_index(name: str) -> int:
    return WEEKDAYS.index(name)
