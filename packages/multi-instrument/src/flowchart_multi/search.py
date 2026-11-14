# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Symbol search over the registry."""

from __future__ import annotations

from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.registry import symbols
from flowchart_multi.spec import ASSET_CLASSES, SymbolSpec


def search_symbols(query: str, *, asset_class: str | None = None) -> tuple[SymbolSpec, ...]:
    """Match a symbol, alias, description, or currency.

    An empty query returns the catalog. A shorter query that hits the symbol
    itself ranks ahead of a description hit. Results keep catalog order
    inside a rank.
    """
    if not isinstance(query, str):
        raise MultiInstrumentError("query must be text")
    if asset_class is not None and asset_class not in ASSET_CLASSES:
        raise MultiInstrumentError(f"unknown asset class {asset_class}")
    needle = query.strip().casefold()
    ranked: list[tuple[int, int, SymbolSpec]] = []
    for index, spec in enumerate(symbols()):
        if asset_class is not None and spec.asset_class != asset_class:
            continue
        rank = _rank(spec, needle)
        if rank is None:
            continue
        ranked.append((rank, index, spec))
    ranked.sort(key=lambda item: (item[0], item[1]))
    return tuple(spec for _, _, spec in ranked)


def _rank(spec: SymbolSpec, needle: str) -> int | None:
    if needle == "":
        return 0
    symbol = spec.symbol.casefold()
    aliases = tuple(alias.casefold() for alias in spec.aliases)
    ccxt = "" if spec.ccxt_symbol is None else spec.ccxt_symbol.casefold()
    haystacks = (
        symbol,
        spec.base.casefold(),
        spec.quote.casefold(),
        spec.description.casefold(),
        ccxt,
        *aliases,
    )
    if symbol == needle or needle in aliases or ccxt == needle:
        return 0
    if symbol.startswith(needle) or any(alias.startswith(needle) for alias in aliases):
        return 1
    if needle in symbol or any(needle in alias for alias in aliases) or needle in ccxt:
        return 2
    if any(needle in field for field in haystacks):
        return 3
    return None
