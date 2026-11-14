# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Symbol spec. Prices and sizes stay decimal strings in JSON."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import time
from decimal import Decimal
from typing import Mapping

from flowchart_multi.decimals import format_decimal, parse_decimal
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.times import (
    WEEKDAYS,
    format_hhmm,
    parse_hhmm,
    parse_zone,
)

ASSET_CLASSES = (
    "forex-major",
    "forex-minor",
    "forex-exotic",
    "metal",
    "future",
    "perp",
)
_SYMBOL = re.compile(r"^[A-Z0-9]{2,12}$")
_CURRENCY = re.compile(r"^[A-Z]{2,4}$")
_ALIAS = re.compile(r"^[a-z0-9&]+(?:-[a-z0-9&]+)*$")
_FULL_KEYS = (
    "assetClass",
    "base",
    "quote",
    "pipSize",
    "pointValue",
    "funding",
    "rolloverNote",
    "ccxtSymbol",
    "aliases",
    "description",
)


@dataclass(frozen=True, slots=True)
class WeekTime:
    """A weekday and a minute in the symbol timezone."""

    weekday: str
    time: time

    def __post_init__(self) -> None:
        if self.weekday not in WEEKDAYS:
            raise MultiInstrumentError(f"weekday must be one of {', '.join(WEEKDAYS)}")
        _minute_clock(self.time, "time")


@dataclass(frozen=True, slots=True)
class Session:
    """A named window. The close minute is outside the window.

    When the window crosses midnight, `close` is earlier than `open`.
    Equal open and close means the session covers every minute of the day.
    """

    name: str
    open: time
    close: time

    def __post_init__(self) -> None:
        if not isinstance(self.name, str) or not self.name.strip():
            raise MultiInstrumentError("session name is empty")
        _minute_clock(self.open, "session open")
        _minute_clock(self.close, "session close")


@dataclass(frozen=True, slots=True)
class MarketHours:
    """Week open and week close. The close instant is outside the week."""

    open: WeekTime
    close: WeekTime


@dataclass(frozen=True, slots=True)
class Funding:
    """When a perpetual settles funding. The rate is not stored here."""

    interval_hours: int
    times_utc: tuple[time, ...]
    note: str

    def __post_init__(self) -> None:
        if isinstance(self.interval_hours, bool) or not isinstance(self.interval_hours, int):
            raise MultiInstrumentError("funding intervalHours must be a whole number")
        if self.interval_hours <= 0 or self.interval_hours > 24:
            raise MultiInstrumentError("funding intervalHours must be from 1 to 24")
        if not self.times_utc:
            raise MultiInstrumentError("funding timesUtc is empty")
        for clock in self.times_utc:
            _minute_clock(clock, "funding time")
        if list(self.times_utc) != sorted(self.times_utc):
            raise MultiInstrumentError("funding timesUtc must be in order")
        span = self.interval_hours * 60
        minutes = [clock.hour * 60 + clock.minute for clock in self.times_utc]
        for index, minute in enumerate(minutes):
            nxt = minutes[(index + 1) % len(minutes)]
            if index + 1 == len(minutes):
                nxt += 24 * 60
            if nxt - minute != span:
                raise MultiInstrumentError(
                    "funding timesUtc must be spaced by intervalHours"
                )
        if not isinstance(self.note, str) or not self.note.strip():
            raise MultiInstrumentError("funding note is empty")


