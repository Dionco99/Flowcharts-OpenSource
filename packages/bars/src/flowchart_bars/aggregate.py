# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Build the closed-bar window at a cursor.

Minutes with a close time after the cursor are ignored. A higher-timeframe
bucket is closed only when the cursor has reached that bucket's close, so a
15-minute bar cannot close while any of its minutes is still in the future.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from flowchart_bars.align import bucket_bounds
from flowchart_bars.model import (
    Bar,
    SymbolSpec,
    Tape,
    TapeError,
    Window,
    as_utc,
    timeframe_minutes,
)


@dataclass(frozen=True)
class _Bucket:
    start: datetime
    end: datetime
    minutes: tuple[Bar, ...]


def window_at(tape: Tape, cursor: datetime, timeframe: str) -> Window:
    cursor_utc, closed, _forming = _split(tape.bars, timeframe, cursor, tape.spec)
    return Window(spec=tape.spec, timeframe=timeframe, cursor=cursor_utc, bars=closed)


def forming_bar(tape: Tape, cursor: datetime, timeframe: str) -> Bar | None:
    """The in-progress bucket. Its close time is still after the cursor.

    A 1-minute tape has no partial minute, so this is empty for `1m`.
    """

    _cursor, _closed, forming = _split(tape.bars, timeframe, cursor, tape.spec)
    return forming


def aggregate(
    bars: tuple[Bar, ...] | list[Bar],
    timeframe: str,
    cursor: datetime,
    spec: SymbolSpec,
) -> tuple[Bar, ...]:
    _cursor, closed, _forming = _split(bars, timeframe, cursor, spec)
    return closed


def _split(
    bars: tuple[Bar, ...] | list[Bar],
    timeframe: str,
    cursor: datetime,
    spec: SymbolSpec,
) -> tuple[datetime, tuple[Bar, ...], Bar | None]:
    cursor_utc = as_utc(cursor, "cursor")
    width = timeframe_minutes(timeframe)
    eligible = sorted(
        (bar for bar in bars if bar.close_time <= cursor_utc),
        key=lambda bar: bar.open_time,
    )
    if width == 1:
        return cursor_utc, tuple(eligible), None

    closed: list[Bar] = []
    forming: Bar | None = None
    for bucket in _buckets(eligible, width, spec):
        if bucket.end <= cursor_utc:
            if forming is not None:
                raise TapeError("a closed bucket follows an open one")
            closed.append(_reduce(bucket))
        elif forming is None:
            forming = _reduce(bucket)
        else:
            raise TapeError("more than one open bucket")

    for bar in closed:
        if bar.close_time > cursor_utc:
            raise TapeError("aggregated bar closes after the cursor")
    if forming is not None and forming.close_time <= cursor_utc:
        raise TapeError("forming bar is already closed")
    return cursor_utc, tuple(closed), forming


def _buckets(bars: list[Bar], width: int, spec: SymbolSpec) -> tuple[_Bucket, ...]:
    grouped: dict[datetime, list[Bar]] = {}
    ends: dict[datetime, datetime] = {}
    for bar in bars:
        start, end = bucket_bounds(bar.open_time, width, spec.timezone, spec.market.open.time)
        if not start <= bar.open_time < end:
            raise TapeError("minute fell outside its bucket")
        if start in ends and ends[start] != end:
            raise TapeError("bucket close is ambiguous")
        grouped.setdefault(start, []).append(bar)
        ends[start] = end
    return tuple(
        _Bucket(start, ends[start], tuple(grouped[start]))
        for start in sorted(grouped)
    )


def _reduce(bucket: _Bucket) -> Bar:
    minutes = bucket.minutes
    return Bar(
        open_time=bucket.start,
        close_time=bucket.end,
        open=minutes[0].open,
        high=max(minute.high for minute in minutes),
        low=min(minute.low for minute in minutes),
        close=minutes[-1].close,
        volume=sum(minute.volume for minute in minutes),
    )
