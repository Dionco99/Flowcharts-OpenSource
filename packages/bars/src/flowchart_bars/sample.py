# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Generated EURUSD tape used by tests.

The walk is seeded and lives on the 0.00001 tick grid. It is synthetic.
The repository does not store the series; call `build_eurusd_tape`.
"""

from __future__ import annotations

import random
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from flowchart_bars.model import (
    Bar,
    MarketWeek,
    SessionHours,
    SymbolSpec,
    Tape,
    WeekPoint,
)
from flowchart_bars.tape import validate_tape

_TICK = Decimal("0.00001")
_SEED = 20240602


def eurusd_spec() -> SymbolSpec:
    return SymbolSpec(
        symbol="EURUSD",
        tick_size=_TICK,
        lot_size=100_000,
        timezone=ZoneInfo("America/New_York"),
        sessions=(
            SessionHours("asia", time(17, 0), time(3, 0)),
            SessionHours("london", time(3, 0), time(12, 0)),
            SessionHours("new_york", time(8, 0), time(17, 0)),
        ),
        market=MarketWeek(
            open=WeekPoint("Sun", time(17, 0)),
            close=WeekPoint("Fri", time(17, 0)),
        ),
    )


def build_eurusd_tape() -> Tape:
    """One liquid forex day: Sunday 2024-06-02 17:00 New York through Monday 17:00."""

    spec = eurusd_spec()
    rng = random.Random(_SEED)
    price = 108_500
    start = datetime(2024, 6, 2, 17, 0, tzinfo=spec.timezone)
    bars: list[Bar] = []
    for index in range(24 * 60):
        open_ticks = price
        drift = rng.randint(-4, 4)
        close_ticks = open_ticks + drift
        if close_ticks > 108_800:
            close_ticks = open_ticks - abs(drift) - 1
        elif close_ticks < 108_200:
            close_ticks = open_ticks + abs(drift) + 1
        high_ticks = max(open_ticks, close_ticks) + rng.randint(1, 6)
        low_ticks = min(open_ticks, close_ticks) - rng.randint(1, 6)
        open_time = start + timedelta(minutes=index)
        bars.append(
            Bar(
                open_time=open_time,
                close_time=open_time + timedelta(minutes=1),
                open=_from_ticks(open_ticks),
                high=_from_ticks(high_ticks),
                low=_from_ticks(low_ticks),
                close=_from_ticks(close_ticks),
                volume=rng.randint(80, 420),
            )
        )
        price = close_ticks
    tape = Tape(spec=spec, bars=tuple(bars))
    validate_tape(tape)
    return tape


def _from_ticks(ticks: int) -> Decimal:
    return Decimal(ticks) * _TICK
