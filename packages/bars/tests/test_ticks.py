# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Tick bars: one bar per N trades, with a short tail left incomplete."""

from __future__ import annotations

import unittest
from datetime import timedelta

from flowchart_bars import BarsError, Trade, format_stamp, tick_bars

from support import at_utc


def prints(prices: list[str], *, start: int = 0) -> list[Trade]:
    origin = at_utc(2024, 6, 2, 21, 0, 0)
    return [
        Trade(origin + timedelta(seconds=start + offset), price, "1")
        for offset, price in enumerate(prices)
    ]


class TickTests(unittest.TestCase):
    def test_complete_groups_close_and_the_tail_stays_open(self) -> None:
        cursor = at_utc(2024, 6, 2, 21, 0, 10)
        window = tick_bars(prints(["1.10", "1.40", "1.20", "1.00", "1.30"]), 3, cursor)
        self.assertEqual(len(window.bars), 1)
        bar = window.bars[0]
        self.assertEqual(bar.open, "1.10")
        self.assertEqual(bar.high, "1.40")
        self.assertEqual(bar.low, "1.10")
        self.assertEqual(bar.close, "1.20")
        self.assertEqual(bar.volume, "3")
        self.assertEqual(format_stamp(bar.close_time), "2024-06-02T21:00:02Z")
        assert window.forming is not None
        self.assertEqual(window.forming.open, "1.00")
        self.assertEqual(window.forming.close, "1.30")
        self.assertEqual(window.forming.volume, "2")
        self.assertLessEqual(window.forming.close_time, window.cursor)

    def test_future_trades_cannot_complete_a_bar(self) -> None:
        trades = prints(["1", "2", "3", "4"])
        early = tick_bars(trades, 3, at_utc(2024, 6, 2, 21, 0, 1))
        self.assertEqual(early.bars, ())
        assert early.forming is not None
        self.assertEqual(early.forming.volume, "2")
        closed = tick_bars(trades, 3, at_utc(2024, 6, 2, 21, 0, 2))
        self.assertEqual(len(closed.bars), 1)
        self.assertIsNone(closed.forming)

    def test_float_price_and_bad_count_are_rejected(self) -> None:
        when = at_utc(2024, 6, 2, 21, 0, 0)
        with self.assertRaises(BarsError):
            Trade(when, 1.1, "1")  # type: ignore[arg-type]
        with self.assertRaises(BarsError):
            tick_bars(prints(["1"]), True, when)  # type: ignore[arg-type]
        with self.assertRaises(BarsError):
            tick_bars(prints(["1"]), 0, when)

    def test_trades_must_be_oldest_first(self) -> None:
        trades = prints(["1", "2"])
        with self.assertRaises(BarsError):
            tick_bars([trades[1], trades[0]], 2, at_utc(2024, 6, 2, 21, 1, 0))

    def test_sizes_sum_as_decimals(self) -> None:
        origin = at_utc(2024, 6, 2, 21, 0, 0)
        trades = [
            Trade(origin, "10", "0.5"),
            Trade(origin + timedelta(seconds=1), "9", "1.5"),
        ]
        window = tick_bars(trades, 2, origin + timedelta(seconds=1))
        self.assertEqual(window.bars[0].high, "10")
        self.assertEqual(window.bars[0].low, "9")
        self.assertEqual(window.bars[0].volume, "2")


if __name__ == "__main__":
    unittest.main()
