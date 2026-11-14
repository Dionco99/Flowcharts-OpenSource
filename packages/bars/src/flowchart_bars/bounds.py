# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Bucket boundaries for calendar units and for session clocks.

Session minutes and hours step in real time from the anchor clock and restart
at the next anchor, so a 7-minute bar ends the session day on the remainder.
A session day opens at that clock in the symbol's zone. Weeks follow the
market open and the market close. Months follow the civil calendar.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from flowchart_bars.clock import (
    DAY_ORIGIN,
    UTC,
    WEEK_ORIGIN,
    add_real,
    civil_utc,
    ensure_utc,
    weekday_index,
)
from flowchart_bars.errors import BarsError
from flowchart_bars.spec import SymbolSpec

_TIMEFRAME = re.compile(r"^([1-9]\d{0,4})(s|m|h|D|W|M)$")


@dataclass(frozen=True, slots=True)
class Timeframe:
    source: str
    span: int
    unit: str

    @property
    def fixed_duration(self) -> timedelta | None:
        if self.unit == "s":
            return timedelta(seconds=self.span)
        if self.unit == "m":
            return timedelta(minutes=self.span)
        if self.unit == "h":
            return timedelta(hours=self.span)
        if self.unit == "D":
            return timedelta(days=self.span)
        return None


def parse_timeframe(source: str) -> Timeframe:
    if not isinstance(source, str):
        raise BarsError("timeframe must be a string", code="invalid_timeframe")
    match = _TIMEFRAME.fullmatch(source)
    if not match:
        raise BarsError(
            "timeframe must look like 15s, 7m, 2h, 3D, 1W, or 3M",
            code="invalid_timeframe",
        )
    return Timeframe(source, int(match.group(1)), match.group(2))


def bucket_bounds(
    spec: SymbolSpec,
    instant: datetime,
    timeframe: str,
    *,
    alignment: str = "session",
    session: str | None = None,
) -> tuple[datetime, datetime]:
    """Open and close of the bucket that contains `instant`. Close is exclusive."""
    parsed = parse_timeframe(timeframe)
    _check_request(parsed, alignment, session)
    when = ensure_utc(instant)
    if parsed.unit == "s" or alignment == "calendar":
        return _calendar_bounds(when, parsed)
    return _session_bounds(spec, when, parsed, session)


def session_day_bounds(
    spec: SymbolSpec,
    instant: datetime,
    session: str | None = None,
) -> tuple[datetime, datetime]:
    """The session day that contains `instant`.

    It opens at the market-open clock, or at a named session's open, in the
    symbol's zone. It closes at that same clock on the next civil day.
    """
    return bucket_bounds(spec, instant, "1D", alignment="session", session=session)


def _check_request(parsed: Timeframe, alignment: str, session: str | None) -> None:
    if alignment not in {"session", "calendar"}:
        raise BarsError("alignment must be session or calendar")
    if session is not None and (alignment != "session" or parsed.unit not in {"m", "h", "D"}):
        raise BarsError("a named session applies to session minutes, hours, and days")


def _calendar_bounds(instant: datetime, parsed: Timeframe) -> tuple[datetime, datetime]:
    if parsed.unit in {"s", "m", "h", "D"}:
        duration = parsed.fixed_duration
        if duration is None:
            raise BarsError("timeframe has no fixed length", code="invalid_timeframe")
        return _fixed_from_epoch(instant, duration)
    if parsed.unit == "W":
        return _calendar_weeks(instant, parsed.span)
    return _calendar_months(instant, parsed.span, UTC)


def _session_bounds(
    spec: SymbolSpec,
    instant: datetime,
    parsed: Timeframe,
    session: str | None,
) -> tuple[datetime, datetime]:
    if parsed.unit in {"m", "h"}:
        duration = parsed.fixed_duration
        if duration is None:
            raise BarsError("timeframe has no fixed length", code="invalid_timeframe")
        return _intraday(spec, instant, duration, spec.anchor(session))
    if parsed.unit == "D":
        return _session_days(spec, instant, parsed.span, spec.anchor(session))
    if parsed.unit == "W":
        return _market_weeks(spec, instant, parsed.span)
    return _calendar_months(instant, parsed.span, spec.zone())


