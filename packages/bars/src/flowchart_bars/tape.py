# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Read and write a flowchart.tape JSON file."""

from __future__ import annotations

import json
import re
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flowchart_bars.model import (
    FORMAT,
    VERSION,
    WEEKDAYS,
    Bar,
    MarketWeek,
    SessionHours,
    SymbolSpec,
    Tape,
    TapeError,
    WeekPoint,
)

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_SYMBOL = re.compile(r"^[A-Z0-9._-]{1,32}$")
_SESSION = re.compile(r"^[a-z0-9_]{1,32}$")


def load_tape(path: str | Path) -> Tape:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return parse_tape(raw)


def dump_tape(tape: Tape, path: str | Path) -> None:
    Path(path).write_text(tape_as_json(tape), encoding="utf-8")


def tape_as_json(tape: Tape) -> str:
    validate_tape(tape)
    return json.dumps(tape_as_obj(tape), indent=2) + "\n"


def parse_tape(raw: object) -> Tape:
    body = _object(raw, "tape")
    _exact(body, ("format", "version", "spec", "bars"), "tape")
    if body["format"] != FORMAT:
        raise TapeError(f"format must be {FORMAT}")
    if type(body["version"]) is not int or body["version"] != VERSION:
        raise TapeError(f"version must be {VERSION}")
    spec = _parse_spec(body["spec"])
    bars_raw = body["bars"]
    if not isinstance(bars_raw, list):
        raise TapeError("bars must be a list")
    bars = tuple(_parse_bar(item, spec, index) for index, item in enumerate(bars_raw))
    tape = Tape(spec=spec, bars=bars)
    validate_tape(tape)
    return tape


def validate_tape(tape: Tape) -> None:
    if not tape.bars:
        raise TapeError("tape must contain at least one bar")
    previous: Bar | None = None
    for bar in tape.bars:
        if bar.close_time - bar.open_time != timedelta(minutes=1):
            raise TapeError("each bar must cover one minute")
        if bar.open_time.second or bar.open_time.microsecond:
            raise TapeError("bar timestamps must fall on a minute")
        for label, value in (
            ("open", bar.open),
            ("high", bar.high),
            ("low", bar.low),
            ("close", bar.close),
        ):
            if not _on_tick(value, tape.spec.tick_size):
                raise TapeError(f"{label} is off the tick grid")
        if previous is not None:
            if bar.open_time <= previous.open_time:
                raise TapeError("bars must be strictly increasing by openTime")
            if bar.open_time < previous.close_time:
                raise TapeError("bars overlap")
        previous = bar


def tape_as_obj(tape: Tape) -> dict:
    spec = tape.spec
    return {
        "format": FORMAT,
        "version": VERSION,
        "spec": {
            "symbol": spec.symbol,
            "tickSize": _format_decimal(spec.tick_size, spec.tick_size),
            "lotSize": spec.lot_size,
            "timezone": spec.timezone.key,
            "sessions": [
                {
                    "name": session.name,
                    "open": _format_hhmm(session.open),
                    "close": _format_hhmm(session.close),
                }
                for session in spec.sessions
            ],
            "market": {
                "open": _point_obj(spec.market.open),
                "close": _point_obj(spec.market.close),
            },
        },
        "bars": [
            {
                "openTime": _format_utc(bar.open_time),
                "closeTime": _format_utc(bar.close_time),
                "open": _format_decimal(bar.open, spec.tick_size),
                "high": _format_decimal(bar.high, spec.tick_size),
                "low": _format_decimal(bar.low, spec.tick_size),
                "close": _format_decimal(bar.close, spec.tick_size),
                "volume": bar.volume,
            }
            for bar in tape.bars
        ],
    }


def _parse_spec(raw: object) -> SymbolSpec:
    body = _object(raw, "spec")
    _exact(body, ("symbol", "tickSize", "lotSize", "timezone", "sessions", "market"), "spec")
    symbol = body["symbol"]
    if not isinstance(symbol, str) or _SYMBOL.fullmatch(symbol) is None:
        raise TapeError("symbol must be 1-32 characters from A-Z, 0-9, '.', '_' or '-'")
    tick = _decimal(body["tickSize"], "tickSize")
    if tick <= 0:
        raise TapeError("tickSize must be positive")
    lot = body["lotSize"]
    if type(lot) is not int or lot <= 0:
        raise TapeError("lotSize must be a positive integer")
    timezone_name = body["timezone"]
    if not isinstance(timezone_name, str):
        raise TapeError("timezone must be an IANA name")
    try:
        tz = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise TapeError(f"unknown timezone {timezone_name}") from exc
    sessions_raw = body["sessions"]
    if not isinstance(sessions_raw, list) or not sessions_raw:
        raise TapeError("sessions must be a non-empty list")
    sessions = tuple(_parse_session(item, index) for index, item in enumerate(sessions_raw))
    return SymbolSpec(
        symbol=symbol,
        tick_size=tick,
        lot_size=lot,
        timezone=tz,
        sessions=sessions,
        market=_parse_market(body["market"]),
    )


