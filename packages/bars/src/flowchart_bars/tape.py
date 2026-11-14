# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""A tape is one symbol and the bars the caller supplies. No market-data file is shipped."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

from flowchart_bars.clock import ensure_utc, format_stamp, parse_stamp
from flowchart_bars.decimals import require_decimal, require_whole
from flowchart_bars.errors import BarsError
from flowchart_bars.spec import SymbolSpec, assert_spec, spec_from_mapping, spec_to_mapping

_TAPE_KEYS = {"format", "version", "spec", "bars"}
_BAR_KEYS = {"openTime", "closeTime", "open", "high", "low", "close", "volume"}
_FORMAT = "flowchart.tape"


@dataclass(frozen=True, slots=True)
class Bar:
    open_time: datetime
    close_time: datetime
    open: str
    high: str
    low: str
    close: str
    volume: str


@dataclass(frozen=True, slots=True)
class Tape:
    spec: SymbolSpec
    bars: tuple[Bar, ...]
    format: str = _FORMAT
    version: int = 1


def load_tape(path: str | Path) -> Tape:
    file = Path(path)
    try:
        text = file.read_text(encoding="utf-8")
    except OSError as exc:
        raise BarsError(f"cannot read tape {file}") from exc
    return tape_from_json(text)


def tape_from_json(text: str) -> Tape:
    if not isinstance(text, str):
        raise BarsError("tape text must be a string", code="invalid_tape")
    try:
        data = json.loads(text, parse_float=_reject_float)
    except BarsError:
        raise
    except json.JSONDecodeError as exc:
        raise BarsError("tape is not JSON", code="invalid_tape") from exc
    return tape_from_mapping(data)


def tape_from_mapping(data: object) -> Tape:
    if not isinstance(data, dict):
        raise BarsError("tape must be an object", code="invalid_tape")
    unknown = set(data) - _TAPE_KEYS
    if unknown:
        names = ", ".join(sorted(str(key) for key in unknown))
        raise BarsError(f"tape has unknown fields: {names}", code="invalid_tape")
    if data.get("format") != _FORMAT or data.get("version") != 1 or isinstance(data.get("version"), bool):
        raise BarsError("tape format must be flowchart.tape version 1", code="invalid_tape")
    spec = spec_from_mapping(data.get("spec"))
    bars_raw = data.get("bars")
    if not isinstance(bars_raw, list):
        raise BarsError("bars must be a list", code="invalid_tape")
    bars = tuple(bar_from_mapping(item) for item in bars_raw)
    tape = Tape(spec=spec, bars=bars)
    assert_tape(tape)
    return tape


def tape_to_json(tape: Tape) -> str:
    assert_tape(tape)
    body = {
        "format": tape.format,
        "version": tape.version,
        "spec": spec_to_mapping(tape.spec),
        "bars": [bar_to_mapping(bar) for bar in tape.bars],
    }
    return json.dumps(body, indent=2) + "\n"


def bar_from_mapping(data: object) -> Bar:
    if not isinstance(data, dict):
        raise BarsError("bar must be an object", code="invalid_bar")
    unknown = set(data) - _BAR_KEYS
    if unknown:
        names = ", ".join(sorted(str(key) for key in unknown))
        raise BarsError(f"bar has unknown fields: {names}", code="invalid_bar")
    missing = _BAR_KEYS - set(data)
    if missing:
        names = ", ".join(sorted(missing))
        raise BarsError(f"bar is missing {names}", code="invalid_bar")
    bar = Bar(
        open_time=parse_stamp(data["openTime"], "openTime"),
        close_time=parse_stamp(data["closeTime"], "closeTime"),
        open=require_decimal(data["open"], "open"),
        high=require_decimal(data["high"], "high"),
        low=require_decimal(data["low"], "low"),
        close=require_decimal(data["close"], "close"),
        volume=require_whole(data["volume"], "volume"),
    )
    _check_bar(bar)
    return bar


def bar_to_mapping(bar: Bar) -> dict[str, str]:
    return {
        "openTime": format_stamp(bar.open_time),
        "closeTime": format_stamp(bar.close_time),
        "open": bar.open,
        "high": bar.high,
        "low": bar.low,
        "close": bar.close,
        "volume": bar.volume,
    }


def make_bar(
    open_time: datetime,
    close_time: datetime,
    price: str,
    *,
    high: str | None = None,
    low: str | None = None,
    close: str | None = None,
    volume: str = "1",
) -> Bar:
    bar = Bar(
        open_time=ensure_utc(open_time, "openTime"),
        close_time=ensure_utc(close_time, "closeTime"),
        open=require_decimal(price, "open"),
        high=require_decimal(high if high is not None else price, "high"),
        low=require_decimal(low if low is not None else price, "low"),
        close=require_decimal(close if close is not None else price, "close"),
        volume=require_whole(volume, "volume"),
    )
    _check_bar(bar)
    return bar


def assert_tape(tape: Tape) -> None:
    if not isinstance(tape, Tape) or tape.format != _FORMAT or tape.version != 1:
        raise BarsError("tape format must be flowchart.tape version 1", code="invalid_tape")
    assert_spec(tape.spec)
    previous_open: datetime | None = None
    previous_close: datetime | None = None
    duration: timedelta | None = None
    for bar in tape.bars:
        _check_bar(bar)
        if previous_open is not None and bar.open_time <= previous_open:
            raise BarsError("bars must be oldest first and unique", code="invalid_bar")
        if previous_close is not None and bar.open_time < previous_close:
            raise BarsError("bars overlap", code="invalid_bar")
        span = bar.close_time - bar.open_time
        if duration is None:
            duration = span
        elif span != duration:
            raise BarsError("bars in one tape must share one duration", code="invalid_bar")
        previous_open = bar.open_time
        previous_close = bar.close_time
    if duration is not None:
        seconds = duration.total_seconds()
        if seconds <= 0 or seconds != int(seconds):
            raise BarsError("bar duration must be a positive whole number of seconds", code="invalid_bar")


def _check_bar(bar: Bar) -> None:
    open_time = ensure_utc(bar.open_time, "openTime")
    close_time = ensure_utc(bar.close_time, "closeTime")
    if close_time <= open_time:
        raise BarsError("closeTime must be after openTime", code="invalid_bar")
    low = Decimal(bar.low)
    high = Decimal(bar.high)
    if low > Decimal(bar.open) or low > Decimal(bar.close) or high < Decimal(bar.open) or high < Decimal(bar.close):
        raise BarsError("high and low must cover the open and the close", code="invalid_bar")
    if high < low:
        raise BarsError("high is below low", code="invalid_bar")


def _reject_float(_text: str) -> float:
    raise BarsError("a JSON number is not allowed; use a decimal string", code="invalid_bar")
