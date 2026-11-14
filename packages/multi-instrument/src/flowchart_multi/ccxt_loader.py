# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""CCXT kline port. The CCXT package is not a dependency and nothing is fetched.

`fetch_ohlcv` matches the CCXT candle shape: milliseconds, open, high, low,
close, volume. A desk adapter may call CCXT. The mock returns rows the caller
already holds. Prices in those rows are decimal strings.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Mapping, Sequence

from flowchart_multi.decimals import parse_decimal
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.spec import SymbolSpec
from flowchart_multi.tape import Bar, Tape
from flowchart_multi.times import ensure_utc

_MINUTE_MS = 60_000


class CcxtKlineLoader:
    """Desk-facing kline port. This class does not open a connection."""

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        since: int | None = None,
        limit: int | None = None,
    ) -> list[list[object]]:
        raise MultiInstrumentError(
            "The CCXT package is not a dependency. "
            "Use MockCcxtKlineLoader or a desk adapter."
        )


class MockCcxtKlineLoader(CcxtKlineLoader):
    """Returns candles stored on the instance. `calls` records each fetch."""

    def __init__(self, candles: Mapping[tuple[str, str], Sequence[Sequence[object]]]) -> None:
        if not isinstance(candles, Mapping):
            raise MultiInstrumentError("mock candles must be a mapping")
        stored: dict[tuple[str, str], tuple[tuple[object, ...], ...]] = {}
        for key, rows in candles.items():
            if not isinstance(key, tuple) or len(key) != 2:
                raise MultiInstrumentError("mock key must be (symbol, timeframe)")
            stored[(str(key[0]), str(key[1]))] = tuple(tuple(row) for row in rows)
        self._candles = stored
        self.calls: list[dict[str, object]] = []

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str,
        since: int | None = None,
        limit: int | None = None,
    ) -> list[list[object]]:
        if since is not None and (isinstance(since, bool) or not isinstance(since, int)):
            raise MultiInstrumentError("since must be milliseconds")
        if limit is not None and (
            isinstance(limit, bool) or not isinstance(limit, int) or limit < 0
        ):
            raise MultiInstrumentError("limit must be a whole number")
        self.calls.append(
            {"symbol": symbol, "timeframe": timeframe, "since": since, "limit": limit}
        )
        rows = self._candles.get((symbol, timeframe))
        if rows is None:
            raise MultiInstrumentError(f"mock has no klines for {symbol} {timeframe}")
        selected: list[list[object]] = []
        for row in rows:
            opened = row[0]
            if isinstance(opened, bool) or not isinstance(opened, int):
                raise MultiInstrumentError("kline open must be milliseconds")
            if since is not None and opened < since:
                continue
            selected.append(list(row))
            if limit is not None and len(selected) >= limit:
                break
        return selected


def tape_from_ccxt(
    loader: CcxtKlineLoader,
    spec: SymbolSpec,
    *,
    timeframe: str = "1m",
    since: datetime | None = None,
    limit: int | None = None,
) -> Tape:
    """Load 1-minute klines into a tape. Higher timeframes are not stored."""
    if timeframe != "1m":
        raise MultiInstrumentError(
            "a Flowchart tape is 1-minute bars; higher timeframes are built from those minutes"
        )
    if not isinstance(spec, SymbolSpec):
        raise MultiInstrumentError("ccxt import needs a symbol spec")
    since_ms = None if since is None else _millis(ensure_utc(since))
    ccxt_symbol = spec.ccxt_symbol or spec.symbol
    raw = loader.fetch_ohlcv(ccxt_symbol, timeframe, since_ms, limit)
    if not isinstance(raw, list):
        raise MultiInstrumentError("klines must be a list")
    bars = tuple(_bar_from_row(row) for row in raw)
    return Tape(spec, tuple(bars))


def _bar_from_row(row: object) -> Bar:
    if not isinstance(row, (list, tuple)) or len(row) < 6:
        raise MultiInstrumentError("kline must be open time, open, high, low, close, volume")
    opened_ms = row[0]
    if isinstance(opened_ms, bool) or not isinstance(opened_ms, int):
        raise MultiInstrumentError("kline open must be milliseconds")
    if opened_ms % _MINUTE_MS != 0:
        raise MultiInstrumentError("kline open must fall on a minute")
    open_time = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=opened_ms)
    volume = row[5]
    if isinstance(volume, bool) or not isinstance(volume, int) or volume < 0:
        raise MultiInstrumentError("volume must be a whole number")
    return Bar(
        open_time=open_time,
        close_time=open_time + timedelta(minutes=1),
        open=parse_decimal(row[1], field="open"),
        high=parse_decimal(row[2], field="high"),
        low=parse_decimal(row[3], field="low"),
        close=parse_decimal(row[4], field="close"),
        volume=volume,
    )


def _millis(value: datetime) -> int:
    utc = ensure_utc(value)
    if utc.microsecond != 0:
        raise MultiInstrumentError("since must fall on a millisecond")
    elapsed = utc - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (elapsed.days * 86400 + elapsed.seconds) * 1000 + elapsed.microseconds // 1000
