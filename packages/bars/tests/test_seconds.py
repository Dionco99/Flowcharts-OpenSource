# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Sub-minute bars from a finer tape. The last bucket waits for its close."""

from __future__ import annotations

import unittest
from datetime import timedelta

from flowchart_bars import BarsError, format_stamp, forming_bar, make_bar, window_at

from support import at_utc, minute, second, tape


class SecondTests(unittest.TestCase):
    def test_fifteen_seconds_hide_until_the_bucket_closes(self) -> None:
        start = at_utc(2024, 6, 2, 21, 0, 0)
        bars = tape(*(second(start + timedelta(seconds=offset), str(offset)) for offset in range(15) if offset != 7))
        hidden = window_at(bars, at_utc(2024, 6, 2, 21, 0, 14), "15s")
        self.assertEqual(hidden.bars, ())
        forming = forming_bar(bars, at_utc(2024, 6, 2, 21, 0, 14), "15s")
        assert forming is not None
        self.assertEqual(format_stamp(forming.close_time), "2024-06-02T21:00:15Z")
        self.assertEqual(forming.close, "13")
        self.assertEqual(forming.volume, "13")
        closed = window_at(bars, at_utc(2024, 6, 2, 21, 0, 15), "15s")
        self.assertEqual(format_stamp(closed.bars[0].open_time), "2024-06-02T21:00:00Z")
        self.assertEqual(format_stamp(closed.bars[0].close_time), "2024-06-02T21:00:15Z")
        self.assertEqual(closed.bars[0].open, "0")
        self.assertEqual(closed.bars[0].close, "14")
        self.assertEqual(closed.bars[0].volume, "14")

    def test_one_second_has_no_forming_bar(self) -> None:
        start = at_utc(2024, 6, 2, 21, 0, 0)
        bars = tape(second(start, "1"), second(start + timedelta(seconds=1), "2"))
        window = window_at(bars, at_utc(2024, 6, 2, 21, 0, 1), "1s")
        self.assertEqual([bar.close for bar in window.bars], ["1"])
        self.assertIsNone(forming_bar(bars, at_utc(2024, 6, 2, 21, 0, 1), "1s"))

    def test_minute_tape_cannot_build_seconds(self) -> None:
        bars = tape(minute(at_utc(2024, 6, 2, 21, 0), "1"))
        with self.assertRaises(BarsError) as caught:
            window_at(bars, at_utc(2024, 6, 2, 21, 1), "30s")
        self.assertEqual(caught.exception.code, "invalid_timeframe")

    def test_fine_tape_rejects_mixed_durations(self) -> None:
        opened = at_utc(2024, 6, 2, 21, 0, 0)
        mixed = tape(
            second(opened, "1"),
            make_bar(opened + timedelta(seconds=1), opened + timedelta(seconds=3), "1"),
        )
        with self.assertRaises(BarsError):
            window_at(mixed, opened + timedelta(seconds=3), "1s")


if __name__ == "__main__":
    unittest.main()
