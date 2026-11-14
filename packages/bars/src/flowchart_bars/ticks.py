# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Tick bars. One closed bar is N trades. A short tail stays incomplete."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from flowchart_bars.clock import ensure_utc
from flowchart_bars.decimals import add_text, max_text, min_text, require_positive
from flowchart_bars.errors import BarsError
from flowchart_bars.tape import Bar


@dataclass(frozen=True, slots=True)
class Trade:
    time: datetime
    price: str
    size: str

    def __post_init__(self) -> None:
        ensure_utc(self.time, "trade time")
        require_positive(self.price, "price")
        require_positive(self.size, "size")


@dataclass(frozen=True, slots=True)
class TickWindow:
    count: int
    cursor: datetime
    bars: tuple[Bar, ...]
    forming: Bar | None


def tick_bars(trades: list[Trade] | tuple[Trade, ...], count: int, cursor: datetime) -> TickWindow:
    """Group prints the cursor has reached. Trades after the cursor stay out.

    A complete group is a closed bar. Its close time is the time of its last
    trade, which is at or before the cursor. The remainder is the forming bar
    even though that time is also at or before the cursor: it is short of N.
    """
    if isinstance(count, bool) or not isinstance(count, int) or count < 1:
        raise BarsError("tick count must be a positive whole number")
    cursor_utc = ensure_utc(cursor, "cursor")
    usable: list[Trade] = []
    previous: datetime | None = None
    for trade in trades:
        if not isinstance(trade, Trade):
            raise BarsError("each print must be a trade")
        when = ensure_utc(trade.time, "trade time")
        if previous is not None and when < previous:
            raise BarsError("trades must be oldest first", code="invalid_bar")
        previous = when
        if when <= cursor_utc:
            usable.append(trade)
    complete = len(usable) // count
    closed = tuple(
        _trade_bar(usable[index : index + count]) for index in range(0, complete * count, count)
    )
    remainder = usable[complete * count :]
    forming = _trade_bar(remainder) if remainder else None
    return TickWindow(count=count, cursor=cursor_utc, bars=closed, forming=forming)


def _trade_bar(trades: list[Trade]) -> Bar:
    first = trades[0]
    last = trades[-1]
    high = first.price
    low = first.price
    volume = "0"
    for trade in trades:
        high = max_text(high, trade.price)
        low = min_text(low, trade.price)
        volume = add_text(volume, trade.size)
    return Bar(
        open_time=ensure_utc(first.time, "trade time"),
        close_time=ensure_utc(last.time, "trade time"),
        open=first.price,
        high=high,
        low=low,
        close=last.price,
        volume=volume,
    )
