# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""User CSV import. The rows below are synthetic."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from support import SRC  # noqa: F401

from flowchart_multi import get_symbol, import_csv, window_at
from flowchart_multi.errors import MultiInstrumentError
from flowchart_multi.times import parse_timestamp

HEADER = "openTime,open,high,low,close,volume\n"
ROWS = (
    "2024-06-02T21:00:00Z,1.10000,1.10020,1.09980,1.10010,3\n"
    "2024-06-02T21:01:00Z,1.10010,1.10040,1.10000,1.10030,4\n"
    "2024-06-02T21:02:00Z,1.10030,1.10030,1.10020,1.10020,1\n"
)


class CsvImportTests(unittest.TestCase):
    def test_text_and_path_build_a_tape(self) -> None:
        euro = get_symbol("EURUSD")
        history = import_csv(HEADER + ROWS, euro)
        self.assertEqual(len(history.bars), 3)
        self.assertEqual(history.spec, euro)
        cursor = parse_timestamp("2024-06-02T21:02:00Z", field="cursor")
        self.assertEqual(len(window_at(history, cursor, "1m").bars), 2)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "minutes.csv"
            path.write_text("\ufeff" + HEADER + ROWS, encoding="utf-8")
            self.assertEqual(import_csv(path, euro), history)

    def test_optional_close_and_symbol(self) -> None:
        text = (
            "openTime,closeTime,open,high,low,close,volume,symbol\n"
            "2024-06-02T21:00:00Z,2024-06-02T21:01:00Z,1.10000,1.10000,1.10000,1.10000,1,EURUSD\n"
        )
        history = import_csv(text, get_symbol("EURUSD"))
        self.assertEqual(len(history.bars), 1)

    def test_rejects_bad_rows(self) -> None:
        euro = get_symbol("EURUSD")
        cases = [
            HEADER + "2024-06-02T21:00:00Z,1.10000,1.10000,1.20000,1.10000,1\n",
            HEADER + "2024-06-02T21:00:00Z,1e-1,1e-1,1e-1,1e-1,1\n",
            HEADER + "2024-06-02T21:00:30Z,1.10000,1.10000,1.10000,1.10000,1\n",
            (
                "openTime,closeTime,open,high,low,close,volume\n"
                "2024-06-02T21:00:00Z,2024-06-02T21:02:00Z,1.10000,1.10000,1.10000,1.10000,1\n"
            ),
            HEADER + "2024-06-02T21:01:00Z,1.10000,1.10000,1.10000,1.10000,1\n"
            "2024-06-02T21:00:00Z,1.10000,1.10000,1.10000,1.10000,1\n",
            HEADER + "2024-06-02T21:00:00Z,1.10000,1.10000,1.10000,1.10000,1.0\n",
            "open,high,low,close\n1,1,1,1\n",
            HEADER,
            HEADER + "note,1.10000,1.10000,1.10000,1.10000,1\n",
        ]
        for text in cases:
            with self.assertRaises(MultiInstrumentError):
                import_csv(text, euro)
        with self.assertRaises(MultiInstrumentError):
            import_csv(
                "openTime,open,high,low,close,volume,symbol\n"
                "2024-06-02T21:00:00Z,1.10000,1.10000,1.10000,1.10000,1,GBPUSD\n",
                euro,
            )


if __name__ == "__main__":
    unittest.main()
