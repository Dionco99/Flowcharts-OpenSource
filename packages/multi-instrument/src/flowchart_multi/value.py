# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Pip value and quote conversion. Rates come from the caller."""

from __future__ import annotations

from decimal import Decimal
from typing import Mapping

from flowchart_multi.decimals import parse_decimal
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.registry import symbols
from flowchart_multi.spec import SymbolSpec


def pip_value(
    spec: SymbolSpec,
    account_currency: str,
    rates: Mapping[str, object] | None = None,
    *,
    price: object | None = None,
) -> Decimal:
    """One pip on one lot, in `account_currency`.

    `price` is the mid of `spec` itself, used when that pair converts the
    quote. Other rates are registry symbols or `BASE/QUOTE` strings such as
    `USDT/USD`. A float is rejected.
    """
    if not isinstance(account_currency, str) or not account_currency.strip():
        raise MultiInstrumentError("account currency is empty")
    book = _rates(rates)
    if price is not None:
        mid = _rate_value(price, spec.symbol)
        book.setdefault(spec.symbol, mid)
    return convert_quote(spec.pip_value_quote(), spec.quote, account_currency, book)


def convert_quote(
    amount: object,
    from_currency: str,
    to_currency: str,
    rates: Mapping[str, object] | None = None,
) -> Decimal:
    """Convert `amount` using caller-supplied mids.

    A listed pair is used before a path through USD. Futures roots are not
    currencies. USDT is not treated as USD; pass `USDT/USD` when you need it.
    """
    quantity = _amount(amount)
    src = _currency(from_currency, "from_currency")
    dst = _currency(to_currency, "to_currency")
    if src == dst:
        return quantity
    book = _rates(rates)
    direct = _hop(quantity, src, dst, book)
    if direct is not None:
        return direct
    if src != "USD" and dst != "USD":
        to_usd = _hop(quantity, src, "USD", book)
        if to_usd is not None:
            to_dst = _hop(to_usd, "USD", dst, book)
            if to_dst is not None:
                return to_dst
    raise MultiInstrumentError(f"no rate to convert {src} to {dst}")


def _hop(
    amount: Decimal,
    src: str,
    dst: str,
    rates: Mapping[str, Decimal],
) -> Decimal | None:
    for base, quote, mid in _pairs(rates):
        if base == src and quote == dst:
            return amount * mid
        if base == dst and quote == src:
            return amount / mid
    return None


def _pairs(rates: Mapping[str, Decimal]) -> tuple[tuple[str, str, Decimal], ...]:
    listed = {
        spec.symbol: (spec.base, spec.quote)
        for spec in symbols()
        if spec.asset_class != "future"
    }
    found = []
    for key, mid in rates.items():
        pair = listed.get(key)
        if pair is None and "/" in key:
            base, quote = key.split("/", 1)
            pair = (base.strip().upper(), quote.strip().upper())
        if pair is None:
            continue
        found.append((pair[0], pair[1], mid))
    return tuple(found)


def _rates(rates: Mapping[str, object] | None) -> dict[str, Decimal]:
    if rates is None:
        return {}
    if not isinstance(rates, Mapping):
        raise MultiInstrumentError("rates must be a mapping")
    book = {}
    for key, value in rates.items():
        if not isinstance(key, str) or not key.strip():
            raise MultiInstrumentError("rate name must be text")
        book[key.strip().upper()] = _rate_value(value, key)
    return book


def _rate_value(value: object, field: str) -> Decimal:
    if isinstance(value, Decimal):
        mid = value
    else:
        mid = parse_decimal(value, field=field)
    if mid <= 0:
        raise MultiInstrumentError(f"{field} must be a positive rate")
    return mid


def _amount(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return parse_decimal(value, field="amount", signed=True)


def _currency(value: str, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise MultiInstrumentError(f"{field} is empty")
    return value.strip().upper()