def _parse_session(raw: object, index: int) -> SessionHours:
    body = _object(raw, f"sessions[{index}]")
    _exact(body, ("name", "open", "close"), f"sessions[{index}]")
    name = body["name"]
    if not isinstance(name, str) or _SESSION.fullmatch(name) is None:
        raise TapeError(f"sessions[{index}].name must be a lowercase identifier")
    return SessionHours(
        name,
        _hhmm(body["open"], f"sessions[{index}].open"),
        _hhmm(body["close"], f"sessions[{index}].close"),
    )


def _parse_market(raw: object) -> MarketWeek:
    body = _object(raw, "market")
    _exact(body, ("open", "close"), "market")
    return MarketWeek(
        open=_parse_point(body["open"], "market.open"),
        close=_parse_point(body["close"], "market.close"),
    )


def _parse_point(raw: object, label: str) -> WeekPoint:
    body = _object(raw, label)
    _exact(body, ("weekday", "time"), label)
    weekday = body["weekday"]
    if weekday not in WEEKDAYS:
        names = ", ".join(WEEKDAYS)
        raise TapeError(f"{label}.weekday must be one of {names}")
    return WeekPoint(weekday, _hhmm(body["time"], f"{label}.time"))


def _parse_bar(raw: object, spec: SymbolSpec, index: int) -> Bar:
    body = _object(raw, f"bars[{index}]")
    _exact(body, ("openTime", "closeTime", "open", "high", "low", "close", "volume"), f"bars[{index}]")
    volume = body["volume"]
    if type(volume) is not int or volume < 0:
        raise TapeError(f"bars[{index}].volume must be a non-negative integer")
    return Bar(
        open_time=_timestamp(body["openTime"], f"bars[{index}].openTime"),
        close_time=_timestamp(body["closeTime"], f"bars[{index}].closeTime"),
        open=_price(body["open"], spec.tick_size, f"bars[{index}].open"),
        high=_price(body["high"], spec.tick_size, f"bars[{index}].high"),
        low=_price(body["low"], spec.tick_size, f"bars[{index}].low"),
        close=_price(body["close"], spec.tick_size, f"bars[{index}].close"),
        volume=volume,
    )


def _timestamp(raw: object, label: str) -> datetime:
    if not isinstance(raw, str):
        raise TapeError(f"{label} must be a UTC timestamp")
    text = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise TapeError(f"{label} is not an ISO timestamp") from exc
    if parsed.tzinfo is None:
        raise TapeError(f"{label} must include a timezone")
    utc = parsed.astimezone(timezone.utc)
    if utc.second or utc.microsecond:
        raise TapeError(f"{label} must fall on a minute")
    return utc


def _price(raw: object, tick: Decimal, label: str) -> Decimal:
    value = _decimal(raw, label)
    if not _on_tick(value, tick):
        raise TapeError(f"{label} is off the tick grid")
    return value


def _decimal(raw: object, label: str) -> Decimal:
    if not isinstance(raw, str):
        raise TapeError(f"{label} must be a decimal string")
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise TapeError(f"{label} is not a decimal") from exc
    if not value.is_finite():
        raise TapeError(f"{label} must be finite")
    return value


def _hhmm(raw: object, label: str) -> time:
    if not isinstance(raw, str) or _HHMM.fullmatch(raw) is None:
        raise TapeError(f"{label} must be HH:MM")
    hour, minute = raw.split(":")
    return time(int(hour), int(minute))


def _on_tick(price: Decimal, tick: Decimal) -> bool:
    units = price / tick
    return units == units.to_integral_value()


def _format_decimal(value: Decimal, tick: Decimal) -> str:
    exponent = tick.as_tuple().exponent
    places = -exponent if isinstance(exponent, int) and exponent < 0 else 0
    quantum = Decimal(10) ** -places
    return f"{value.quantize(quantum):.{places}f}"


def _format_hhmm(value: time) -> str:
    return f"{value.hour:02d}:{value.minute:02d}"


def _format_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _point_obj(point: WeekPoint) -> dict[str, str]:
    return {"weekday": point.weekday, "time": _format_hhmm(point.time)}


def _object(raw: object, label: str) -> dict:
    if not isinstance(raw, dict):
        raise TapeError(f"{label} must be an object")
    return raw


def _exact(raw: Mapping[str, object], keys: tuple[str, ...], label: str) -> None:
    found = set(raw)
    expected = set(keys)
    if found == expected:
        return
    missing = ", ".join(sorted(expected - found))
    extra = ", ".join(sorted(found - expected))
    detail = []
    if missing:
        detail.append(f"missing {missing}")
    if extra:
        detail.append(f"unexpected {extra}")
    raise TapeError(f"{label}: {'; '.join(detail)}")
