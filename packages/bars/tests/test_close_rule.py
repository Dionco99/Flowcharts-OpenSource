# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""A higher-timeframe bar stays open until its minutes have reached the cursor."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import support
from flowchart_bars import (
    Tape,
    build_eurusd_tape,
    eurusd_spec,
    forming_bar,
    window_at,
)


class CloseRuleTest(unittest.TestCase):
    def test_15m_bar_does_not_close_before_its_minutes_reach_the_cursor(self) -> None:
        spec = eurusd_spec()
        start = support.et(2024, 6, 3, 12, 0)
        # The file already holds the completing minute and the minutes after it.
        minutes = support.make_minutes(
            start,
            20,
            spikes={14: "1.50000", 15: "2.00000"},
        )
        tape = Tape(spec, tuple(minutes))
        fourteenth_close = minutes[13].close_time
        fifteenth_close = minutes[14].close_time

        early = window_at(tape, fourteenth_close, "15m")
        self.assertEqual(early.bars, ())
        almost = window_at(tape, fifteenth_close - timedelta(seconds=1), "15m")
        self.assertEqual(almost.bars, ())

        forming = forming_bar(tape, fourteenth_close, "15m")
        self.assertIsNotNone(forming)
        assert forming is not None
        self.assertGreater(forming.close_time, fourteenth_close)
        self.assertEqual(forming.close_time, fifteenth_close)
        self.assertLess(forming.high, Decimal("1.50000"))

        closed = window_at(tape, fifteenth_close, "15m")
        self.assertEqual(len(closed.bars), 1)
        bar = closed.bars[0]
        first_fifteen = minutes[:15]
        self.assertEqual(bar.open_time, first_fifteen[0].open_time)
        self.assertEqual(bar.close_time, fifteenth_close)
        self.assertLessEqual(bar.close_time, fifteenth_close)
        self.assertEqual(bar.open, first_fifteen[0].open)
        self.assertEqual(bar.close, first_fifteen[-1].close)
        self.assertEqual(bar.high, Decimal("1.50000"))
        self.assertEqual(bar.low, min(minute.low for minute in first_fifteen))
        self.assertEqual(bar.volume, sum(minute.volume for minute in first_fifteen))
        self.assertLess(bar.high, Decimal("2.00000"))
        self.assertIsNone(forming_bar(tape, fifteenth_close, "15m"))

    def test_missing_final_minute_closes_when_the_cursor_reaches_the_end(self) -> None:
        start = support.et(2024, 6, 3, 12, 0)
        minutes = support.make_minutes(start, 15)
        kept = minutes[:14]
        tape = Tape(eurusd_spec(), tuple(kept))
        boundary = minutes[14].close_time
        self.assertEqual(window_at(tape, boundary - timedelta(seconds=1), "15m").bars, ())
        window = window_at(tape, boundary, "15m")
        self.assertEqual(len(window.bars), 1)
        self.assertEqual(window.bars[0].close_time, boundary)
        self.assertEqual(window.bars[0].close, kept[-1].close)

    def test_5m_and_1h_wait_for_their_last_minute(self) -> None:
        spec = eurusd_spec()
        start = support.et(2024, 6, 2, 17, 0)
        for timeframe, width in (("5m", 5), ("1h", 60)):
            minutes = support.make_minutes(
                start,
                width + 1,
                spikes={width - 1: "1.50000", width: "2.00000"},
            )
            tape = Tape(spec, tuple(minutes))
            early = minutes[width - 2].close_time
            done = minutes[width - 1].close_time
            self.assertEqual(window_at(tape, early, timeframe).bars, ())
            window = window_at(tape, done, timeframe)
            self.assertEqual(len(window.bars), 1, timeframe)
            self.assertEqual(window.bars[0].close_time, done, timeframe)
            self.assertEqual(window.bars[0].high, Decimal("1.50000"), timeframe)

    def test_4h_bar_stays_open_until_21_00_new_york(self) -> None:
        spec = eurusd_spec()
        start = support.et(2024, 6, 2, 17, 0)
        minutes = support.make_minutes(
            start,
            241,
            spikes={239: "1.50000", 240: "2.00000"},
        )
        tape = Tape(spec, tuple(minutes))
        at_20 = support.et(2024, 6, 2, 20, 0)
        self.assertEqual(window_at(tape, at_20, "4h").bars, ())

        at_21 = support.et(2024, 6, 2, 21, 0)
        window = window_at(tape, at_21, "4h")
        self.assertEqual(len(window.bars), 1)
        bar = window.bars[0]
        self.assertEqual(bar.open_time, minutes[0].open_time)
        self.assertEqual(bar.close_time, at_21)
        self.assertEqual(bar.high, Decimal("1.50000"))
        ny = ZoneInfo("America/New_York")
        self.assertEqual(bar.open_time.astimezone(ny).hour, 17)
        self.assertEqual(bar.close_time.astimezone(ny).hour, 21)

    def test_sample_15m_bar_waits_until_17_15(self) -> None:
        tape = build_eurusd_tape()
        early = support.et(2024, 6, 2, 17, 14)
        on_time = support.et(2024, 6, 2, 17, 15)
        one_minute = window_at(tape, early, "1m")
        self.assertEqual(len(one_minute.bars), 14)
        self.assertTrue(all(bar.close_time <= early for bar in one_minute.bars))
        self.assertEqual(window_at(tape, early, "15m").bars, ())

        forming = forming_bar(tape, early, "15m")
        self.assertIsNotNone(forming)
        assert forming is not None
        self.assertEqual(forming.close_time, on_time)
        self.assertGreater(forming.close_time, early)

        window = window_at(tape, on_time, "15m")
        self.assertEqual(len(window.bars), 1)
        bar = window.bars[0]
        first = tape.bars[:15]
        self.assertEqual(bar.close_time, first[-1].close_time)
        self.assertEqual(bar.open, first[0].open)
        self.assertEqual(bar.close, first[-1].close)
        self.assertEqual(bar.high, max(minute.high for minute in first))
        self.assertEqual(bar.low, min(minute.low for minute in first))
        self.assertEqual(bar.volume, sum(minute.volume for minute in first))

    def test_no_closed_bar_ends_after_the_cursor(self) -> None:
        tape = build_eurusd_tape()
        cursor = tape.bars[0].open_time
        end = tape.bars[-1].close_time
        while cursor <= end:
            for timeframe in ("1m", "5m", "15m", "1h", "4h"):
                for bar in window_at(tape, cursor, timeframe).bars:
                    self.assertLessEqual(bar.close_time, cursor)
            cursor += timedelta(minutes=15)

    def test_hour_bar_waits_through_the_spring_forward_gap(self) -> None:
        start = datetime(2024, 3, 10, 1, 0, tzinfo=ZoneInfo("America/New_York"))
        minutes = support.make_minutes(start, 60)
        tape = Tape(eurusd_spec(), tuple(minutes))
        close_at = minutes[-1].close_time
        self.assertEqual(window_at(tape, close_at - timedelta(seconds=1), "1h").bars, ())
        window = window_at(tape, close_at, "1h")
        self.assertEqual(len(window.bars), 1)
        self.assertEqual(window.bars[0].close_time, close_at)
        self.assertEqual(window.bars[0].close_time - window.bars[0].open_time, timedelta(hours=1))

    def test_15m_bar_keeps_fifteen_real_minutes_in_the_repeated_hour(self) -> None:
        start = datetime(2024, 11, 3, 1, 0, tzinfo=ZoneInfo("America/New_York"), fold=0)
        minutes = support.make_minutes(start, 16)
        tape = Tape(eurusd_spec(), tuple(minutes))
        close_at = minutes[14].close_time
        self.assertEqual(window_at(tape, close_at - timedelta(seconds=1), "15m").bars, ())
        window = window_at(tape, close_at, "15m")
        self.assertEqual(len(window.bars), 1)
        bar = window.bars[0]
        self.assertEqual(bar.close_time, close_at)
        self.assertEqual(bar.close_time - bar.open_time, timedelta(minutes=15))


if __name__ == "__main__":
    unittest.main()