def _fixed_from_epoch(instant: datetime, duration: timedelta) -> tuple[datetime, datetime]:
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    span = duration.total_seconds()
    elapsed = (instant - epoch).total_seconds()
    steps = int(elapsed // span)
    open_time = epoch + timedelta(seconds=steps * span)
    return open_time, open_time + duration


def _calendar_weeks(instant: datetime, span: int) -> tuple[datetime, datetime]:
    monday = instant.date() - timedelta(days=instant.weekday())
    this_open = datetime(monday.year, monday.month, monday.day, tzinfo=UTC)
    index = (this_open - WEEK_ORIGIN).days // 7
    start_index = index - (index % span)
    open_time = WEEK_ORIGIN + timedelta(days=7 * start_index)
    return open_time, open_time + timedelta(days=7 * span)


def _calendar_months(instant: datetime, span: int, tz: datetime.tzinfo) -> tuple[datetime, datetime]:
    local = instant.astimezone(tz)
    month_index = local.year * 12 + (local.month - 1)
    start_index = month_index - (month_index % span)
    return _month_open(tz, start_index), _month_open(tz, start_index + span)


def _month_open(tz: datetime.tzinfo, month_index: int) -> datetime:
    year, month0 = divmod(month_index, 12)
    return civil_utc(tz, year, month0 + 1, 1, 0, 0)


def _anchor_on(spec: SymbolSpec, year: int, month: int, day: int, anchor: tuple[int, int]) -> datetime:
    hour, minute = anchor
    return civil_utc(spec.zone(), year, month, day, hour, minute)


def _session_open(spec: SymbolSpec, instant: datetime, anchor: tuple[int, int]) -> datetime:
    local = instant.astimezone(spec.zone())
    hour, minute = anchor
    date = local.date()
    if (local.hour, local.minute, local.second, local.microsecond) < (hour, minute, 0, 0):
        date = date - timedelta(days=1)
    return _anchor_on(spec, date.year, date.month, date.day, anchor)


def _intraday(
    spec: SymbolSpec,
    instant: datetime,
    duration: timedelta,
    anchor: tuple[int, int],
) -> tuple[datetime, datetime]:
    start = _session_open(spec, instant, anchor)
    next_date = start.astimezone(spec.zone()).date() + timedelta(days=1)
    next_open = _anchor_on(spec, next_date.year, next_date.month, next_date.day, anchor)
    elapsed = (instant - start).total_seconds()
    span = duration.total_seconds()
    steps = int(elapsed // span)
    open_time = add_real(start, timedelta(seconds=steps * span))
    close_time = add_real(open_time, duration)
    if close_time > next_open:
        close_time = next_open
    return open_time, close_time


def _session_days(
    spec: SymbolSpec,
    instant: datetime,
    span: int,
    anchor: tuple[int, int],
) -> tuple[datetime, datetime]:
    opened = _session_open(spec, instant, anchor)
    index = opened.astimezone(spec.zone()).date().toordinal() - DAY_ORIGIN.toordinal()
    start_index = index - (index % span)
    start_date = DAY_ORIGIN + timedelta(days=start_index)
    close_date = start_date + timedelta(days=span)
    hour, minute = anchor
    return (
        civil_utc(spec.zone(), start_date.year, start_date.month, start_date.day, hour, minute),
        civil_utc(spec.zone(), close_date.year, close_date.month, close_date.day, hour, minute),
    )


def _market_weeks(spec: SymbolSpec, instant: datetime, span: int) -> tuple[datetime, datetime]:
    this_open = _week_open_at_or_before(spec, instant)
    this_close = _week_close(spec, this_open)
    if instant >= this_close:
        raise BarsError("bar is outside the market week", code="invalid_bar")
    origin = _origin_week_open(spec)
    delta_days = (
        this_open.astimezone(spec.zone()).date() - origin.astimezone(spec.zone()).date()
    ).days
    if delta_days % 7 != 0:
        raise BarsError("market week is not on a 7-day grid", code="invalid_bar")
    index = delta_days // 7
    back = index % span
    start_date = this_open.astimezone(spec.zone()).date() - timedelta(days=7 * back)
    hour, minute = spec.market.open.hour_minute()
    group_open = civil_utc(spec.zone(), start_date.year, start_date.month, start_date.day, hour, minute)
    last_date = start_date + timedelta(days=7 * (span - 1))
    last_open = civil_utc(spec.zone(), last_date.year, last_date.month, last_date.day, hour, minute)
    return group_open, _week_close(spec, last_open)


def _origin_week_open(spec: SymbolSpec) -> datetime:
    open_wd = weekday_index(spec.market.open.weekday)
    delta = (open_wd - DAY_ORIGIN.weekday()) % 7
    date = DAY_ORIGIN + timedelta(days=delta)
    hour, minute = spec.market.open.hour_minute()
    return civil_utc(spec.zone(), date.year, date.month, date.day, hour, minute)


def _week_open_at_or_before(spec: SymbolSpec, instant: datetime) -> datetime:
    local = instant.astimezone(spec.zone())
    open_wd = weekday_index(spec.market.open.weekday)
    days_back = (local.weekday() - open_wd) % 7
    candidate_date = local.date() - timedelta(days=days_back)
    hour, minute = spec.market.open.hour_minute()
    candidate = civil_utc(
        spec.zone(),
        candidate_date.year,
        candidate_date.month,
        candidate_date.day,
        hour,
        minute,
    )
    if candidate > instant:
        earlier = candidate_date - timedelta(days=7)
        candidate = civil_utc(spec.zone(), earlier.year, earlier.month, earlier.day, hour, minute)
    return candidate


def _week_close(spec: SymbolSpec, week_open: datetime) -> datetime:
    local = week_open.astimezone(spec.zone())
    close_wd = weekday_index(spec.market.close.weekday)
    days_forward = (close_wd - local.weekday()) % 7
    close_date = local.date() + timedelta(days=days_forward)
    hour, minute = spec.market.close.hour_minute()
    close = civil_utc(spec.zone(), close_date.year, close_date.month, close_date.day, hour, minute)
    if close <= week_open:
        later = close_date + timedelta(days=7)
        close = civil_utc(spec.zone(), later.year, later.month, later.day, hour, minute)
    return close
