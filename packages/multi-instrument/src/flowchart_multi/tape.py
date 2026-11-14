# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""One-minute tapes and the cursor rule shared with packages/bars.

A bar joins the window when its close time is at or before the cursor.
5m, 15m, 1h, and 4h buckets are built from those minutes. The bucket stays
out of the window until the cursor reaches its close. A missing minute does
not hold the bucket open past that close.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import MappingProxyType

from flowchart_multi.decimals import format_decimal, parse_decimal
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.registry import get_symbol
from flowchart_multi.spec import SymbolSpec, is_full_spec, spec_from_mapping, spec_to_mapping
from flowchart_multi.times import (
    ensure_utc,
    format_timestamp,
    local_instant,
    parse_timestamp,
    parse_zone,
)

TIMEFRAME_NAMES = ("1m", "5m", "15m", "1h", "4h")
TIMEFRAMES = MappingProxyType(
    {
        "1m": timedelta(minutes=1),
        "5m": timedelta(minutes=5),
        "15m": timedelta(minutes=15),
        "1h": timedelta(hours=1),
        "4h": timedelta(hours=4),
    }
)
_TAPE_KEYS = {"format", "version", "spec", "bars"}
_SPEC_KEYS = {
    "symbol",
    "assetClass",
    "base",
    "quote",
    "tickSize",
    "lotSize",
    "pipSize",
    "pointValue",
    "timezone",
    "sessions",
    "market",
    "funding",
    "rolloverNote",
    "ccxtSymbol",
    "aliases",
    "description",
}
_BAR_KEYS = {"openTime", "closeTime", "open", "high", "low", "close", "volume"}


@dataclass(frozen=True, slots=True)
class Bar:
    """One OHLC bar. Prices are decimals. Times are UTC."""

    open_time: datetime
    close_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int

    def __post_init__(self) -> None:
        open_time = _minute(self.open_time, "openTime")
        close_time = _minute(self.close_time, "closeTime")
        object.__setattr__(self, "open_time", open_time)
        object.__setattr__(self, "close_time", close_time)
        if close_time <= open_time:
            raise MultiInstrumentError("closeTime must be after openTime")
        for label, price in (
            ("open", self.open),
            ("high", self.high),
            ("low", self.low),
            ("close", self.close),
        ):
            if not isinstance(price, Decimal) or price <= 0:
                raise MultiInstrumentError(f"{label} must be a positive decimal")
        if self.low > self.high or self.low > self.open or self.low > self.close:
            raise MultiInstrumentError("low is above another price")
        if self.high < self.open or self.high < self.close:
            raise MultiInstrumentError("high is below another price")
        if isinstance(self.volume, bool) or not isinstance(self.volume, int) or self.volume < 0:
            raise MultiInstrumentError("volume must be a whole number")


@dataclass(frozen=True, slots=True)
class Tape:
    """A symbol spec and its 1-minute history, oldest first."""

    spec: SymbolSpec
    bars: tuple[Bar, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.spec, SymbolSpec):
            raise MultiInstrumentError("tape spec is missing")
        previous: datetime | None = None
        for bar in self.bars:
            if not isinstance(bar, Bar):
                raise MultiInstrumentError("tape bars must be bars")
            if bar.close_time - bar.open_time != timedelta(minutes=1):
                raise MultiInstrumentError("a tape bar is one minute")
            if previous is not None and bar.open_time <= previous:
                raise MultiInstrumentError("bars must be oldest first")
            previous = bar.open_time


@dataclass(frozen=True, slots=True)
class Window:
    """Closed bars of one timeframe at one cursor."""

    spec: SymbolSpec
    timeframe: str
    bars: tuple[Bar, ...]


def load_tape(path: str | Path) -> Tape:
    return tape_from_json(Path(path).read_text(encoding="utf-8"))


