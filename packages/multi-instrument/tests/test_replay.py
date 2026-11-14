# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Two charts, one cursor."""

from __future__ import annotations

import unittest
from datetime import timedelta
from decimal import Decimal

from support import flat, ny, series, tape, utc

from flowchart_multi import TwoChartReplay, window_at
from flowchart_multi.errors import MultiInstrumentError


class ReplayTests(unittest.TestCase):
    def test_one_step_reveals_both_fifteen_minute_bars(self) -> None:
        start = ny(2024, 6, 2, 17, 0)
        left = tape("EURUSD", series(start, ["1.10000"] * 16))
        right = tape("GBPUSD", series(start, ["1.25000"] * 16))
        replay = TwoChartReplay(left, right, ny(2024, 6, 2, 17, 14), "15m")
        before = replay.view()
        self.assertEqual(before.left.bars, ())
        self.assertEqual(before.right.bars, ())
        self.assertIsNotNone(before.left_forming)
        self.assertIsNotNone(before.right_forming)
        replay.step()
        after = replay.view()
        self.assertEqual(after.cursor, before.cursor + timedelta(minutes=1))
        self.assertEqual(len(after.left.bars), 1)
        self.assertEqual(len(after.right.bars), 1)
        self.assertEqual(after.left.bars[0].close_time, after.right.bars[0].close_time)
        self.assertEqual(len(after.compare), 1)
        self.assertEqual(after.compare[0].left_close, Decimal("1.10000"))
        self.assertEqual(after.compare[0].right_close, Decimal("1.25000"))
        self.assertEqual(after.compare[0].compare, Decimal("1.10000") - Decimal("1.25000"))
        self.assertEqual(after.compare[0].ratio, Decimal("1.10000") / Decimal("1.25000"))
        replay.seek(ny(2024, 6, 2, 17, 14))
        hidden = replay.view()
        self.assertEqual(hidden.left.bars, ())
        self.assertEqual(hidden.right.bars, ())

    def test_views_match_each_tape_at_the_same_cursor(self) -> None:
        start = ny(2024, 6, 3, 10, 0)
        left = tape("EURUSD", series(start, ["1.10000", "1.10010"]))
        right = tape("BTCUSDT", (flat(utc(2024, 6, 3, 14, 0), "60000.0"), flat(utc(2024, 6, 3, 14, 1), "60010.0")))
        replay = TwoChartReplay(left, right, ny(2024, 6, 3, 10, 0), "1m")
        self.assertEqual(replay.view().left.bars, ())
        self.assertEqual(replay.view().right.bars, ())
        replay.step()
        view = replay.view()
        self.assertEqual(view.left, window_at(left, replay.cursor, "1m"))
        self.assertEqual(view.right, window_at(right, replay.cursor, "1m"))
        self.assertEqual(len(view.left.bars), 1)
        self.assertEqual(len(view.right.bars), 1)
        self.assertEqual(view.compare[0].close_time, utc(2024, 6, 3, 14, 1))

    def test_next_print_uses_the_earlier_tape(self) -> None:
        left = tape("EURUSD", (flat(ny(2024, 6, 2, 17, 5), "1.10000"),))
        right = tape("GBPUSD", (flat(ny(2024, 6, 2, 17, 2), "1.25000"),))
        replay = TwoChartReplay(left, right, ny(2024, 6, 2, 17, 0), "1m")
        replay.step_next_print()
        view = replay.view()
        self.assertEqual(view.right.bars[0].close_time, ny(2024, 6, 2, 17, 3))
        self.assertEqual(view.left.bars, ())
        self.assertEqual(view.compare, ())
        replay.step_next_print()
        both = replay.view()
        self.assertEqual(len(both.left.bars), 1)
        self.assertEqual(len(both.right.bars), 1)
        with self.assertRaises(MultiInstrumentError):
            replay.step_next_print()

    def test_aligned_closes_skip_a_one_sided_minute(self) -> None:
        start = ny(2024, 6, 2, 17, 0)
        left = tape("EURUSD", series(start, ["1.10000", "1.10010", "1.10020"]))
        right = tape("GBPUSD", (flat(start, "1.25000"), flat(start + timedelta(minutes=2), "1.25020")))
        replay = TwoChartReplay(left, right, ny(2024, 6, 2, 17, 3), "1m")
        points = replay.view().compare
        self.assertEqual(len(points), 2)
        self.assertEqual(points[0].close_time, start + timedelta(minutes=1))
        self.assertEqual(points[1].close_time, start + timedelta(minutes=3))

    def test_step_rejects_zero(self) -> None:
        history = tape("EURUSD", (flat(ny(2024, 6, 2, 17, 0), "1.10000"),))
        replay = TwoChartReplay(history, history, ny(2024, 6, 2, 17, 0))
        with self.assertRaises(MultiInstrumentError):
            replay.step(0)


if __name__ == "__main__":
    unittest.main()
