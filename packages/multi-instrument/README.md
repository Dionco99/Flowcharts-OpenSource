# multi-instrument

A second symbol on the same replay cursor as `packages/bars`, plus compare and ratio of two closes. Stage 1 of the desk stays one symbol. This package is the library for the next one.

The cursor is a timestamp. A pane shows a bar only after that bar has closed. Prices are decimal strings. The desk supplies the tape. This package does not bundle Binance Vision, Dukascopy, or HistData files, and it does not depend on the CCXT package.

## Registry

`get_symbol` and `search_symbols` read specs only: tick, lot, pip value, sessions, and, where they apply, a funding schedule or a futures rollover note. Forex majors, minors, and exotics, XAUUSD, XAGUSD, GC, ES, NQ, CL, and the BTCUSDT and ETHUSDT perpetuals are included. A future root has no expiry calendar. A perpetual has no funding rate. Both come from the desk.

```python
from flowchart_multi import get_symbol, pip_value, search_symbols

euro = get_symbol("EURUSD")
pip_value(euro, "USD")  # 10, one pip on one lot
[spec.symbol for spec in search_symbols("gold")]
```

## Two charts, one clock

```python
from datetime import datetime
from zoneinfo import ZoneInfo

from flowchart_multi import TwoChartReplay, get_symbol, import_csv

def minutes(symbol, price):
    text = (
        "openTime,open,high,low,close,volume\n"
        f"2024-06-02T21:00:00Z,{price},{price},{price},{price},1\n"
    )
    return import_csv(text, get_symbol(symbol))

cursor = datetime(2024, 6, 2, 17, 14, tzinfo=ZoneInfo("America/New_York"))
view = TwoChartReplay(minutes("EURUSD", "1.10000"), minutes("GBPUSD", "1.25000"), cursor, "15m").view()
# view.left.bars is empty. The 17:00 bar closes at 17:15.
# view.compare holds shared closes: left minus right, and the ratio.
```

`seek`, `step`, and `step_next_print` move that one cursor. Play and pause stay in `packages/replay`.

## Bringing bars in

- `load_tape` reads a `flowchart.tape` JSON file. A known symbol may use the short spec from `packages/bars` and must match the registry.
- `import_csv` reads `openTime,open,high,low,close,volume` from text or a path the caller already has.
- `tape_from_ccxt` calls `fetch_ohlcv` on a loader. `MockCcxtKlineLoader` returns rows the caller stored. `CcxtKlineLoader` does not open a connection. Only `1m` klines become a tape.

Higher timeframes are `5m`, `15m`, `1h`, and `4h`, built from those minutes. Buckets line up on the symbol's market-open time. Across a daylight-saving change the close is still one timeframe of real time after the open.

## Tests

```bash
PYTHONPATH=packages/multi-instrument/src python3 -m unittest discover -s packages/multi-instrument/tests -v
```

Apache-2.0. See [docs/dependencies.md](../../docs/dependencies.md).
