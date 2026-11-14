# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Calendar buckets: fixed minutes and hours, Monday weeks, and civil months."""

from __future__ import annotations

import unittest

from flowchart_bars import format_stamp, forming_bar, window_at

from support import at_ny, at_utc, minute, tape


class CalendarTests(unittest.TestCase):
    def test_calendar_fifteen_minutes_are_fixed_from_the_epoch(self) -> None:
        bars = tape(
            minute(at_utc(2024, 6, 2, 21, 0), "1.10"),
            minute(at_utc(2024, 6, 2, 21, 14), "1.20"),
        )
        self.assertEqual(window_at(bars, at_utc(2024, 6, 2, 21, 14), "15m", alignment="calendar").bars, ())
        closed = window_at(bars, at_utc(2024, 6, 2, 21, 15), "15m", alignment="calendar")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-06-02T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-06-02T21:15:00Z")

    def test_calendar_four_hours_differ_from_the_session_clock(self) -> None:
        bars = tape(minute(at_ny(2024, 6, 2, 17, 0), "1.10"))
        session = window_at(bars, at_ny(2024, 6, 2, 21, 0), "4h")
        calendar = window_at(bars, at_utc(2024, 6, 3, 0, 0), "4h", alignment="calendar")
        self.assertEqual(format_stamp(session.bars[0].close_time), "2024-06-03T01:00:00Z")
        self.assertEqual(format_stamp(calendar.bars[0].open_time), "2024-06-02T20:00:00Z")
        self.assertEqual(format_stamp(calendar.bars[0].close_time), "2024-06-03T00:00:00Z")

    def test_calendar_week_starts_monday(self) -> None:
        bars = tape(minute(at_ny(2024, 6, 2, 17, 0), "1.10"))
        self.assertEqual(window_at(bars, at_utc(2024, 6, 2, 23, 0), "1W", alignment="calendar").bars, ())
        closed = window_at(bars, at_utc(2024, 6, 3, 0, 0), "1W", alignment="calendar")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-05-27T00:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-06-03T00:00:00Z")
        two = window_at(bars, at_utc(2024, 6, 10, 0, 0), "2W", alignment="calendar")
        self.assertEqual(format_stamp(two.bars[0].open_time), "2024-05-27T00:00:00Z")
        self.assertEqual(format_stamp(two.bars[0].close_time), "2024-06-10T00:00:00Z")

    def test_calendar_month_and_quarter_use_utc(self) -> None:
        bars = tape(minute(at_utc(2024, 6, 15, 12, 0), "1.10"))
        self.assertIsNotNone(forming_bar(bars, at_utc(2024, 6, 30, 23, 0), "1M", alignment="calendar"))
        month = window_at(bars, at_utc(2024, 7, 1, 0, 0), "1M", alignment="calendar")
        self.assertEqual(format_stamp(month.bars[0].open_time), "2024-06-01T00:00:00Z")
        self.assertEqual(format_stamp(month.bars[0].close_time), "2024-07-01T00:00:00Z")
        self.assertEqual(window_at(bars, at_utc(2024, 6, 30, 0, 0), "3M", alignment="calendar").bars, ())
        quarter = window_at(bars, at_utc(2024, 7, 1, 0, 0), "3M", alignment="calendar")
        self.assertEqual(format_stamp(quarter.bars[0].open_time), "2024-04-01T00:00:00Z")
        self.assertEqual(format_stamp(quarter.bars[0].close_time), "2024-07-01T00:00:00Z")

    def test_session_month_uses_the_symbol_zone(self) -> None:
        bars = tape(minute(at_ny(2024, 6, 15, 12, 0), "1.10"))
        # 1 July 00:00 UTC is still 30 June evening in New York.
        self.assertEqual(window_at(bars, at_utc(2024, 7, 1, 0, 0), "1M").bars, ())
        month = window_at(bars, at_ny(2024, 7, 1, 0, 0), "1M")
        self.assertEqual(format_stamp(month.bars[0].open_time), "2024-06-01T04:00:00Z")
        self.assertEqual(format_stamp(month.bars[0].close_time), "2024-07-01T04:00:00Z")
        quarter = window_at(bars, at_ny(2024, 7, 1, 0, 0), "3M")
        self.assertEqual(format_stamp(quarter.bars[0].open_time), "2024-04-01T04:00:00Z")
        self.assertEqual(format_stamp(quarter.bars[0].close_time), "2024-07-01T04:00:00Z")

    def test_calendar_day_is_a_utc_day(self) -> None:
        bars = tape(minute(at_utc(2024, 3, 9, 22, 0), "1.10"))
        closed = window_at(bars, at_utc(2024, 3, 10, 0, 0), "1D", alignment="calendar")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-03-09T00:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-03-10T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
