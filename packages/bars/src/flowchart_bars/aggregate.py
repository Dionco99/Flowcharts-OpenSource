# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Build higher-timeframe bars. A bucket stays hidden until the cursor reaches its close."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from flowchart_bars.bounds import bucket_bounds, parse_timeframe
from flowchart_bars.clock import ensure_utc
from flowchart_bars.decimals import add_text, max_text, min_text
from flowchart_bars.errors import BarsError
from flowchart_bars.spec import SymbolSpec
from flowchart_bars.tape import Bar, Tape, assert_tape

_SESSION_UNITS = {"m", "h", "D", "W", "M"}


@dataclass(frozen=True, slots=True)
class Window:
    spec: SymbolSpec
    timeframe: str
    cursor: datetime
    bars: tuple[Bar, ...]
    alignment: str
    session: str | None = None


def window_at(
    tape: Tape,
    cursor: datetime,
    timeframe: str,
    *,
    alignment: str = "session",
    session: str | None = None,
) -> Window:
    """Closed bars for `timeframe`. The forming bar is not included."""
    closed, _forming = _collect(tape, cursor, timeframe, alignment=alignment, session=session)
    return Window(
        spec=tape.spec,
        timeframe=timeframe,
        cursor=ensure_utc(cursor, "cursor"),
        bars=closed,
        alignment=alignment,
        session=session,
    )


def forming_bar(
    tape: Tape,
    cursor: datetime,
    timeframe: str,
    *,
    alignment: str = "session",
    session: str | None = None,
) -> Bar | None:
    """The open bucket, built only from source bars the cursor has already closed.

    On a 1-minute timeframe the tape stores closed minutes, so this is absent.
    The same is true of a 1-second timeframe over a 1-second tape.
    """
    _closed, forming = _collect(tape, cursor, timeframe, alignment=alignment, session=session)
    return forming


def _collect(
    tape: Tape,
    cursor: datetime,
    timeframe: str,
    *,
    alignment: str,
    session: str | None,
) -> tuple[tuple[Bar, ...], Bar | None]:
    assert_tape(tape)
    parsed = parse_timeframe(timeframe)
    if alignment == "session" and parsed.unit not in _SESSION_UNITS and parsed.unit != "s":
        raise BarsError("timeframe is not a session unit", code="invalid_timeframe")
    cursor_utc = ensure_utc(cursor, "cursor")
    closed: dict[datetime, tuple[datetime, list[Bar]]] = {}
    forming_key: tuple[datetime, datetime] | None = None
    forming_bars: list[Bar] = []
    for bar in tape.bars:
        if bar.close_time > cursor_utc:
            continue
        open_time, close_time = bucket_bounds(
            tape.spec,
            bar.open_time,
            timeframe,
            alignment=alignment,
            session=session,
        )
        _fit(bar, open_time, close_time)
        if close_time <= cursor_utc:
            group = closed.get(open_time)
            if group is None:
                closed[open_time] = (close_time, [bar])
            else:
                group[1].append(bar)
            continue
        key = (open_time, close_time)
        if forming_key is None:
            forming_key = key
        elif key != forming_key:
            raise BarsError("bars are not in one open bucket", code="invalid_bar")
        forming_bars.append(bar)

    bars = tuple(
        _reduce(group, open_time, close_time)
        for open_time, (close_time, group) in sorted(closed.items(), key=lambda item: item[0])
    )
    forming = _reduce(forming_bars, forming_key[0], forming_key[1]) if forming_key and forming_bars else None
    if forming is not None and forming.close_time <= cursor_utc:
        raise BarsError("forming bar is already closed", code="invalid_bar")
    for bar in bars:
        if bar.close_time > cursor_utc:
            raise BarsError("closed bar ends after the cursor", code="invalid_bar")
    return bars, forming


def _fit(bar: Bar, open_time: datetime, close_time: datetime) -> None:
    width = close_time - open_time
    if bar.close_time - bar.open_time > width:
        raise BarsError("source bar is coarser than the timeframe", code="invalid_timeframe")
    if bar.open_time < open_time or bar.close_time > close_time:
        raise BarsError("bar crosses a bucket", code="invalid_bar")


def _reduce(bars: list[Bar], open_time: datetime, close_time: datetime) -> Bar:
    first = bars[0]
    last = bars[-1]
    high = first.high
    low = first.low
    volume = "0"
    for bar in bars:
        high = max_text(high, bar.high)
        low = min_text(low, bar.low)
        volume = add_text(volume, bar.volume)
    if Decimal(high) < Decimal(low):
        raise BarsError("high is below low", code="invalid_bar")
    return Bar(
        open_time=open_time,
        close_time=close_time,
        open=first.open,
        high=high,
        low=low,
        close=last.close,
        volume=volume,
    )
