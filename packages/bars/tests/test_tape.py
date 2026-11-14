# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Tape file, symbol spec, and the generated EURUSD fixture."""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta
from decimal import Decimal

import support
from flowchart_bars import (
    TapeError,
    build_eurusd_tape,
    eurusd_spec,
    market_is_open,
    parse_tape,
    sessions_at,
    tape_as_json,
    window_at,
)


class TapeTest(unittest.TestCase):
    def test_generator_round_trips_through_json(self) -> None:
        tape = build_eurusd_tape()
        self.assertEqual(tape_as_json(tape), tape_as_json(parse_tape(json.loads(tape_as_json(tape)))))

    def test_sample_is_a_liquid_eurusd_day(self) -> None:
        tape = build_eurusd_tape()
        spec = tape.spec
        self.assertEqual(spec.symbol, "EURUSD")
        self.assertEqual(spec.tick_size, Decimal("0.00001"))
        self.assertEqual(spec.lot_size, 100_000)
        self.assertEqual(spec.timezone.key, "America/New_York")
        self.assertEqual(
            [(session.name, session.open.hour, session.close.hour) for session in spec.sessions],
            [("asia", 17, 3), ("london", 3, 12), ("new_york", 8, 17)],
        )
        self.assertEqual(spec.market.open.weekday, "Sun")
        self.assertEqual(spec.market.open.time.hour, 17)
        self.assertEqual(spec.market.close.weekday, "Fri")
        self.assertEqual(spec.market.close.time.hour, 17)

        self.assertEqual(len(tape.bars), 24 * 60)
        first = tape.bars[0]
        last = tape.bars[-1]
        self.assertEqual(first.open_time, support.et(2024, 6, 2, 17, 0))
        self.assertEqual(last.close_time, support.et(2024, 6, 3, 17, 0))
        tick = spec.tick_size
        for previous, bar in zip(tape.bars, tape.bars[1:]):
            self.assertEqual(bar.open_time, previous.close_time)
            self.assertGreater(bar.volume, 0)
            self.assertLessEqual(bar.high - bar.low, tick * 20)

        end = support.et(2024, 6, 3, 17, 0)
        self.assertEqual(len(window_at(tape, end, "1m").bars), 1440)
        self.assertEqual(len(window_at(tape, end, "5m").bars), 288)
        self.assertEqual(len(window_at(tape, end, "15m").bars), 96)
        self.assertEqual(len(window_at(tape, end, "1h").bars), 24)
        self.assertEqual(len(window_at(tape, end, "4h").bars), 6)
        self.assertEqual(window_at(tape, first.open_time, "1m").bars, ())

    def test_sessions_follow_the_new_york_clock(self) -> None:
        spec = eurusd_spec()
        self.assertEqual(sessions_at(spec, support.et(2024, 6, 2, 17, 0)), ("asia",))
        self.assertTrue(market_is_open(spec, support.et(2024, 6, 2, 17, 0)))
        self.assertFalse(market_is_open(spec, support.et(2024, 6, 2, 16, 59)))
        self.assertEqual(sessions_at(spec, support.et(2024, 6, 3, 2, 0)), ("asia",))
        self.assertEqual(sessions_at(spec, support.et(2024, 6, 3, 3, 0)), ("london",))
        self.assertEqual(sessions_at(spec, support.et(2024, 6, 3, 5, 0)), ("london",))
        self.assertEqual(sessions_at(spec, support.et(2024, 6, 3, 10, 0)), ("london", "new_york"))
        self.assertEqual(sessions_at(spec, support.et(2024, 6, 3, 18, 0)), ("asia",))
        self.assertTrue(market_is_open(spec, support.et(2024, 6, 7, 16, 59)))
        self.assertFalse(market_is_open(spec, support.et(2024, 6, 7, 17, 0)))
        saturday = support.et(2024, 6, 8, 20, 0)
        self.assertFalse(market_is_open(spec, saturday))
        self.assertEqual(sessions_at(spec, saturday), ())

    def test_price_must_be_a_decimal_string(self) -> None:
        raw = json.loads(tape_as_json(build_eurusd_tape()))
        raw["bars"][0]["open"] = 1.085
        with self.assertRaises(TapeError):
            parse_tape(raw)

    def test_bar_must_cover_one_minute(self) -> None:
        raw = json.loads(tape_as_json(build_eurusd_tape()))
        raw["bars"][0]["closeTime"] = "2024-06-02T21:02:00Z"
        with self.assertRaises(TapeError):
            parse_tape(raw)

    def test_cursor_and_timeframe_are_checked(self) -> None:
        tape = build_eurusd_tape()
        with self.assertRaises(TapeError):
            window_at(tape, datetime(2024, 6, 2, 17, 14), "15m")
        with self.assertRaises(TapeError):
            window_at(tape, support.et(2024, 6, 2, 17, 14), "2m")

    def test_license_and_dependency_record(self) -> None:
        license_text = (support.REPO_ROOT / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("Apache License", license_text)
        self.assertIn("Version 2.0, January 2004", license_text)
        policy = (support.REPO_ROOT / "docs" / "dependencies.md").read_text(encoding="utf-8")
        self.assertIn("Apache-2.0", policy)
        self.assertIn("KLineChart", policy)
        self.assertIn("lightweight-charts", policy)

    def test_one_minute_window_is_the_closed_prefix(self) -> None:
        tape = build_eurusd_tape()
        cursor = tape.bars[30].close_time
        window = window_at(tape, cursor, "1m")
        self.assertEqual(window.bars, tape.bars[:31])
        self.assertEqual(window.cursor, cursor)
        self.assertEqual(window.spec.symbol, "EURUSD")
        later = cursor + timedelta(minutes=5)
        self.assertNotIn(tape.bars[31], window_at(tape, cursor, "1m").bars)
        self.assertIn(tape.bars[31], window_at(tape, later, "1m").bars)


if __name__ == "__main__":
    unittest.main()
