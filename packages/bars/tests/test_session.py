# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Session clocks: clipped minutes, session days, and the market week."""

from __future__ import annotations

import unittest

from flowchart_bars import BarsError, eurusd_spec, format_stamp, forming_bar, session_day_bounds, window_at

from support import at_ny, minute, tape


class SessionTests(unittest.TestCase):
    def test_seven_minute_tail_is_five_minutes(self) -> None:
        bars = tape(
            minute(at_ny(2024, 6, 2, 17, 0), "1"),
            minute(at_ny(2024, 6, 2, 17, 6), "2"),
            minute(at_ny(2024, 6, 3, 16, 55), "3"),
            minute(at_ny(2024, 6, 3, 16, 59), "4"),
        )
        first = window_at(bars, at_ny(2024, 6, 2, 17, 7), "7m")
        self.assertEqual(format_stamp(first.bars[0].close_time), "2024-06-02T21:07:00Z")
        hidden = window_at(bars, at_ny(2024, 6, 3, 16, 59), "7m")
        self.assertEqual(len(hidden.bars), 1)
        tail = forming_bar(bars, at_ny(2024, 6, 3, 16, 59), "7m")
        assert tail is not None
        self.assertEqual(format_stamp(tail.open_time), "2024-06-03T20:55:00Z")
        self.assertEqual(format_stamp(tail.close_time), "2024-06-03T21:00:00Z")
        closed = window_at(bars, at_ny(2024, 6, 3, 17, 0), "7m")
        self.assertEqual(format_stamp(closed.bars[-1].open_time), "2024-06-03T20:55:00Z")
        self.assertEqual(format_stamp(closed.bars[-1].close_time), "2024-06-03T21:00:00Z")
        self.assertEqual(closed.bars[-1].open, "3")
        self.assertEqual(closed.bars[-1].close, "4")

    def test_two_hour_bar_closes_at_19(self) -> None:
        bars = tape(
            minute(at_ny(2024, 6, 2, 17, 0), "1.10"),
            minute(at_ny(2024, 6, 2, 18, 59), "1.20"),
        )
        self.assertEqual(window_at(bars, at_ny(2024, 6, 2, 18, 59), "2h").bars, ())
        closed = window_at(bars, at_ny(2024, 6, 2, 19, 0), "2h")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-06-02T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-06-02T23:00:00Z")
        self.assertEqual(closed.bars[0].close, "1.20")

    def test_spring_forward_two_hour_bar_uses_real_time(self) -> None:
        bars = tape(
            minute(at_ny(2024, 3, 10, 1, 0), "1.10"),
            minute(at_ny(2024, 3, 10, 3, 30), "1.20"),
        )
        hidden = forming_bar(bars, at_ny(2024, 3, 10, 3, 59), "2h")
        assert hidden is not None
        self.assertEqual(format_stamp(hidden.close_time), "2024-03-10T08:00:00Z")
        self.assertEqual(hidden.close_time.astimezone(at_ny(2024, 3, 10, 0, 0).tzinfo).hour, 4)
        closed = window_at(bars, at_ny(2024, 3, 10, 4, 0), "2h")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-03-10T06:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-03-10T08:00:00Z")
        self.assertEqual(closed.bars[0].open, "1.10")
        self.assertEqual(closed.bars[0].close, "1.20")

    def test_session_day_opens_at_the_market_clock(self) -> None:
        before, after = session_day_bounds(eurusd_spec(), at_ny(2024, 6, 2, 10, 0))
        self.assertEqual(format_stamp(before), "2024-06-01T21:00:00Z")
        self.assertEqual(format_stamp(after), "2024-06-02T21:00:00Z")
        opened, closed = session_day_bounds(eurusd_spec(), at_ny(2024, 6, 2, 18, 0))
        self.assertEqual(format_stamp(opened), "2024-06-02T21:00:00Z")
        self.assertEqual(format_stamp(closed), "2024-06-03T21:00:00Z")

    def test_london_session_day_opens_at_03(self) -> None:
        opened, closed = session_day_bounds(eurusd_spec(), at_ny(2024, 6, 3, 2, 0), session="London")
        self.assertEqual(format_stamp(opened), "2024-06-02T07:00:00Z")
        self.assertEqual(format_stamp(closed), "2024-06-03T07:00:00Z")
        bars = tape(minute(at_ny(2024, 6, 3, 2, 30), "1.10"))
        hidden = window_at(bars, at_ny(2024, 6, 3, 2, 59), "1D", session="London")
        self.assertEqual(hidden.bars, ())
        present = window_at(bars, at_ny(2024, 6, 3, 3, 0), "1D", session="London")
        self.assertEqual(format_stamp(present.bars[0].open_time), "2024-06-02T07:00:00Z")
        self.assertEqual(format_stamp(present.bars[0].close_time), "2024-06-03T07:00:00Z")

    def test_three_session_days_keep_the_1970_phase(self) -> None:
        bars = tape(minute(at_ny(2024, 6, 2, 18, 0), "1.10"))
        hidden = window_at(bars, at_ny(2024, 6, 4, 16, 0), "3D")
        self.assertEqual(hidden.bars, ())
        closed = window_at(bars, at_ny(2024, 6, 4, 17, 0), "3D")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-06-01T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-06-04T21:00:00Z")

    def test_session_day_across_the_spring_forward_uses_the_clock(self) -> None:
        bars = tape(minute(at_ny(2024, 3, 9, 17, 0), "1.10"))
        closed = window_at(bars, at_ny(2024, 3, 10, 17, 0), "1D")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-03-09T22:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-03-10T21:00:00Z")
        self.assertEqual(window_at(bars, at_ny(2024, 3, 10, 16, 0), "1D").bars, ())

    def test_market_week_closes_on_friday(self) -> None:
        bars = tape(
            minute(at_ny(2024, 5, 26, 17, 0), "1.00"),
            minute(at_ny(2024, 6, 2, 17, 0), "1.10"),
        )
        hidden = window_at(bars, at_ny(2024, 6, 6, 12, 0), "1W")
        self.assertEqual([format_stamp(bar.close_time) for bar in hidden.bars], ["2024-05-31T21:00:00Z"])
        forming = forming_bar(bars, at_ny(2024, 6, 6, 12, 0), "1W")
        assert forming is not None
        self.assertEqual(format_stamp(forming.close_time), "2024-06-07T21:00:00Z")
        closed = window_at(bars, at_ny(2024, 6, 7, 17, 0), "1W")
        self.assertEqual(len(closed.bars), 2)
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-05-26T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-05-31T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[1].open_time), "2024-06-02T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[1].close_time), "2024-06-07T21:00:00Z")

    def test_two_week_group_starts_on_the_odd_phase(self) -> None:
        bars = tape(
            minute(at_ny(2024, 5, 26, 17, 0), "1.00"),
            minute(at_ny(2024, 6, 2, 18, 0), "1.20"),
        )
        closed = window_at(bars, at_ny(2024, 6, 7, 17, 0), "2W")
        self.assertEqual(len(closed.bars), 1)
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-05-26T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-06-07T21:00:00Z")
        self.assertEqual(closed.bars[0].open, "1.00")
        self.assertEqual(closed.bars[0].close, "1.20")
        self.assertEqual(window_at(bars, at_ny(2024, 6, 7, 16, 0), "2W").bars, ())

    def test_weekend_print_is_outside_the_market_week(self) -> None:
        bars = tape(minute(at_ny(2024, 6, 8, 12, 0), "1"))
        with self.assertRaises(BarsError) as caught:
            window_at(bars, at_ny(2024, 6, 8, 13, 0), "1W")
        self.assertEqual(caught.exception.code, "invalid_bar")

    def test_bad_timeframe_text_is_rejected(self) -> None:
        bars = tape(minute(at_ny(2024, 6, 2, 17, 0), "1"))
        for text in ("", "0m", "1", "1d", "1w", "15min", "1Y"):
            with self.assertRaises(BarsError) as caught:
                window_at(bars, at_ny(2024, 6, 2, 18, 0), text)
            self.assertEqual(caught.exception.code, "invalid_timeframe", text)


if __name__ == "__main__":
    unittest.main()
