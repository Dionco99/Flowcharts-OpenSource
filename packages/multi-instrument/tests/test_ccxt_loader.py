# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Mocked CCXT kline loader. No network and no CCXT package."""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone

from support import SRC  # noqa: F401

from flowchart_multi import (
    CcxtKlineLoader,
    MockCcxtKlineLoader,
    get_symbol,
    tape_from_ccxt,
    window_at,
)
from flowchart_multi.errors import MultiInstrumentError

OPEN = datetime(2024, 6, 2, 21, 0, tzinfo=timezone.utc)
OPEN_MS = 1717362000000


class CcxtLoaderTests(unittest.TestCase):
    def test_open_ms(self) -> None:
        self.assertEqual(int(OPEN.timestamp() * 1000), OPEN_MS)

    def test_mock_records_the_call_and_builds_a_tape(self) -> None:
        second = OPEN_MS + 60_000
        rows = [
            [OPEN_MS, "1.10000", "1.10020", "1.09980", "1.10010", 3],
            [second, "1.10010", "1.10040", "1.10000", "1.10030", 4],
        ]
        loader = MockCcxtKlineLoader({("EUR/USD", "1m"): rows})
        euro = get_symbol("EURUSD")
        history = tape_from_ccxt(loader, euro, since=OPEN, limit=10)
        self.assertEqual(
            loader.calls,
            [{"symbol": "EUR/USD", "timeframe": "1m", "since": OPEN_MS, "limit": 10}],
        )
        self.assertEqual(len(history.bars), 2)
        self.assertEqual(history.bars[0].close_time, datetime(2024, 6, 2, 21, 1, tzinfo=timezone.utc))
        later = tape_from_ccxt(loader, euro, since=datetime(2024, 6, 2, 21, 1, tzinfo=timezone.utc), limit=1)
        self.assertEqual(len(later.bars), 1)
        self.assertEqual(later.bars[0].open_time, datetime(2024, 6, 2, 21, 1, tzinfo=timezone.utc))
        cursor = datetime(2024, 6, 2, 21, 1, tzinfo=timezone.utc)
        self.assertEqual(len(window_at(history, cursor, "1m").bars), 1)

    def test_future_root_uses_the_registry_symbol(self) -> None:
        loader = MockCcxtKlineLoader(
            {("ES", "1m"): [[OPEN_MS, "5300.00", "5300.25", "5299.75", "5300.00", 8]]}
        )
        history = tape_from_ccxt(loader, get_symbol("ES"))
        self.assertEqual(loader.calls[0]["symbol"], "ES")
        self.assertEqual(history.bars[0].close, history.bars[0].open)

    def test_rejects_numbers_other_timeframes_and_the_base_loader(self) -> None:
        euro = get_symbol("EURUSD")
        numbered = MockCcxtKlineLoader(
            {("EUR/USD", "1m"): [[OPEN_MS, 1.1, 1.1, 1.1, 1.1, 1]]}
        )
        with self.assertRaises(MultiInstrumentError):
            tape_from_ccxt(numbered, euro)
        with self.assertRaises(MultiInstrumentError):
            tape_from_ccxt(MockCcxtKlineLoader({}), euro, timeframe="5m")
        with self.assertRaises(MultiInstrumentError):
            tape_from_ccxt(CcxtKlineLoader(), euro)
        self.assertNotIn("ccxt", sys.modules)


if __name__ == "__main__":
    unittest.main()
