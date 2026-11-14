# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Tape file: decimal strings, one duration, no bundled market data."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from flowchart_bars import BarsError, eurusd_spec, load_tape, tape_from_json, tape_to_json

from support import at_ny, minute, tape


class TapeTests(unittest.TestCase):
    def test_json_round_trip_keeps_decimal_strings(self) -> None:
        source = tape(minute(at_ny(2024, 6, 2, 17, 0), "1.10000", high="1.10020", low="1.09990", close="1.10010"))
        parsed = tape_from_json(tape_to_json(source))
        self.assertEqual(parsed.format, "flowchart.tape")
        self.assertEqual(parsed.version, 1)
        self.assertEqual(parsed.spec.symbol, "EURUSD")
        self.assertEqual(parsed.spec.tick_size, "0.00001")
        self.assertEqual(parsed.bars[0].open, "1.10000")
        self.assertEqual(parsed.bars[0].high, "1.10020")
        self.assertEqual(parsed.bars[0].volume, "1")

    def test_json_number_is_rejected(self) -> None:
        body = {
            "format": "flowchart.tape",
            "version": 1,
            "spec": {
                "symbol": "EURUSD",
                "tickSize": "0.00001",
                "lotSize": "100000",
                "timezone": "America/New_York",
                "sessions": {"London": {"open": "03:00", "close": "12:00"}},
                "market": {
                    "open": {"weekday": "Sun", "time": "17:00"},
                    "close": {"weekday": "Fri", "time": "17:00"},
                },
            },
            "bars": [
                {
                    "openTime": "2024-06-02T21:00:00Z",
                    "closeTime": "2024-06-02T21:01:00Z",
                    "open": 1.1,
                    "high": "1.1",
                    "low": "1.1",
                    "close": "1.1",
                    "volume": "1",
                }
            ],
        }
        with self.assertRaises(BarsError) as caught:
            tape_from_json(json.dumps(body))
        self.assertEqual(caught.exception.code, "invalid_bar")

    def test_load_tape_reads_a_caller_path(self) -> None:
        text = tape_to_json(tape(minute(at_ny(2024, 6, 2, 17, 0), "1.10000")))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "eurusd.json"
            path.write_text(text, encoding="utf-8")
            loaded = load_tape(path)
        self.assertEqual(loaded.bars[0].close, "1.10000")

    def test_unsorted_and_overlap_are_rejected(self) -> None:
        later = minute(at_ny(2024, 6, 2, 17, 5), "1.1")
        earlier = minute(at_ny(2024, 6, 2, 17, 0), "1.1")
        with self.assertRaises(BarsError):
            tape_to_json(tape(later, earlier))
        overlap = minute(at_ny(2024, 6, 2, 17, 0, 30), "1.1")
        with self.assertRaises(BarsError) as caught:
            tape_to_json(tape(earlier, overlap))
        self.assertIn("overlap", str(caught.exception))

    def test_high_must_cover_the_close(self) -> None:
        with self.assertRaises(BarsError):
            minute(at_ny(2024, 6, 2, 17, 0), "1.10", high="1.10", low="1.00", close="1.20")

    def test_unknown_timezone_is_rejected(self) -> None:
        text = tape_to_json(tape(minute(at_ny(2024, 6, 2, 17, 0), "1")))
        broken = text.replace("America/New_York", "Not/AZone")
        with self.assertRaises(BarsError):
            tape_from_json(broken)

    def test_package_ships_no_market_data(self) -> None:
        root = Path(__file__).resolve().parents[1]
        config = {"package.json", "package-lock.json", "tsconfig.json"}
        banned = {".csv", ".json", ".parquet"}
        found = [
            path
            for path in root.rglob("*")
            if path.is_file()
            and path.suffix.lower() in banned
            and path.name not in config
            and "node_modules" not in path.parts
        ]
        self.assertEqual(found, [])
        self.assertEqual(eurusd_spec().timezone, "America/New_York")


if __name__ == "__main__":
    unittest.main()
