# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Symbol spec, bars, and the session clock shared by replay."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from decimal import Decimal
from types import MappingProxyType
from zoneinfo import ZoneInfo

FORMAT = "flowchart.tape"
VERSION = 1

TIMEFRAMES = MappingProxyType(
    {
        "1m": 1,
        "5m": 5,
        "15m": 15,
        "1h": 60,
        "4h": 240,
    }
)

WEEKDAYS = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")


class TapeError(ValueError):
    """The tape or the cursor broke the bar contract."""


def as_utc(moment: datetime, label: str) -> datetime:
    if moment.tzinfo is None or moment.tzinfo.utcoffset(moment) is None:
        raise TapeError(f"{label} must be timezone-aware")
    return moment.astimezone(timezone.utc)


@dataclass(frozen=True)
class SessionHours:
    """A named session in the symbol timezone. The close minute is outside it."""

    name: str
    open: time
    close: time


@dataclass(frozen=True)
class WeekPoint:
    weekday: str
    time: time


@dataclass(frozen=True)
class MarketWeek:
    """The week open is included. The week close is excluded."""

    open: WeekPoint
    close: WeekPoint


@dataclass(frozen=True)
class SymbolSpec:
    symbol: str
    tick_size: Decimal
    lot_size: int
    timezone: ZoneInfo
    sessions: tuple[SessionHours, ...]
    market: MarketWeek

    def __post_init__(self) -> None:
        object.__setattr__(self, "sessions", tuple(self.sessions))
        if not isinstance(self.timezone, ZoneInfo):
            raise TapeError("timezone must be an IANA zone")
        if not isinstance(self.tick_size, Decimal) or self.tick_size <= 0:
            raise TapeError("tickSize must be a positive decimal")
        if type(self.lot_size) is not int or self.lot_size <= 0:
            raise TapeError("lotSize must be a positive integer")
        if not self.sessions:
            raise TapeError("sessions must not be empty")
        names = [session.name for session in self.sessions]
        if len(names) != len(set(names)):
            raise TapeError("session names must be unique")


@dataclass(frozen=True)
class Bar:
    open_time: datetime
    close_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int

    def __post_init__(self) -> None:
        open_time = as_utc(self.open_time, "openTime")
        close_time = as_utc(self.close_time, "closeTime")
        object.__setattr__(self, "open_time", open_time)
        object.__setattr__(self, "close_time", close_time)
        for label, value in (
            ("open", self.open),
            ("high", self.high),
            ("low", self.low),
            ("close", self.close),
        ):
            if not isinstance(value, Decimal):
                raise TapeError(f"{label} must be a decimal")
        if close_time <= open_time:
            raise TapeError("closeTime must be after openTime")
        if self.high < self.low:
            raise TapeError("high must be at or above low")
        if self.high < max(self.open, self.close) or self.low > min(self.open, self.close):
            raise TapeError("open and close must sit inside high and low")
        if type(self.volume) is not int or self.volume < 0:
            raise TapeError("volume must be a non-negative integer")


@dataclass(frozen=True)
class Tape:
    spec: SymbolSpec
    bars: tuple[Bar, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "bars", tuple(self.bars))


@dataclass(frozen=True)
class Window:
    """Closed bars only. Every bar's close time is at or before the cursor."""

    spec: SymbolSpec
    timeframe: str
    cursor: datetime
    bars: tuple[Bar, ...]


def _sun_index(moment: datetime) -> int:
    return (moment.weekday() + 1) % 7


def _week_minute(moment: datetime) -> int:
    return _sun_index(moment) * 24 * 60 + moment.hour * 60 + moment.minute


def _point_minute(point: WeekPoint) -> int:
    try:
        weekday = WEEKDAYS.index(point.weekday)
    except ValueError as exc:
        names = ", ".join(WEEKDAYS)
        raise TapeError(f"weekday must be one of {names}") from exc
    return weekday * 24 * 60 + point.time.hour * 60 + point.time.minute


def _in_span(value: int, start: int, end: int) -> bool:
    if start < end:
        return start <= value < end
    if start > end:
        return value >= start or value < end
    return False


def _clock_in(clock: time, open_time: time, close_time: time) -> bool:
    if open_time < close_time:
        return open_time <= clock < close_time
    if open_time > close_time:
        return clock >= open_time or clock < close_time
    return False


def market_is_open(spec: SymbolSpec, moment: datetime) -> bool:
    local = as_utc(moment, "timestamp").astimezone(spec.timezone)
    return _in_span(
        _week_minute(local),
        _point_minute(spec.market.open),
        _point_minute(spec.market.close),
    )


def sessions_at(spec: SymbolSpec, moment: datetime) -> tuple[str, ...]:
    """Session names covering this instant while the market week is open."""

    if not market_is_open(spec, moment):
        return ()
    local = as_utc(moment, "timestamp").astimezone(spec.timezone)
    clock = time(local.hour, local.minute, local.second, local.microsecond)
    return tuple(
        session.name
        for session in spec.sessions
        if _clock_in(clock, session.open, session.close)
    )


def timeframe_minutes(timeframe: str) -> int:
    try:
        return TIMEFRAMES[timeframe]
    except KeyError as exc:
        names = ", ".join(TIMEFRAMES)
        raise TapeError(f"timeframe must be one of {names}") from exc
