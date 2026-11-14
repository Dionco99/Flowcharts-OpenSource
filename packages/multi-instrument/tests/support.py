# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Shared builders for multi-instrument tests. Prices are synthetic."""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from flowchart_multi import Bar, SymbolSpec, Tape, get_symbol  # noqa: E402

NY = ZoneInfo("America/New_York")
UTC = timezone.utc


def ny(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=NY)


def utc(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def minute(
    when: datetime,
    open_: str,
    high: str,
    low: str,
    close: str,
    volume: int = 1,
) -> Bar:
    return Bar(
        open_time=when,
        close_time=when + timedelta(minutes=1),
        open=Decimal(open_),
        high=Decimal(high),
        low=Decimal(low),
        close=Decimal(close),
        volume=volume,
    )


def flat(when: datetime, price: str, volume: int = 1) -> Bar:
    return minute(when, price, price, price, price, volume)


def series(start: datetime, prices: list[str], volume: int = 1) -> tuple[Bar, ...]:
    return tuple(
        flat(start + timedelta(minutes=index), price, volume)
        for index, price in enumerate(prices)
    )


def tape(symbol: str, bars: tuple[Bar, ...]) -> Tape:
    return Tape(get_symbol(symbol), bars)


def custom_spec() -> SymbolSpec:
    source = get_symbol("EURUSD")
    return SymbolSpec(
        symbol="CUSTOM",
        asset_class="forex-major",
        base="EUR",
        quote="USD",
        tick_size=source.tick_size,
        lot_size=source.lot_size,
        pip_size=source.pip_size,
        point_value=source.point_value,
        timezone=source.timezone,
        sessions=source.sessions,
        market=source.market,
        funding=None,
        rollover_note=None,
        ccxt_symbol=None,
        aliases=(),
        description="Custom test pair",
    )
