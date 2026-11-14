# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Shared clocks for the bar tests. Prices are synthetic."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from flowchart_bars import Bar, Tape, eurusd_spec, make_bar

NY = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")


def at_ny(year: int, month: int, day: int, hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, second, tzinfo=NY)


def at_utc(year: int, month: int, day: int, hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, second, tzinfo=UTC)


def minute(when: datetime, price: str, **kwargs: str) -> Bar:
    opened = when.astimezone(UTC)
    return make_bar(opened, opened + timedelta(minutes=1), price, **kwargs)


def second(when: datetime, price: str) -> Bar:
    opened = when.astimezone(UTC)
    return make_bar(opened, opened + timedelta(seconds=1), price)


def tape(*bars: Bar) -> Tape:
    return Tape(eurusd_spec(), bars)
