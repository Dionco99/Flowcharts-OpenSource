# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Path setup and hand-built minutes for the bar-contract tests."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
SRC = PACKAGE_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from flowchart_bars import Bar  # noqa: E402

NY = ZoneInfo("America/New_York")
TICK = Decimal("0.00001")


def et(year: int, month: int, day: int, hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, second, tzinfo=NY)


def make_minutes(
    start: datetime,
    count: int,
    spikes: dict[int, str] | None = None,
) -> list[Bar]:
    spikes = spikes or {}
    bars: list[Bar] = []
    for index in range(count):
        open_time = start + timedelta(minutes=index)
        price = Decimal("1.08000") + TICK * index
        high = Decimal(spikes[index]) if index in spikes else price + TICK * 2
        bars.append(
            Bar(
                open_time=open_time,
                close_time=open_time + timedelta(minutes=1),
                open=price,
                high=high,
                low=price - TICK,
                close=price + TICK,
                volume=index + 1,
            )
        )
    return bars
