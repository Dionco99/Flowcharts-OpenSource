# bars

Symbol spec and the 1-minute tape. The cursor is a timestamp. Higher timeframes are built from minutes whose close is at or before that cursor. Prices stay decimal strings. Market-data files stay out of this package; a desk supplies its own tape.

A 15-minute bar stays open until the cursor reaches the close of its fifteenth minute. The same wait applies to `5m`, `1h`, and `4h`. The file format is described in [docs/bar-data.md](docs/bar-data.md).

Licensed under the Apache License, Version 2.0. See the repository [LICENSE](../../LICENSE) and [docs/dependencies.md](../../docs/dependencies.md). This package has no runtime dependencies.

## Use

```python
from datetime import datetime
from zoneinfo import ZoneInfo

from flowchart_bars import build_eurusd_tape, load_tape, window_at

tape = load_tape("path/to/your-tape.json")
# Tests build a synthetic EURUSD day in memory. It is not stored in the repo.
tape = build_eurusd_tape()
cursor = datetime(2024, 6, 2, 17, 14, tzinfo=ZoneInfo("America/New_York"))
window = window_at(tape, cursor, "15m")
assert window.bars == ()
```

## Tests

From the repository root:

```bash
python3 -m unittest discover -s packages/bars/tests -v
```
