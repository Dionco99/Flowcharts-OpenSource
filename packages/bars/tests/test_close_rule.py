# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""A higher-timeframe bar stays hidden until its bucket has closed."""

from __future__ import annotations

import unittest

from flowchart_bars import format_stamp, forming_bar, window_at

from support import at_ny, minute, tape


class CloseRuleTests(unittest.TestCase):
    def test_one_minute_includes_the_close_and_hides_the_next(self) -> None:
        bars = tape(
            minute(at_ny(2024, 6, 2, 17, 13), "1.10000"),
            minute(at_ny(2024, 6, 2, 17, 14), "1.10010"),
        )
        window = window_at(bars, at_ny(2024, 6, 2, 17, 14), "1m")
        self.assertEqual([format_stamp(bar.close_time) for bar in window.bars], ["2024-06-02T21:14:00Z"])
        self.assertIsNone(forming_bar(bars, at_ny(2024, 6, 2, 17, 14), "1m"))

    def test_fifteen_minutes_waits_for_the_fifteenth_close(self) -> None:
        bars = tape(
            minute(at_ny(2024, 6, 2, 17, 0), "1.10000", high="1.10050", low="1.09950"),
            minute(at_ny(2024, 6, 2, 17, 10), "1.10020"),
            minute(at_ny(2024, 6, 2, 17, 14), "1.10040", high="10", low="0.5", close="9"),
        )
        early = window_at(bars, at_ny(2024, 6, 2, 17, 14), "15m")
        self.assertEqual(early.bars, ())
        forming = forming_bar(bars, at_ny(2024, 6, 2, 17, 14), "15m")
        self.assertIsNotNone(forming)
        assert forming is not None
        self.assertEqual(format_stamp(forming.close_time), "2024-06-02T21:15:00Z")
        self.assertEqual(forming.open, "1.10000")
        self.assertEqual(forming.close, "1.10020")
        self.assertEqual(forming.high, "1.10050")
        self.assertEqual(forming.low, "1.09950")
        self.assertEqual(forming.volume, "2")

        closed = window_at(bars, at_ny(2024, 6, 2, 17, 15), "15m")
        self.assertEqual(len(closed.bars), 1)
        bar = closed.bars[0]
        self.assertEqual(format_stamp(bar.open_time), "2024-06-02T21:00:00Z")
        self.assertEqual(format_stamp(bar.close_time), "2024-06-02T21:15:00Z")
        self.assertEqual(bar.open, "1.10000")
        self.assertEqual(bar.close, "9")
        self.assertEqual(bar.high, "10")
        self.assertEqual(bar.low, "0.5")
        self.assertEqual(bar.volume, "3")
        self.assertIsNone(forming_bar(bars, at_ny(2024, 6, 2, 17, 15), "15m"))
        self.assertNotIn(bar, early.bars)

    def test_missing_minute_does_not_hold_the_bucket_open(self) -> None:
        bars = tape(
            minute(at_ny(2024, 6, 2, 17, 0), "1.10000"),
            minute(at_ny(2024, 6, 2, 17, 14), "1.10040"),
        )
        window = window_at(bars, at_ny(2024, 6, 2, 17, 15), "15m")
        self.assertEqual(window.bars[0].volume, "2")
        self.assertEqual(format_stamp(window.bars[0].close_time), "2024-06-02T21:15:00Z")

    def test_sunday_four_hour_bar_closes_at_21(self) -> None:
        bars = tape(
            minute(at_ny(2024, 6, 2, 17, 0), "1.10000"),
            minute(at_ny(2024, 6, 2, 20, 59), "1.10100"),
        )
        hidden = window_at(bars, at_ny(2024, 6, 2, 20, 0), "4h")
        self.assertEqual(hidden.bars, ())
        forming = forming_bar(bars, at_ny(2024, 6, 2, 20, 0), "4h")
        assert forming is not None
        self.assertEqual(format_stamp(forming.close_time), "2024-06-03T01:00:00Z")
        closed = window_at(bars, at_ny(2024, 6, 2, 21, 0), "4h")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-06-03T01:00:00Z")
        self.assertEqual(closed.bars[0].open, "1.10000")
        self.assertEqual(closed.bars[0].close, "1.10100")

    def test_one_hour_and_five_minutes_follow_the_17_clock(self) -> None:
        bars = tape(
            minute(at_ny(2024, 6, 2, 17, 0), "1"),
            minute(at_ny(2024, 6, 2, 17, 4), "2"),
            minute(at_ny(2024, 6, 2, 17, 59), "3"),
        )
        five = window_at(bars, at_ny(2024, 6, 2, 17, 5), "5m")
        self.assertEqual(format_stamp(five.bars[0].close_time), "2024-06-02T21:05:00Z")
        self.assertEqual(five.bars[0].close, "2")
        hour = window_at(bars, at_ny(2024, 6, 2, 18, 0), "1h")
        self.assertEqual(format_stamp(hour.bars[0].close_time), "2024-06-02T22:00:00Z")
        self.assertEqual(hour.bars[0].volume, "3")

    def test_empty_tape_has_no_forming_bar(self) -> None:
        bars = tape()
        self.assertEqual(window_at(bars, at_ny(2024, 6, 2, 17, 15), "15m").bars, ())
        self.assertIsNone(forming_bar(bars, at_ny(2024, 6, 2, 17, 15), "15m"))

    def test_naive_cursor_is_rejected(self) -> None:
        from datetime import datetime

        from flowchart_bars import BarsError

        bars = tape(minute(at_ny(2024, 6, 2, 17, 0), "1"))
        with self.assertRaises(BarsError):
            window_at(bars, datetime(2024, 6, 2, 17, 15), "15m")


if __name__ == "__main__":
    unittest.main()
