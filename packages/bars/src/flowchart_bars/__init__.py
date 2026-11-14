# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Cursor-gated bars for Flowchart replay.

The window is the symbol spec plus the bars whose close time is at or before
the cursor. Higher timeframes are aggregated from those minutes. A bucket
stays open until the cursor reaches its close.
"""

from flowchart_bars.aggregate import aggregate, forming_bar, window_at
from flowchart_bars.model import (
    FORMAT,
    TIMEFRAMES,
    VERSION,
    Bar,
    MarketWeek,
    SessionHours,
    SymbolSpec,
    Tape,
    TapeError,
    WeekPoint,
    Window,
    market_is_open,
    sessions_at,
)
from flowchart_bars.sample import build_eurusd_tape, eurusd_spec
from flowchart_bars.tape import dump_tape, load_tape, parse_tape, tape_as_json

__version__ = "0.1.0"

__all__ = [
    "FORMAT",
    "TIMEFRAMES",
    "VERSION",
    "Bar",
    "MarketWeek",
    "SessionHours",
    "SymbolSpec",
    "Tape",
    "TapeError",
    "WeekPoint",
    "Window",
    "aggregate",
    "build_eurusd_tape",
    "dump_tape",
    "eurusd_spec",
    "forming_bar",
    "load_tape",
    "market_is_open",
    "parse_tape",
    "sessions_at",
    "tape_as_json",
    "window_at",
]
