# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Two charts reading one cursor.

Play and pause stay in packages/replay. This clock only seeks and steps, so
the two panes cannot move apart.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.times import ensure_utc
from flowchart_multi.tape import (
    TIMEFRAMES,
    Bar,
    Tape,
    Window,
    forming_bar,
    next_close_after,
    window_at,
)


@dataclass(frozen=True, slots=True)
class ComparePoint:
    """One shared close. `compare` is the left close minus the right close."""

    close_time: datetime
    left_close: Decimal
    right_close: Decimal
    compare: Decimal
    ratio: Decimal


@dataclass(frozen=True, slots=True)
class TwoChartView:
    """Both windows, both forming bars, and the aligned closes at one cursor."""

    cursor: datetime
    timeframe: str
    left: Window
    right: Window
    left_forming: Bar | None
    right_forming: Bar | None
    compare: tuple[ComparePoint, ...]


class TwoChartReplay:
    """Left and right tapes sharing `cursor`."""

    def __init__(
        self,
        left: Tape,
        right: Tape,
        cursor: datetime,
        timeframe: str = "1m",
    ) -> None:
        if timeframe not in TIMEFRAMES:
            raise MultiInstrumentError("timeframe must be one of " + ", ".join(TIMEFRAMES))
        if not isinstance(left, Tape) or not isinstance(right, Tape):
            raise MultiInstrumentError("each chart needs a tape")
        self.left_tape = left
        self.right_tape = right
        self.timeframe = timeframe
        self.cursor = _cursor(cursor)

    def seek(self, cursor: datetime) -> datetime:
        self.cursor = _cursor(cursor)
        return self.cursor

    def step(self, minutes: int = 1) -> datetime:
        """Move the shared cursor by whole minutes of real time."""
        if isinstance(minutes, bool) or not isinstance(minutes, int) or minutes == 0:
            raise MultiInstrumentError("step minutes must be a non-zero whole number")
        self.cursor = self.cursor + timedelta(minutes=minutes)
        return self.cursor

    def step_next_print(self) -> datetime:
        """Move to the next minute that closes on either tape."""
        candidates = []
        for tape in (self.left_tape, self.right_tape):
            nxt = next_close_after(tape.bars, self.cursor)
            if nxt is not None:
                candidates.append(nxt)
        if not candidates:
            raise MultiInstrumentError("no later minute on either tape")
        self.cursor = min(candidates)
        return self.cursor

    def view(self) -> TwoChartView:
        left = window_at(self.left_tape, self.cursor, self.timeframe)
        right = window_at(self.right_tape, self.cursor, self.timeframe)
        return TwoChartView(
            cursor=self.cursor,
            timeframe=self.timeframe,
            left=left,
            right=right,
            left_forming=forming_bar(self.left_tape, self.cursor, self.timeframe),
            right_forming=forming_bar(self.right_tape, self.cursor, self.timeframe),
            compare=align_closes(left, right),
        )


def align_closes(left: Window, right: Window) -> tuple[ComparePoint, ...]:
    """Closes that share a close time. A minute only one tape printed is left out."""
    other = {bar.close_time: bar.close for bar in right.bars}
    points = []
    for bar in left.bars:
        right_close = other.get(bar.close_time)
        if right_close is None:
            continue
        points.append(
            ComparePoint(
                close_time=bar.close_time,
                left_close=bar.close,
                right_close=right_close,
                compare=bar.close - right_close,
                ratio=bar.close / right_close,
            )
        )
    return tuple(points)


def _cursor(value: datetime) -> datetime:
    if not isinstance(value, datetime):
        raise MultiInstrumentError("cursor must be a timestamp")
    return ensure_utc(value)
