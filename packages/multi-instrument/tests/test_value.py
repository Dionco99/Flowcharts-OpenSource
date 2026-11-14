# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Pip value and quote conversion. Rates in these tests are synthetic."""

from __future__ import annotations

import unittest
from decimal import Decimal

from support import SRC  # noqa: F401

from flowchart_multi import convert_quote, get_symbol, pip_value
from flowchart_multi.errors import MultiInstrumentError


class ValueTests(unittest.TestCase):
    def test_pip_value_in_quote_and_account_currency(self) -> None:
        euro = get_symbol("EURUSD")
        yen = get_symbol("USDJPY")
        self.assertEqual(pip_value(euro, "USD"), Decimal("10"))
        self.assertEqual(pip_value(yen, "JPY"), Decimal("1000"))
        self.assertEqual(pip_value(yen, "USD", price="150"), Decimal("1000") / Decimal("150"))
        self.assertEqual(pip_value(get_symbol("ES"), "usd"), Decimal("12.50"))
        bitcoin = get_symbol("BTCUSDT")
        with self.assertRaises(MultiInstrumentError):
            pip_value(bitcoin, "USD")
        self.assertEqual(
            pip_value(bitcoin, "USD", {"USDT/USD": "1"}),
            Decimal("0.1"),
        )

    def test_direct_inverse_and_usd_cross(self) -> None:
        rates = {"EURUSD": "1.10", "USDJPY": "150", "GBPUSD": "1.25"}
        self.assertEqual(convert_quote("1000", "EUR", "USD", rates), Decimal("1100"))
        self.assertEqual(convert_quote("1100", "USD", "EUR", rates), Decimal("1000"))
        self.assertEqual(convert_quote("1000", "JPY", "USD", rates), Decimal("1000") / Decimal("150"))
        self.assertEqual(convert_quote("1", "EUR", "JPY", rates), Decimal("165"))
        self.assertEqual(convert_quote("1", "EUR", "GBP", rates), Decimal("1.10") / Decimal("1.25"))
        self.assertEqual(convert_quote("-10", "EUR", "USD", rates), Decimal("-11"))
        self.assertEqual(convert_quote("4", "USD", "USD"), Decimal("4"))

    def test_direct_pair_wins_over_the_cross(self) -> None:
        rates = {"EURUSD": "1.10", "GBPUSD": "1.25", "EURGBP": "0.80"}
        self.assertEqual(convert_quote("1", "EUR", "GBP", rates), Decimal("0.80"))

    def test_rejects_float_rates_and_missing_pairs(self) -> None:
        with self.assertRaises(MultiInstrumentError):
            convert_quote("1", "EUR", "USD", {"EURUSD": 1.1})
        with self.assertRaises(MultiInstrumentError):
            convert_quote("1", "EUR", "GBP", {"EURUSD": "1.10"})
        with self.assertRaises(MultiInstrumentError):
            pip_value(get_symbol("USDJPY"), "USD", price=150.0)
        with self.assertRaises(MultiInstrumentError):
            convert_quote("1", "ES", "USD", {"ES": "5000"})


if __name__ == "__main__":
    unittest.main()
