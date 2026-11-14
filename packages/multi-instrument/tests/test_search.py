# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Symbol search."""

from __future__ import annotations

import unittest

from support import SRC  # noqa: F401

from flowchart_multi import search_symbols, symbols
from flowchart_multi.errors import MultiInstrumentError


class SearchTests(unittest.TestCase):
    def test_empty_query_is_the_catalog(self) -> None:
        self.assertEqual(search_symbols(""), symbols())
        self.assertEqual(search_symbols("  "), symbols())

    def test_exact_and_alias_rank_ahead_of_a_description_hit(self) -> None:
        gold = [spec.symbol for spec in search_symbols("gold")]
        self.assertEqual(gold[0], "XAUUSD")
        self.assertIn("GC", gold)
        self.assertLess(gold.index("XAUUSD"), gold.index("GC"))

        bitcoin = search_symbols("bitcoin")
        self.assertEqual(tuple(spec.symbol for spec in bitcoin), ("BTCUSDT",))

        yen = [spec.symbol for spec in search_symbols("yen")]
        self.assertEqual(yen[0], "USDJPY")
        self.assertIn("EURJPY", yen)

    def test_asset_class_filter(self) -> None:
        found = search_symbols("e", asset_class="future")
        self.assertEqual(found[0].symbol, "ES")
        self.assertTrue(all(spec.asset_class == "future" for spec in found))
        majors = search_symbols("", asset_class="forex-major")
        self.assertEqual(len(majors), 7)
        with self.assertRaises(MultiInstrumentError):
            search_symbols("eur", asset_class="spot")

    def test_case_and_ccxt_id(self) -> None:
        self.assertEqual(search_symbols("GbP")[0].symbol, "GBPUSD")
        self.assertEqual(search_symbols("btc/usdt:usdt")[0].symbol, "BTCUSDT")


if __name__ == "__main__":
    unittest.main()
