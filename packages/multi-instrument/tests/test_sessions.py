# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Session windows, the week clock, and funding instants."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from support import SRC, ny, utc  # noqa: F401

from flowchart_multi import funding_instants, get_symbol, is_market_open, sessions_at
from flowchart_multi.errors import MultiInstrumentError


class SessionTests(unittest.TestCase):
    def test_fx_windows_and_the_weekend(self) -> None:
        euro = get_symbol("EURUSD")
        self.assertEqual(sessions_at(euro, ny(2024, 6, 2, 16, 59)), ())
        self.assertEqual(sessions_at(euro, ny(2024, 6, 2, 17, 0)), ("Asia",))
        self.assertEqual(sessions_at(euro, ny(2024, 6, 3, 2, 59)), ("Asia",))
        self.assertEqual(sessions_at(euro, ny(2024, 6, 3, 3, 0)), ("London",))
        self.assertEqual(sessions_at(euro, ny(2024, 6, 3, 10, 0)), ("London", "New York"))
        self.assertEqual(sessions_at(euro, ny(2024, 6, 3, 12, 0)), ("New York",))
        self.assertEqual(sessions_at(euro, ny(2024, 6, 3, 17, 0)), ("Asia",))
        self.assertEqual(sessions_at(euro, ny(2024, 6, 7, 16, 59)), ("New York",))
        self.assertEqual(sessions_at(euro, ny(2024, 6, 7, 17, 0)), ())
        self.assertEqual(sessions_at(euro, ny(2024, 6, 8, 12, 0)), ())
        self.assertEqual(sessions_at(euro, ny(2024, 6, 2, 10, 0)), ())
        self.assertTrue(is_market_open(euro, ny(2024, 6, 3, 10, 0)))
        self.assertFalse(is_market_open(euro, ny(2024, 6, 8, 12, 0)))

    def test_fx_session_accepts_a_utc_instant(self) -> None:
        euro = get_symbol("EURUSD")
        # 2024-06-03 14:00 UTC is 10:00 New York (EDT).
        instant = utc(2024, 6, 3, 14, 0)
        self.assertEqual(sessions_at(euro, instant), ("London", "New York"))

    def test_future_halt_and_sunday_open(self) -> None:
        es = get_symbol("ES")
        self.assertFalse(is_market_open(es, ny(2024, 6, 2, 17, 59)))
        self.assertTrue(is_market_open(es, ny(2024, 6, 2, 18, 0)))
        self.assertFalse(is_market_open(es, ny(2024, 6, 3, 17, 0)))
        self.assertFalse(is_market_open(es, ny(2024, 6, 3, 17, 30)))
        self.assertTrue(is_market_open(es, ny(2024, 6, 3, 18, 0)))
        self.assertTrue(is_market_open(es, ny(2024, 6, 7, 16, 59)))
        self.assertFalse(is_market_open(es, ny(2024, 6, 7, 17, 0)))
        self.assertFalse(is_market_open(es, ny(2024, 6, 8, 12, 0)))

    def test_perp_is_open_through_the_weekend(self) -> None:
        bitcoin = get_symbol("BTCUSDT")
        self.assertTrue(is_market_open(bitcoin, utc(2024, 6, 8, 12, 0)))
        self.assertEqual(sessions_at(bitcoin, utc(2024, 6, 8, 12, 0)), ("Continuous",))

    def test_funding_bounds_are_inclusive_then_exclusive(self) -> None:
        bitcoin = get_symbol("BTCUSDT")
        day = funding_instants(bitcoin, utc(2024, 6, 2, 0, 0), utc(2024, 6, 3, 0, 0))
        self.assertEqual(
            day,
            (utc(2024, 6, 2, 0, 0), utc(2024, 6, 2, 8, 0), utc(2024, 6, 2, 16, 0)),
        )
        one = funding_instants(bitcoin, utc(2024, 6, 2, 8, 0), utc(2024, 6, 2, 16, 0))
        self.assertEqual(one, (utc(2024, 6, 2, 8, 0),))
        saturday = funding_instants(bitcoin, utc(2024, 6, 8, 0, 0), utc(2024, 6, 8, 8, 1))
        self.assertEqual(saturday[0], utc(2024, 6, 8, 0, 0))
        self.assertEqual(funding_instants(get_symbol("EURUSD"), utc(2024, 6, 2, 0, 0), utc(2024, 6, 3, 0, 0)), ())
        self.assertEqual(funding_instants(get_symbol("ES"), utc(2024, 6, 3, 0, 0), utc(2024, 6, 4, 0, 0)), ())

    def test_naive_timestamp_is_rejected(self) -> None:
        with self.assertRaises(MultiInstrumentError):
            sessions_at(get_symbol("EURUSD"), datetime(2024, 6, 3, 10, 0))

    def test_funding_end_before_start(self) -> None:
        with self.assertRaises(MultiInstrumentError):
            funding_instants(
                get_symbol("BTCUSDT"),
                datetime(2024, 6, 3, tzinfo=timezone.utc),
                datetime(2024, 6, 2, tzinfo=ZoneInfo("UTC")),
            )


if __name__ == "__main__":
    unittest.main()