def tape_from_json(text: str) -> Tape:
    if not isinstance(text, str):
        raise MultiInstrumentError("tape must be text")
    try:
        data = json.loads(text, parse_float=_reject_float)
    except MultiInstrumentError:
        raise
    except json.JSONDecodeError as exc:
        raise MultiInstrumentError("tape is not JSON") from exc
    if not isinstance(data, dict):
        raise MultiInstrumentError("tape must be an object")
    unknown = set(data) - _TAPE_KEYS
    if unknown:
        raise MultiInstrumentError("tape has unknown fields: " + ", ".join(sorted(unknown)))
    if data.get("format") != "flowchart.tape":
        raise MultiInstrumentError("format must be flowchart.tape")
    if data.get("version") != 1:
        raise MultiInstrumentError("version must be 1")
    bars = data.get("bars")
    if not isinstance(bars, list):
        raise MultiInstrumentError("bars must be a list")
    return Tape(
        resolve_spec(data.get("spec")),
        tuple(bar_from_mapping(item) for item in bars),
    )


def tape_to_json(tape: Tape) -> str:
    payload = {
        "format": "flowchart.tape",
        "version": 1,
        "spec": spec_to_mapping(tape.spec),
        "bars": [bar_to_mapping(bar) for bar in tape.bars],
    }
    return json.dumps(payload, indent=2) + "\n"


def resolve_spec(raw: object) -> SymbolSpec:
    """A registry name, or a spec object that must agree with the registry.

    A symbol this registry does not know needs the full spec. A known symbol
    always uses the registry spec. A repeated spec must not disagree with it.
    """
    if isinstance(raw, SymbolSpec):
        return raw
    if isinstance(raw, str):
        return get_symbol(raw)
    if not isinstance(raw, dict):
        raise MultiInstrumentError("spec must be an object or a symbol name")
    unknown = set(raw) - _SPEC_KEYS
    if unknown:
        raise MultiInstrumentError("spec has unknown fields: " + ", ".join(sorted(unknown)))
    symbol = raw.get("symbol")
    if not isinstance(symbol, str):
        raise MultiInstrumentError("symbol must be text")
    try:
        known = get_symbol(symbol)
    except MultiInstrumentError:
        known = None
    if known is not None:
        parsed = spec_from_mapping({**spec_to_mapping(known), **raw})
        if parsed != known:
            raise MultiInstrumentError(f"{known.symbol} spec does not match the registry")
        return known
    if not is_full_spec(raw):
        raise MultiInstrumentError(
            "unknown symbol needs assetClass, base, quote, pipSize, pointValue, "
            "funding, rolloverNote, ccxtSymbol, aliases, and description"
        )
    return spec_from_mapping(raw)


def bar_from_mapping(data: object) -> Bar:
    if not isinstance(data, dict):
        raise MultiInstrumentError("bar must be an object")
    unknown = set(data) - _BAR_KEYS
    if unknown:
        raise MultiInstrumentError("bar has unknown fields: " + ", ".join(sorted(unknown)))
    volume = data.get("volume")
    if isinstance(volume, bool) or not isinstance(volume, int) or volume < 0:
        raise MultiInstrumentError("volume must be a whole number")
    return Bar(
        open_time=parse_timestamp(data.get("openTime"), field="openTime"),
        close_time=parse_timestamp(data.get("closeTime"), field="closeTime"),
        open=parse_decimal(data.get("open"), field="open"),
        high=parse_decimal(data.get("high"), field="high"),
        low=parse_decimal(data.get("low"), field="low"),
        close=parse_decimal(data.get("close"), field="close"),
        volume=volume,
    )


def bar_to_mapping(bar: Bar) -> dict[str, object]:
    return {
        "openTime": format_timestamp(bar.open_time),
        "closeTime": format_timestamp(bar.close_time),
        "open": format_decimal(bar.open),
        "high": format_decimal(bar.high),
        "low": format_decimal(bar.low),
        "close": format_decimal(bar.close),
        "volume": bar.volume,
    }


def window_at(tape: Tape, cursor: datetime, timeframe: str) -> Window:
    """Closed bars of `timeframe` whose close is at or before `cursor`."""
    closed, _forming = _split(tape, cursor, timeframe)
    return Window(tape.spec, timeframe, closed)


