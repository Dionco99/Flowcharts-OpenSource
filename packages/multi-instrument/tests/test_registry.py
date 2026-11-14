# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Registry contents, pip sizes, and the refusal to carry market data."""

from __future__ import annotations

import ast
import unittest
from decimal import Decimal
from pathlib import Path

from support import SRC

from flowchart_multi import get_symbol, symbols
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.spec import spec_from_mapping, spec_to_mapping

MAJORS = (
    "EURUSD",
    "GBPUSD",
    "AUDUSD",
    "NZDUSD",
    "USDJPY",
    "USDCHF",
    "USDCAD",
)
MINORS = (
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
EXOTICS = (
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
WIDE = {"JPY", "HUF", "THB", "INR"}


class RegistryTests(unittest.TestCase):
    def test_groups_and_named_markets(self) -> None:
        catalog = symbols()
        by_class = {}
        for spec in catalog:
            by_class.setdefault(spec.asset_class, []).append(spec.symbol)
        self.assertEqual(tuple(by_class["forex-major"]), MAJORS)
        self.assertEqual(tuple(by_class["forex-minor"]), MINORS)
        self.assertEqual(tuple(by_class["forex-exotic"]), EXOTICS)
        self.assertEqual(tuple(by_class["metal"]), ("XAUUSD", "XAGUSD"))
        self.assertEqual(tuple(by_class["future"]), ("GC", "ES", "NQ", "CL"))
        self.assertEqual(tuple(by_class["perp"]), ("BTCUSDT", "ETHUSDT"))
        self.assertEqual(len(catalog), 55)

    def test_fx_tick_lot_and_pip_value(self) -> None:
        for spec in symbols():
            if not spec.asset_class.startswith("forex"):
                continue
            self.assertEqual(spec.lot_size, Decimal("100000"))
            self.assertEqual(spec.point_value, Decimal("100000"))
            self.assertEqual(spec.timezone, "America/New_York")
            self.assertIsNone(spec.funding)
            self.assertIsNone(spec.rollover_note)
            self.assertEqual(spec.ccxt_symbol, f"{spec.base}/{spec.quote}")
            if spec.quote in WIDE:
                self.assertEqual(spec.tick_size, Decimal("0.001"))
                self.assertEqual(spec.pip_size, Decimal("0.01"))
                self.assertEqual(spec.pip_value_quote(), Decimal("1000"))
            else:
                self.assertEqual(spec.tick_size, Decimal("0.00001"))
                self.assertEqual(spec.pip_size, Decimal("0.0001"))
                self.assertEqual(spec.pip_value_quote(), Decimal("10"))
            self.assertEqual(
                [session.name for session in spec.sessions],
                ["Asia", "London", "New York"],
            )

    def test_metals_futures_and_perps(self) -> None:
        gold = get_symbol("XAUUSD")
        silver = get_symbol("XAGUSD")
        self.assertEqual(gold.tick_size, Decimal("0.01"))
        self.assertEqual(gold.lot_size, Decimal("100"))
        self.assertEqual(gold.pip_value_quote(), Decimal("1"))
        self.assertEqual(silver.lot_size, Decimal("5000"))
        self.assertEqual(silver.pip_value_quote(), Decimal("5"))

        self.assertEqual(get_symbol("GC").pip_value_quote(), Decimal("10"))
        self.assertEqual(get_symbol("ES").pip_value_quote(), Decimal("12.50"))
        self.assertEqual(get_symbol("NQ").pip_value_quote(), Decimal("5"))
        self.assertEqual(get_symbol("CL").pip_value_quote(), Decimal("10"))
        for root in ("GC", "ES", "NQ", "CL"):
            spec = get_symbol(root)
            self.assertEqual(spec.lot_size, Decimal("1"))
            self.assertIsNone(spec.ccxt_symbol)
            self.assertIsNone(spec.funding)
            self.assertIn(root, spec.rollover_note or "")
            self.assertIn("no contract calendar", spec.rollover_note or "")
            self.assertEqual(spec.sessions[0].name, "Electronic")

        bitcoin = get_symbol("BTCUSDT")
        ether = get_symbol("ETHUSDT")
        self.assertEqual(bitcoin.tick_size, Decimal("0.1"))
        self.assertEqual(bitcoin.pip_value_quote(), Decimal("0.1"))
        self.assertEqual(ether.tick_size, Decimal("0.01"))
        self.assertEqual(ether.pip_value_quote(), Decimal("0.01"))
        self.assertEqual(bitcoin.ccxt_symbol, "BTC/USDT:USDT")
        self.assertEqual(ether.ccxt_symbol, "ETH/USDT:USDT")
        self.assertIsNone(bitcoin.rollover_note)
        self.assertEqual(bitcoin.timezone, "UTC")
        self.assertEqual(bitcoin.funding.interval_hours, 8)
        self.assertIn("rate is not in this registry", bitcoin.funding.note)

    def test_lookup_accepts_alias_and_ccxt_id(self) -> None:
        self.assertEqual(get_symbol("eurusd").symbol, "EURUSD")
        self.assertEqual(get_symbol("EUR/USD").symbol, "EURUSD")
        self.assertEqual(get_symbol("gold").symbol, "XAUUSD")
        self.assertEqual(get_symbol("btc-perp").symbol, "BTCUSDT")
        self.assertEqual(get_symbol("BTC/USDT:USDT").symbol, "BTCUSDT")
        with self.assertRaises(MultiInstrumentError):
            get_symbol("NOTASYMBOL")

    def test_spec_json_round_trip(self) -> None:
        for name in ("EURUSD", "USDJPY", "ES", "BTCUSDT"):
            spec = get_symbol(name)
            self.assertEqual(spec_from_mapping(spec_to_mapping(spec)), spec)

    def test_package_has_no_bundled_market_data(self) -> None:
        root = SRC.parent
        bundled = [
            path
            for path in root.rglob("*")
            if path.is_file() and path.suffix.lower() in {".csv", ".json", ".parquet", ".zip"}
        ]
        self.assertEqual(bundled, [])
        for path in (root / "src").rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    names = [alias.name.split(".")[0] for alias in node.names]
                elif isinstance(node, ast.ImportFrom):
                    names = [node.module.split(".")[0]] if node.module else []
                else:
                    continue
                for name in names:
                    self.assertNotIn(
                        name,
                        {"ccxt", "yfinance", "requests", "httpx", "urllib3"},
                    )


if __name__ == "__main__":
    unittest.main()
