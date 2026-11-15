# SPDX-License-Identifier: Apache-2.0
"""Closed custom windows and the one-symbol registry for the desk."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from flowchart_bars import eurusd_spec, make_bar, window_at
from flowchart_bars.tape import Tape
from flowchart_multi import get_symbol, pip_value, sessions_at, symbols


def stamp(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, timezone.utc)


def main() -> None:
    payload = json.load(sys.stdin)
    cursor = stamp(int(payload["cursor"]))
    spec = eurusd_spec()
    bars = []
    for row in payload["minutes"]:
        opened = int(row["t"])
        bars.append(
            make_bar(
                stamp(opened),
                stamp(opened + 60_000),
                row["o"],
                high=row["h"],
                low=row["l"],
                close=row["c"],
                volume="1",
            )
        )
    tape = Tape(spec, tuple(bars))
    windows = {}
    for timeframe in payload["timeframes"]:
        window = window_at(tape, cursor, timeframe)
        windows[timeframe] = len(window.bars)
    symbol = get_symbol("EURUSD")
    report = {
        "windows": windows,
        "symbol": symbol.symbol,
        "sessions": list(sessions_at(symbol, cursor)),
        "pip": format(pip_value(symbol, "USD", price=payload["price"]), "f"),
        "catalog": len(symbols()),
    }
    json.dump(report, sys.stdout)


if __name__ == "__main__":
    main()