@dataclass(frozen=True, slots=True)
class SymbolSpec:
    """One instrument. No prices, no calendar, no funding rate."""

    symbol: str
    asset_class: str
    base: str
    quote: str
    tick_size: Decimal
    lot_size: Decimal
    pip_size: Decimal
    point_value: Decimal
    timezone: str
    sessions: tuple[Session, ...]
    market: MarketHours
    funding: Funding | None
    rollover_note: str | None
    ccxt_symbol: str | None
    aliases: tuple[str, ...]
    description: str

    def __post_init__(self) -> None:
        if not isinstance(self.symbol, str) or _SYMBOL.fullmatch(self.symbol) is None:
            raise MultiInstrumentError(f"symbol {self.symbol!r} is not a registry name")
        if self.asset_class not in ASSET_CLASSES:
            raise MultiInstrumentError(f"unknown asset class {self.asset_class}")
        for label, currency in (("base", self.base), ("quote", self.quote)):
            if not isinstance(currency, str) or _CURRENCY.fullmatch(currency) is None:
                raise MultiInstrumentError(f"{label} must be a currency code")
        for label, amount in (
            ("tickSize", self.tick_size),
            ("lotSize", self.lot_size),
            ("pipSize", self.pip_size),
            ("pointValue", self.point_value),
        ):
            if not isinstance(amount, Decimal) or amount <= 0:
                raise MultiInstrumentError(f"{label} must be a positive decimal")
        steps = self.pip_size / self.tick_size
        if steps != steps.to_integral_value():
            raise MultiInstrumentError("pipSize must be a whole number of ticks")
        parse_zone(self.timezone)
        if not self.sessions:
            raise MultiInstrumentError("sessions is empty")
        names = [session.name for session in self.sessions]
        if len(names) != len(set(names)):
            raise MultiInstrumentError("session names must be unique")
        if not isinstance(self.market, MarketHours):
            raise MultiInstrumentError("market hours are missing")
        if self.funding is not None and not isinstance(self.funding, Funding):
            raise MultiInstrumentError("funding must be a schedule or null")
        if self.rollover_note is not None and (
            not isinstance(self.rollover_note, str) or not self.rollover_note.strip()
        ):
            raise MultiInstrumentError("rolloverNote is empty")
        if self.ccxt_symbol is not None and (
            not isinstance(self.ccxt_symbol, str) or not self.ccxt_symbol.strip()
        ):
            raise MultiInstrumentError("ccxtSymbol is empty")
        for alias in self.aliases:
            if _ALIAS.fullmatch(alias) is None:
                raise MultiInstrumentError(f"alias {alias!r} is not lowercase")
        if len(self.aliases) != len(set(self.aliases)):
            raise MultiInstrumentError("aliases must be unique")
        if not isinstance(self.description, str) or not self.description.strip():
            raise MultiInstrumentError("description is empty")

    def pip_value_quote(self) -> Decimal:
        """Quote-currency value of one pip on one lot."""
        return self.point_value * self.pip_size

    def tick_value_quote(self) -> Decimal:
        """Quote-currency value of one tick on one lot."""
        return self.point_value * self.tick_size


def is_full_spec(data: Mapping[str, object]) -> bool:
    present = [key for key in _FULL_KEYS if key in data]
    if not present:
        return False
    if len(present) != len(_FULL_KEYS):
        missing = [key for key in _FULL_KEYS if key not in data]
        raise MultiInstrumentError(
            "spec is missing " + ", ".join(missing)
        )
    return True


def spec_from_mapping(data: Mapping[str, object]) -> SymbolSpec:
    """Build a spec from the full JSON object."""
    if not isinstance(data, dict):
        raise MultiInstrumentError("spec must be an object or a symbol name")
    is_full_spec(data)
    funding_raw = data.get("funding")
    rollover = data.get("rolloverNote")
    ccxt = data.get("ccxtSymbol")
    return SymbolSpec(
        symbol=_text(data, "symbol"),
        asset_class=_text(data, "assetClass"),
        base=_text(data, "base"),
        quote=_text(data, "quote"),
        tick_size=parse_decimal(data.get("tickSize"), field="tickSize"),
        lot_size=parse_decimal(data.get("lotSize"), field="lotSize"),
        pip_size=parse_decimal(data.get("pipSize"), field="pipSize"),
        point_value=parse_decimal(data.get("pointValue"), field="pointValue"),
        timezone=_text(data, "timezone"),
        sessions=_sessions(data.get("sessions")),
        market=_market(data.get("market")),
        funding=None if funding_raw is None else _funding(funding_raw),
        rollover_note=None if rollover is None else _note(rollover, "rolloverNote"),
        ccxt_symbol=None if ccxt is None else _note(ccxt, "ccxtSymbol"),
        aliases=_aliases(data.get("aliases")),
        description=_text(data, "description"),
    )