def forming_bar(tape: Tape, cursor: datetime, timeframe: str) -> Bar | None:
    """The open bucket, built only from minutes the cursor has already closed.

    A 1-minute forming bar is absent: the tape stores closed minutes, and the
    minute that contains the cursor is not one of them.
    """
    _closed, forming = _split(tape, cursor, timeframe)
    return forming


def next_close_after(bars: tuple[Bar, ...], cursor: datetime) -> datetime | None:
    """The next 1-minute close strictly after `cursor`."""
    index = _closed_count(bars, cursor)
    if index >= len(bars):
        return None
    return bars[index].close_time


def _split(tape: Tape, cursor: datetime, timeframe: str) -> tuple[tuple[Bar, ...], Bar | None]:
    if timeframe not in TIMEFRAMES:
        names = ", ".join(TIMEFRAME_NAMES)
        raise MultiInstrumentError(f"timeframe must be one of {names}")
    cut = _closed_count(tape.bars, cursor)
    minutes = tape.bars[:cut]
    if timeframe == "1m":
        return minutes, None
    duration = TIMEFRAMES[timeframe]
    groups: dict[datetime, list[Bar]] = {}
    order: list[datetime] = []
    for bar in minutes:
        start = bucket_start(bar.open_time, tape.spec, duration)
        if start not in groups:
            groups[start] = []
            order.append(start)
        groups[start].append(bar)
    closed: list[Bar] = []
    forming: Bar | None = None
    cursor_utc = ensure_utc(cursor)
    for start in order:
        end = start + duration
        aggregated = _aggregate(groups[start], start, end)
        if end <= cursor_utc:
            closed.append(aggregated)
        else:
            forming = aggregated
    return tuple(closed), forming


def bucket_start(open_time: datetime, spec: SymbolSpec, duration: timedelta) -> datetime:
    """Floor a minute onto the market-open grid, in real time.

    The anchor is the market open's time of day. Across a daylight-saving
    change the next boundary is still one timeframe of real time later.
    """
    if duration <= timedelta(0):
        raise MultiInstrumentError("timeframe must be positive")
    zone = parse_zone(spec.timezone)
    opened = ensure_utc(open_time)
    local = opened.astimezone(zone)
    anchor: datetime | None = None
    for delta in (0, 1):
        day = local.date() - timedelta(days=delta)
        candidate = ensure_utc(local_instant(day, spec.market.open.time, zone))
        if candidate <= opened:
            anchor = candidate
            break
    if anchor is None:
        raise MultiInstrumentError("could not place a bucket")
    steps = (opened - anchor) // duration
    return anchor + steps * duration


def _aggregate(minutes: list[Bar], start: datetime, end: datetime) -> Bar:
    ordered = sorted(minutes, key=lambda bar: bar.open_time)
    return Bar(
        open_time=start,
        close_time=end,
        open=ordered[0].open,
        high=max(bar.high for bar in ordered),
        low=min(bar.low for bar in ordered),
        close=ordered[-1].close,
        volume=sum(bar.volume for bar in ordered),
    )


def _closed_count(bars: tuple[Bar, ...], cursor: datetime) -> int:
    cursor_utc = ensure_utc(cursor)
    lo = 0
    hi = len(bars)
    while lo < hi:
        mid = (lo + hi) // 2
        if bars[mid].close_time <= cursor_utc:
            lo = mid + 1
        else:
            hi = mid
    return lo


def _minute(value: datetime, field: str) -> datetime:
    if not isinstance(value, datetime):
        raise MultiInstrumentError(f"{field} must be a timestamp")
    utc = ensure_utc(value)
    if utc.second != 0 or utc.microsecond != 0:
        raise MultiInstrumentError(f"{field} must fall on a minute")
    return utc


def _reject_float(value: str) -> float:
    raise MultiInstrumentError(
        f"JSON number {value} is not allowed; prices are decimal strings"
    )
