# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Symbol spec. Session clocks and the market week live in the symbol's zone."""

from __future__ import annotations

from dataclasses import dataclass
from zoneinfo import ZoneInfo

from flowchart_bars.clock import parse_clock, require_weekday, zone
from flowchart_bars.decimals import require_positive
from flowchart_bars.errors import BarsError

_SPEC_KEYS = {"symbol", "tickSize", "lotSize", "timezone", "sessions", "market"}
_CLOCK_KEYS = {"weekday", "time"}
_SESSION_KEYS = {"open", "close"}
_MARKET_KEYS = {"open", "close"}


@dataclass(frozen=True, slots=True)
class Clock:
    weekday: str
    time: str

    def hour_minute(self) -> tuple[int, int]:
        return parse_clock(self.time, "market time")


@dataclass(frozen=True, slots=True)
class SessionHours:
    open: str
    close: str

    def open_clock(self) -> tuple[int, int]:
        return parse_clock(self.open, "session open")


@dataclass(frozen=True, slots=True)
class MarketHours:
    open: Clock
    close: Clock


@dataclass(frozen=True, slots=True)
class SymbolSpec:
    symbol: str
    tick_size: str
    lot_size: str
    timezone: str
    sessions: dict[str, SessionHours]
    market: MarketHours

    def zone(self) -> ZoneInfo:
        return zone(self.timezone)

    def anchor(self, session: str | None = None) -> tuple[int, int]:
        """Daily open clock. The market open, or a named session's open."""
        if session is None:
            return self.market.open.hour_minute()
        hours = self.sessions.get(session)
        if hours is None:
            raise BarsError(f"unknown session {session}")
        return hours.open_clock()


def eurusd_spec() -> SymbolSpec:
    """Liquid FX sample. Asia 17:00–03:00, London 03:00–12:00, New York 08:00–17:00."""
    return SymbolSpec(
        symbol="EURUSD",
        tick_size="0.00001",
        lot_size="100000",
        timezone="America/New_York",
        sessions={
            "Asia": SessionHours("17:00", "03:00"),
            "London": SessionHours("03:00", "12:00"),
            "NewYork": SessionHours("08:00", "17:00"),
        },
        market=MarketHours(
            open=Clock("Sun", "17:00"),
            close=Clock("Fri", "17:00"),
        ),
    )


def spec_from_mapping(data: object) -> SymbolSpec:
    raw = _object(data, _SPEC_KEYS, "spec")
    symbol = raw["symbol"]
    if not isinstance(symbol, str) or not symbol.strip():
        raise BarsError("symbol is required")
    timezone = raw["timezone"]
    if not isinstance(timezone, str) or not timezone:
        raise BarsError("timezone is required")
    zone(timezone)
    sessions_raw = raw["sessions"]
    if not isinstance(sessions_raw, dict):
        raise BarsError("sessions must be an object")
    sessions: dict[str, SessionHours] = {}
    for name, body in sessions_raw.items():
        if not isinstance(name, str) or not name:
            raise BarsError("session name is required")
        fields = _object(body, _SESSION_KEYS, f"{name} session")
        open_text = fields["open"]
        close_text = fields["close"]
        parse_clock(open_text, f"{name} open")
        parse_clock(close_text, f"{name} close")
        sessions[name] = SessionHours(str(open_text), str(close_text))
    market_raw = _object(raw["market"], _MARKET_KEYS, "market")
    spec = SymbolSpec(
        symbol=symbol,
        tick_size=require_positive(raw["tickSize"], "tickSize"),
        lot_size=require_positive(raw["lotSize"], "lotSize"),
        timezone=timezone,
        sessions=sessions,
        market=MarketHours(
            open=_clock(market_raw["open"], "market open"),
            close=_clock(market_raw["close"], "market close"),
        ),
    )
    return spec


def spec_to_mapping(spec: SymbolSpec) -> dict[str, object]:
    return {
        "symbol": spec.symbol,
        "tickSize": spec.tick_size,
        "lotSize": spec.lot_size,
        "timezone": spec.timezone,
        "sessions": {
            name: {"open": hours.open, "close": hours.close}
            for name, hours in spec.sessions.items()
        },
        "market": {
            "open": {"weekday": spec.market.open.weekday, "time": spec.market.open.time},
            "close": {"weekday": spec.market.close.weekday, "time": spec.market.close.time},
        },
    }


def _clock(data: object, label: str) -> Clock:
    fields = _object(data, _CLOCK_KEYS, label)
    weekday = require_weekday(fields["weekday"], f"{label} weekday")
    time_text = fields["time"]
    parse_clock(time_text, f"{label} time")
    return Clock(weekday, str(time_text))


def _object(data: object, keys: set[str], label: str) -> dict[str, object]:
    if not isinstance(data, dict):
        raise BarsError(f"{label} must be an object")
    unknown = set(data) - keys
    if unknown:
        names = ", ".join(sorted(str(key) for key in unknown))
        raise BarsError(f"{label} has unknown fields: {names}")
    missing = keys - set(data)
    if missing:
        names = ", ".join(sorted(missing))
        raise BarsError(f"{label} is missing {names}")
    return data


def assert_spec(spec: SymbolSpec) -> None:
    if not isinstance(spec, SymbolSpec):
        raise BarsError("spec is required")
    spec.zone()
    spec.market.open.hour_minute()
    spec.market.close.hour_minute()
    for name, hours in spec.sessions.items():
        hours.open_clock()
        parse_clock(hours.close, f"{name} close")