def spec_to_mapping(spec: SymbolSpec) -> dict[str, object]:
    funding: object
    if spec.funding is None:
        funding = None
    else:
        funding = {
            "intervalHours": spec.funding.interval_hours,
            "timesUtc": [format_hhmm(clock) for clock in spec.funding.times_utc],
            "note": spec.funding.note,
        }
    return {
        "symbol": spec.symbol,
        "assetClass": spec.asset_class,
        "base": spec.base,
        "quote": spec.quote,
        "tickSize": format_decimal(spec.tick_size),
        "lotSize": format_decimal(spec.lot_size),
        "pipSize": format_decimal(spec.pip_size),
        "pointValue": format_decimal(spec.point_value),
        "timezone": spec.timezone,
        "sessions": [
            {
                "name": session.name,
                "open": format_hhmm(session.open),
                "close": format_hhmm(session.close),
            }
            for session in spec.sessions
        ],
        "market": {
            "open": {
                "weekday": spec.market.open.weekday,
                "time": format_hhmm(spec.market.open.time),
            },
            "close": {
                "weekday": spec.market.close.weekday,
                "time": format_hhmm(spec.market.close.time),
            },
        },
        "funding": funding,
        "rolloverNote": spec.rollover_note,
        "ccxtSymbol": spec.ccxt_symbol,
        "aliases": list(spec.aliases),
        "description": spec.description,
    }


def _text(data: Mapping[str, object], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise MultiInstrumentError(f"{key} must be text")
    return value


def _note(value: object, key: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MultiInstrumentError(f"{key} must be text or null")
    return value


def _sessions(value: object) -> tuple[Session, ...]:
    if not isinstance(value, list) or not value:
        raise MultiInstrumentError("sessions must be a list")
    sessions = []
    for item in value:
        if not isinstance(item, dict):
            raise MultiInstrumentError("session must be an object")
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            raise MultiInstrumentError("session name must be text")
        sessions.append(
            Session(
                name,
                parse_hhmm(item.get("open"), field="session open"),
                parse_hhmm(item.get("close"), field="session close"),
            )
        )
    return tuple(sessions)


def _market(value: object) -> MarketHours:
    if not isinstance(value, dict):
        raise MultiInstrumentError("market must be an object")
    return MarketHours(_week_time(value.get("open"), "market open"), _week_time(value.get("close"), "market close"))


def _week_time(value: object, field: str) -> WeekTime:
    if not isinstance(value, dict):
        raise MultiInstrumentError(f"{field} must be an object")
    weekday = value.get("weekday")
    if not isinstance(weekday, str):
        raise MultiInstrumentError(f"{field} weekday must be text")
    return WeekTime(weekday, parse_hhmm(value.get("time"), field=f"{field} time"))


def _funding(value: object) -> Funding:
    if not isinstance(value, dict):
        raise MultiInstrumentError("funding must be an object or null")
    times = value.get("timesUtc")
    if not isinstance(times, list):
        raise MultiInstrumentError("funding timesUtc must be a list")
    note = value.get("note")
    if not isinstance(note, str):
        raise MultiInstrumentError("funding note must be text")
    interval = value.get("intervalHours")
    if isinstance(interval, bool) or not isinstance(interval, int):
        raise MultiInstrumentError("funding intervalHours must be a whole number")
    return Funding(
        interval,
        tuple(parse_hhmm(item, field="funding time") for item in times),
        note,
    )


def _aliases(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise MultiInstrumentError("aliases must be a list")
    aliases = []
    for item in value:
        if not isinstance(item, str):
            raise MultiInstrumentError("alias must be text")
        aliases.append(item)
    return tuple(aliases)


def _minute_clock(value: time, field: str) -> None:
    if value.second != 0 or value.microsecond != 0:
        raise MultiInstrumentError(f"{field} must be HH:MM")
