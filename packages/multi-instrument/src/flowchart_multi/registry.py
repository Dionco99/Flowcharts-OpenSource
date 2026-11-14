# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Symbol specs for the desk. No prices and no contract calendar.

Forex sessions follow the stage-1 New York clock: Asia 17:00–03:00,
London 03:00–12:00, New York 08:00–17:00, week Sunday 17:00 to Friday 17:00.
Futures use the CME electronic week, Sunday 18:00 to Friday 17:00, with the
17:00–18:00 halt outside the session. Perpetuals stay open and settle funding
on an 8-hour UTC schedule. The funding rate is not part of the spec.
"""

from __future__ import annotations

from datetime import time
from decimal import Decimal

from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.spec import Funding, MarketHours, Session, SymbolSpec, WeekTime

_FX_ZONE = "America/New_York"
_FX_SESSIONS = (
    Session("Asia", time(17, 0), time(3, 0)),
    Session("London", time(3, 0), time(12, 0)),
    Session("New York", time(8, 0), time(17, 0)),
)
_FX_MARKET = MarketHours(
    WeekTime("Sun", time(17, 0)),
    WeekTime("Fri", time(17, 0)),
)
_FUTURE_SESSIONS = (Session("Electronic", time(18, 0), time(17, 0)),)
_FUTURE_MARKET = MarketHours(
    WeekTime("Sun", time(18, 0)),
    WeekTime("Fri", time(17, 0)),
)
_PERP_SESSIONS = (Session("Continuous", time(0, 0), time(0, 0)),)
_PERP_MARKET = MarketHours(
    WeekTime("Sun", time(0, 0)),
    WeekTime("Sun", time(0, 0)),
)
_FUNDING_NOTE = (
    "Funding settles every 8 hours at 00:00, 08:00, and 16:00 UTC. "
    "The rate is not in this registry. The desk supplies the venue rate."
)
_PERP_FUNDING = Funding(
    8,
    (time(0, 0), time(8, 0), time(16, 0)),
    _FUNDING_NOTE,
)
_WIDE_QUOTES = frozenset({"JPY", "HUF", "THB", "INR"})
_CURRENCY = {
    "EUR": "Euro",
    "GBP": "British pound",
    "USD": "US dollar",
    "JPY": "Japanese yen",
    "CHF": "Swiss franc",
    "AUD": "Australian dollar",
    "NZD": "New Zealand dollar",
    "CAD": "Canadian dollar",
    "TRY": "Turkish lira",
    "ZAR": "South African rand",
    "MXN": "Mexican peso",
    "SEK": "Swedish krona",
    "NOK": "Norwegian krone",
    "DKK": "Danish krone",
    "PLN": "Polish zloty",
    "HUF": "Hungarian forint",
    "SGD": "Singapore dollar",
    "HKD": "Hong Kong dollar",
    "CNH": "Offshore Chinese yuan",
    "THB": "Thai baht",
    "INR": "Indian rupee",
    "XAU": "Gold",
    "XAG": "Silver",
    "BTC": "Bitcoin",
    "ETH": "Ether",
    "USDT": "Tether",
}

_MAJORS = (
    ("EURUSD", ("euro",)),
    ("GBPUSD", ("cable", "sterling", "pound")),
    ("AUDUSD", ("aussie",)),
    ("NZDUSD", ("kiwi",)),
    ("USDJPY", ("yen",)),
    ("USDCHF", ("swissy", "swiss")),
    ("USDCAD", ("loonie",)),
)
_MINORS = (
    "EURGBP",
    "EURJPY",
    "EURCHF",
    "EURAUD",
    "EURCAD",
    "EURNZD",
    "GBPJPY",
    "GBPCHF",
    "GBPAUD",
    "GBPCAD",
    "GBPNZD",
    "AUDJPY",
    "AUDCHF",
    "AUDCAD",
    "AUDNZD",
    "NZDJPY",
    "NZDCHF",
    "NZDCAD",
    "CADJPY",
    "CADCHF",
    "CHFJPY",
)
_EXOTICS = (
    "USDTRY",
    "EURTRY",
    "GBPTRY",
    "USDZAR",
    "EURZAR",
    "USDMXN",
    "USDSEK",
    "EURSEK",
    "USDNOK",
    "EURNOK",
    "USDDKK",
    "USDPLN",
    "EURPLN",
    "USDHUF",
    "USDSGD",
    "USDHKD",
    "USDCNH",
    "USDTHB",
    "USDINR",
)


def _fx(symbol: str, asset_class: str, aliases: tuple[str, ...] = ()) -> SymbolSpec:
    base, quote = symbol[:3], symbol[3:]
    wide = quote in _WIDE_QUOTES
    tick = Decimal("0.001") if wide else Decimal("0.00001")
    pip = Decimal("0.01") if wide else Decimal("0.0001")
    lot = Decimal("100000")
    return SymbolSpec(
        symbol=symbol,
        asset_class=asset_class,
        base=base,
        quote=quote,
        tick_size=tick,
        lot_size=lot,
        pip_size=pip,
        point_value=lot,
        timezone=_FX_ZONE,
        sessions=_FX_SESSIONS,
        market=_FX_MARKET,
        funding=None,
        rollover_note=None,
        ccxt_symbol=f"{base}/{quote}",
        aliases=aliases,
        description=f"{_CURRENCY[base]} / {_CURRENCY[quote]}",
    )


def _future_note(root: str, name: str) -> str:
    return (
        f"{name}, root {root}. One lot is one contract. "
        "The desk chooses the expiry and the roll. "
        "This registry has no contract calendar and no settlement prices."
    )


def _catalog() -> tuple[SymbolSpec, ...]:
    specs: list[SymbolSpec] = [_fx(symbol, "forex-major", aliases) for symbol, aliases in _MAJORS]
    specs.extend(_fx(symbol, "forex-minor") for symbol in _MINORS)
    specs.extend(_fx(symbol, "forex-exotic") for symbol in _EXOTICS)
    specs.append(
        SymbolSpec(
            symbol="XAUUSD",
            asset_class="metal",
            base="XAU",
            quote="USD",
            tick_size=Decimal("0.01"),
            lot_size=Decimal("100"),
            pip_size=Decimal("0.01"),
            point_value=Decimal("100"),
            timezone=_FX_ZONE,
            sessions=_FX_SESSIONS,
            market=_FX_MARKET,
            funding=None,
            rollover_note=None,
            ccxt_symbol="XAU/USD",
            aliases=("gold", "spot-gold"),
            description="Spot gold / US dollar",
        )
    )
    specs.append(
        SymbolSpec(
            symbol="XAGUSD",
            asset_class="metal",
            base="XAG",
            quote="USD",
            tick_size=Decimal("0.001"),
            lot_size=Decimal("5000"),
            pip_size=Decimal("0.001"),
            point_value=Decimal("5000"),
            timezone=_FX_ZONE,
            sessions=_FX_SESSIONS,
            market=_FX_MARKET,
            funding=None,
            rollover_note=None,
            ccxt_symbol="XAG/USD",
            aliases=("silver", "spot-silver"),
            description="Spot silver / US dollar",
        )
    )
    futures = (
        (
            "GC",
            Decimal("0.1"),
            Decimal("100"),
            "COMEX gold future",
            ("comex-gold", "gold-future"),
            _future_note("GC", "COMEX gold future"),
        ),
        (
            "ES",
            Decimal("0.25"),
            Decimal("50"),
            "CME E-mini S&P 500 future",
            ("sp500", "e-mini", "sandp"),
            _future_note("ES", "CME E-mini S&P 500 future"),
        ),
        (
            "NQ",
            Decimal("0.25"),
            Decimal("20"),
            "CME E-mini Nasdaq-100 future",
            ("nasdaq", "nasdaq-100"),
            _future_note("NQ", "CME E-mini Nasdaq-100 future"),
        ),
        (
            "CL",
            Decimal("0.01"),
            Decimal("1000"),
            "NYMEX WTI crude oil future",
            ("crude", "wti", "oil"),
            _future_note("CL", "NYMEX WTI crude oil future"),
        ),
    )
    for symbol, tick, point, description, aliases, note in futures:
        specs.append(
            SymbolSpec(
                symbol=symbol,
                asset_class="future",
                base=symbol,
                quote="USD",
                tick_size=tick,
                lot_size=Decimal("1"),
                pip_size=tick,
                point_value=point,
                timezone=_FX_ZONE,
                sessions=_FUTURE_SESSIONS,
                market=_FUTURE_MARKET,
                funding=None,
                rollover_note=note,
                ccxt_symbol=None,
                aliases=aliases,
                description=description,
            )
        )
    perps = (
        ("BTCUSDT", "BTC", Decimal("0.1"), ("btc", "bitcoin", "btc-perp")),
        ("ETHUSDT", "ETH", Decimal("0.01"), ("eth", "ethereum", "ether", "eth-perp")),
    )
    for symbol, base, tick, aliases in perps:
        specs.append(
            SymbolSpec(
                symbol=symbol,
                asset_class="perp",
                base=base,
                quote="USDT",
                tick_size=tick,
                lot_size=Decimal("1"),
                pip_size=tick,
                point_value=Decimal("1"),
                timezone="UTC",
                sessions=_PERP_SESSIONS,
                market=_PERP_MARKET,
                funding=_PERP_FUNDING,
                rollover_note=None,
                ccxt_symbol=f"{base}/USDT:USDT",
                aliases=aliases,
                description=f"{_CURRENCY[base]} perpetual / Tether",
            )
        )
    return tuple(specs)


def _index(catalog: tuple[SymbolSpec, ...]) -> dict[str, SymbolSpec]:
    found: dict[str, SymbolSpec] = {}
    for spec in catalog:
        keys = [spec.symbol, *spec.aliases]
        if spec.ccxt_symbol is not None:
            keys.append(spec.ccxt_symbol)
        for key in keys:
            folded = key.casefold()
            current = found.get(folded)
            if current is not None and current.symbol != spec.symbol:
                raise RuntimeError(f"ambiguous registry key {key}")
            found[folded] = spec
    return found


_CATALOG = _catalog()
_BY_KEY = _index(_CATALOG)


def symbols() -> tuple[SymbolSpec, ...]:
    """Every spec, in catalog order."""
    return _CATALOG


def get_symbol(name: str) -> SymbolSpec:
    """Resolve a symbol, a unique alias, or a CCXT id such as `EUR/USD`."""
    if not isinstance(name, str) or not name.strip():
        raise MultiInstrumentError("symbol name is empty")
    spec = _BY_KEY.get(name.strip().casefold())
    if spec is None:
        raise MultiInstrumentError(f"unknown symbol {name}")
    return spec
