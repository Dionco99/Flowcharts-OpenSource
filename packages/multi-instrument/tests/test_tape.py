# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Cursor rule: a higher-timeframe bar waits until its minutes have closed."""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

from support import custom_spec, flat, ny, series, tape, utc

from flowchart_multi import forming_bar, get_symbol, load_tape, tape_from_json, tape_to_json, window_at
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.spec import spec_to_mapping


def _sunday_prices(count: int) -> tuple:
    start = ny(2024, 6, 2, 17, 0)
    prices = [f"1.{10000 + index:05d}" for index in range(count)]
    return tape("EURUSD", series(start, prices))


class TapeTests(unittest.TestCase):
    def test_fifteen_minute_bar_waits_for_its_close(self) -> None:
        history = _sunday_prices(20)
        early = ny(2024, 6, 2, 17, 14)
        closed = ny(2024, 6, 2, 17, 15)
        self.assertEqual(window_at(history, early, "15m").bars, ())
        forming = forming_bar(history, early, "15m")
        self.assertIsNotNone(forming)
        assert forming is not None
        self.assertEqual(forming.close_time, ny(2024, 6, 2, 17, 15))
        self.assertGreater(forming.close_time, early.astimezone(forming.close_time.tzinfo))
        window = window_at(history, closed, "15m")
        self.assertEqual(len(window.bars), 1)
        bar = window.bars[0]
        self.assertEqual(bar.open_time, ny(2024, 6, 2, 17, 0))
        self.assertEqual(bar.close_time, ny(2024, 6, 2, 17, 15))
        self.assertEqual(bar.open, history.bars[0].open)
        self.assertEqual(bar.close, history.bars[14].close)
        self.assertEqual(bar.volume, 15)
        self.assertIsNone(forming_bar(history, closed, "15m"))
        self.assertIsNone(forming_bar(history, closed, "1m"))
        self.assertEqual(len(window_at(history, closed, "1m").bars), 15)

    def test_cursor_with_seconds_and_a_utc_instant(self) -> None:
        history = _sunday_prices(16)
        almost = ny(2024, 6, 2, 17, 14) + timedelta(seconds=30)
        self.assertEqual(window_at(history, almost, "15m").bars, ())
        same_instant = utc(2024, 6, 2, 21, 15)
        self.assertEqual(len(window_at(history, same_instant, "15m").bars), 1)

    def test_missing_minute_does_not_hold_the_bar_open(self) -> None:
        start = ny(2024, 6, 2, 17, 0)
        bars = []
        for index in range(15):
            if index == 7:
                continue
            bars.append(flat(start + timedelta(minutes=index), "1.10000", volume=1))
        history = tape("EURUSD", tuple(bars))
        early = window_at(history, ny(2024, 6, 2, 17, 14), "15m")
        self.assertEqual(early.bars, ())
        closed = window_at(history, ny(2024, 6, 2, 17, 15), "15m")
        self.assertEqual(len(closed.bars), 1)
        self.assertEqual(closed.bars[0].volume, 14)
        self.assertEqual(closed.bars[0].open_time, start)

    def test_four_hour_sunday_bar_closes_at_21(self) -> None:
        start = ny(2024, 6, 2, 17, 0)
        later = ny(2024, 6, 2, 20, 59)
        history = tape("EURUSD", (flat(start, "1.10000"), flat(later, "1.20000")))
        at_eight = ny(2024, 6, 2, 20, 0)
        self.assertEqual(window_at(history, at_eight, "4h").bars, ())
        forming = forming_bar(history, at_eight, "4h")
        assert forming is not None
        self.assertEqual(forming.close, history.bars[0].close)
        self.assertEqual(forming.close_time, ny(2024, 6, 2, 21, 0))
        closed = window_at(history, ny(2024, 6, 2, 21, 0), "4h")
        self.assertEqual(len(closed.bars), 1)
        self.assertEqual(closed.bars[0].open, history.bars[0].open)
        self.assertEqual(closed.bars[0].close, history.bars[1].close)
        self.assertEqual(closed.bars[0].close_time, ny(2024, 6, 2, 21, 0))

    def test_daylight_saving_keeps_a_real_hour(self) -> None:
        spring = utc(2024, 3, 10, 6, 0)
        spring_bars = series(spring, ["1.10000"] * 60)
        history = tape("EURUSD", spring_bars)
        self.assertEqual(window_at(history, utc(2024, 3, 10, 6, 59), "1h").bars, ())
        closed = window_at(history, utc(2024, 3, 10, 7, 0), "1h")
        self.assertEqual(len(closed.bars), 1)
        self.assertEqual(closed.bars[0].close_time - closed.bars[0].open_time, timedelta(hours=1))
        self.assertEqual(closed.bars[0].close_time, utc(2024, 3, 10, 7, 0))

        fall = utc(2024, 11, 3, 5, 0)
        fall_history = tape("EURUSD", series(fall, ["1.10000"] * 60))
        fall_bar = window_at(fall_history, utc(2024, 11, 3, 6, 0), "1h").bars[0]
        self.assertEqual(fall_bar.close_time - fall_bar.open_time, timedelta(hours=1))

    def test_json_rejects_numeric_prices_and_round_trips(self) -> None:
        history = tape("EURUSD", (flat(ny(2024, 6, 2, 17, 0), "1.10000"),))
        text = tape_to_json(history)
        self.assertEqual(tape_from_json(text), history)
        payload = json.loads(text)
        payload["bars"][0]["open"] = 1.1
        with self.assertRaises(MultiInstrumentError):
            tape_from_json(json.dumps(payload))
        payload = json.loads(text)
        payload["bars"][0]["close"] = 1
        with self.assertRaises(MultiInstrumentError):
            tape_from_json(json.dumps(payload))

    def test_bar_data_spec_must_match_the_registry(self) -> None:
        history = tape("EURUSD", (flat(ny(2024, 6, 2, 17, 0), "1.10000"),))
        payload = json.loads(tape_to_json(history))
        core = {
            key: payload["spec"][key]
            for key in ("symbol", "tickSize", "lotSize", "timezone", "sessions", "market")
        }
        payload["spec"] = core
        loaded = tape_from_json(json.dumps(payload))
        self.assertEqual(loaded.spec, get_symbol("EURUSD"))
        core["tickSize"] = "0.0001"
        payload["spec"] = core
        with self.assertRaises(MultiInstrumentError):
            tape_from_json(json.dumps(payload))

    def test_unknown_symbol_needs_a_full_spec(self) -> None:
        spec = custom_spec()
        history = tape_from_json(
            json.dumps(
                {
                    "format": "flowchart.tape",
                    "version": 1,
                    "spec": spec_to_mapping(spec),
                    "bars": [
                        {
                            "openTime": "2024-06-02T21:00:00Z",
                            "closeTime": "2024-06-02T21:01:00Z",
                            "open": "1.10000",
                            "high": "1.10000",
                            "low": "1.10000",
                            "close": "1.10000",
                            "volume": 1,
                        }
                    ],
                }
            )
        )
        self.assertEqual(history.spec.symbol, "CUSTOM")
        with self.assertRaises(MultiInstrumentError):
            tape_from_json(
                json.dumps(
                    {
                        "format": "flowchart.tape",
                        "version": 1,
                        "spec": {"symbol": "CUSTOM", "tickSize": "0.00001", "lotSize": "100000", "timezone": "America/New_York", "sessions": [], "market": {}},
                        "bars": [],
                    }
                )
            )

    def test_unsorted_bars_and_naive_cursor(self) -> None:
        first = flat(ny(2024, 6, 2, 17, 1), "1.10000")
        second = flat(ny(2024, 6, 2, 17, 0), "1.10000")
        with self.assertRaises(MultiInstrumentError):
            tape("EURUSD", (first, second))
        history = tape("EURUSD", (second,))
        with self.assertRaises(MultiInstrumentError):
            window_at(history, ny(2024, 6, 2, 17, 1).replace(tzinfo=None), "1m")

    def test_load_tape_reads_a_caller_file(self) -> None:
        history = tape("GBPUSD", (flat(ny(2024, 6, 2, 17, 0), "1.25000"),))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "tape.json"
            path.write_text(tape_to_json(history), encoding="utf-8")
            self.assertEqual(load_tape(path), history)


if __name__ == "__main__":
    unittest.main()
