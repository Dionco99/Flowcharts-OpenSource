# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Import a 1-minute history the user already has.

The file is text the caller supplies. This module does not download one.
"""

from __future__ import annotations

import csv
import io
from datetime import timedelta
from pathlib import Path

from flowchart_multi.decimals import parse_decimal
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.spec import SymbolSpec
from flowchart_multi.tape import Bar, Tape
from flowchart_multi.times import parse_timestamp

_REQUIRED = ("openTime", "open", "high", "low", "close", "volume")
_ALLOWED = frozenset((*_REQUIRED, "closeTime", "symbol"))


def import_csv(source: str | Path, spec: SymbolSpec) -> Tape:
    """Build a tape from CSV text or a path.

    Columns are `openTime,open,high,low,close,volume`. `closeTime` and
    `symbol` are optional. Prices are decimal strings. `openTime` is
    `YYYY-MM-DDTHH:MM:SSZ`.
    """
    if not isinstance(spec, SymbolSpec):
        raise MultiInstrumentError("csv import needs a symbol spec")
    text = _text(source)
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        raise MultiInstrumentError("csv header is missing") from None
    fields = [name.strip() for name in header]
    if any(name == "" for name in fields):
        raise MultiInstrumentError("csv header has a blank column")
    if len(fields) != len(set(fields)):
        raise MultiInstrumentError("csv header repeats a column")
    unknown = [name for name in fields if name not in _ALLOWED]
    if unknown:
        raise MultiInstrumentError("csv has unknown columns: " + ", ".join(unknown))
    missing = [name for name in _REQUIRED if name not in fields]
    if missing:
        raise MultiInstrumentError("csv is missing " + ", ".join(missing))
    bars: list[Bar] = []
    previous = None
    for line_number, raw in enumerate(reader, start=2):
        if not any(cell.strip() for cell in raw):
            continue
        if len(raw) != len(fields):
            raise MultiInstrumentError(f"line {line_number} has {len(raw)} columns")
        row = {name: value.strip() for name, value in zip(fields, raw)}
        bar = _row(row, spec, line_number)
        if previous is not None and bar.open_time <= previous:
            raise MultiInstrumentError(f"line {line_number} bars must be oldest first")
        previous = bar.open_time
        bars.append(bar)
    if not bars:
        raise MultiInstrumentError("csv has no bars")
    return Tape(spec, tuple(bars))


def _text(source: str | Path) -> str:
    if isinstance(source, Path):
        return source.read_text(encoding="utf-8-sig")
    if isinstance(source, str):
        return source.lstrip("\ufeff")
    raise MultiInstrumentError("csv source must be text or a path")


def _row(row: dict[str, str], spec: SymbolSpec, line_number: int) -> Bar:
    def cell(name: str) -> str:
        return row.get(name, "")

    field = f"line {line_number}"
    symbol = cell("symbol")
    if symbol and symbol != spec.symbol:
        raise MultiInstrumentError(f"{field} symbol does not match {spec.symbol}")
    try:
        open_time = parse_timestamp(cell("openTime"), field=f"{field} openTime")
        close_text = cell("closeTime")
        close_time = (
            open_time + timedelta(minutes=1)
            if close_text == ""
            else parse_timestamp(close_text, field=f"{field} closeTime")
        )
        if close_time != open_time + timedelta(minutes=1):
            raise MultiInstrumentError(f"{field} closeTime must be one minute after openTime")
        return Bar(
            open_time=open_time,
            close_time=close_time,
            open=parse_decimal(cell("open"), field=f"{field} open"),
            high=parse_decimal(cell("high"), field=f"{field} high"),
            low=parse_decimal(cell("low"), field=f"{field} low"),
            close=parse_decimal(cell("close"), field=f"{field} close"),
            volume=_volume(cell("volume"), field),
        )
    except MultiInstrumentError as exc:
        if str(exc).startswith("line "):
            raise
        raise MultiInstrumentError(f"{field} {exc}") from exc


def _volume(value: str, field: str) -> int:
    if value == "" or not value.isascii() or not value.isdigit():
        raise MultiInstrumentError(f"{field} volume must be a whole number")
    return int(value)
