# Bar data

Replay shares one tape: a symbol spec and a 1-minute history. The cursor is a timestamp. Studies, fills, and chart panes read the spec plus the bars whose close time is at or before the cursor. Higher timeframes are built from those minutes. A 15-minute bar stays open until the cursor reaches the close of its fifteenth minute. Minutes already sitting in the file stay hidden until then.

Package: `packages/bars` (`flowchart_bars`). A desk supplies the tape. This repository does not store one. `build_eurusd_tape` builds a synthetic EURUSD day in memory for tests (seed `20240602`).

## File

A tape is one JSON object.

- `format` is `flowchart.tape`. `version` is `1`.
- `spec` is the symbol. `bars` is the 1-minute history, oldest first.
- Timestamps are UTC, `YYYY-MM-DDTHH:MM:SSZ`.
- Prices are decimal strings. A JSON number is rejected, so a tick of `0.00001` stays exact.

## Symbol spec

- `symbol` — the instrument name.
- `tickSize` — price increment, as a decimal string.
- `lotSize` — base-currency units in one lot.
- `timezone` — IANA zone. Session hours and the bar clock use this zone.
- `sessions` — named windows. `open` and `close` are `HH:MM` in that zone. When the window crosses midnight, `close` is earlier than `open`. The close minute is outside the window.
- `market` — the week open and the week close. Each has a `weekday` (`Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`) and a `time`. The market is open from the open instant until, and not including, the close instant.

`build_eurusd_tape` uses EURUSD, tick `0.00001`, lot `100000`, zone `America/New_York`. Asia is `17:00`–`03:00`, London is `03:00`–`12:00`, and New York is `08:00`–`17:00`. The week opens Sunday `17:00` and closes Friday `17:00`.

Hours stay in the symbol timezone. The desk converts them into the viewer's clock when it shades a session.

Higher-timeframe buckets line up on the market open's time of day. For that EURUSD spec the anchor is `17:00` New York. Five-minute, fifteen-minute, and one-hour bars land on the usual clock because that anchor is already on those boundaries. Four-hour bars close at `21:00`, `01:00`, `05:00`, `09:00`, `13:00`, and `17:00`. The Sunday `17:00` bar is still open at `20:00` and closes at `21:00`.

## One-minute bars

Each bar has `openTime`, `closeTime`, `open`, `high`, `low`, `close`, and `volume`.

`closeTime` is `openTime` plus one minute. That close time is when the bar joins the window. `volume` is a whole number of prints.

A cursor of 17:14 New York includes the minute that closes at 17:14 and excludes the minute that closes at 17:15.

## Aggregation

The timeframes are `1m`, `5m`, `15m`, `1h`, and `4h`.

`1m` is the closed minutes. Each other timeframe groups those minutes into a bucket. The bucket opens on the anchor grid and closes one timeframe of real time later. Its open price is the first included minute's open, its close price is the last included minute's close, its high and low are the extremes, and its volume is the sum.

The bucket stays out of the window while its close is after the cursor. On the synthetic day, the 17:00 fifteen-minute bar is absent at 17:14 New York and present at 17:15, built only from those fifteen minutes. The same wait applies to 5-minute, 1-hour, and 4-hour bars. After the cursor reaches the bucket's end, the bar closes from the minutes that printed. A missing print does not hold it open past that end.

`forming_bar` is the in-progress bucket, for a pane drawing the current candle. Its close time is still after the cursor. It is not part of the window.

Across a daylight-saving change the close remains one timeframe of real time after the open, so the bar waits for a clock time that actually occurs.

## How the replay desk loads it

1. Call `load_tape` once on the desk's own file and keep `tape.spec` and `tape.bars`.
2. When the cursor moves, call `window_at(tape, cursor, timeframe)`.
3. Pass `window.spec` and `window.bars` to studies and to the fill check. Every bar in that list is already closed.
4. Draw the current candle from `forming_bar(tape, cursor, timeframe)` when the pane needs it, and leave it out of the study window.
5. Step, play, and seek move the cursor. The file stays as it was.

```python
from datetime import datetime
from zoneinfo import ZoneInfo

from flowchart_bars import build_eurusd_tape, window_at

tape = build_eurusd_tape()
cursor = datetime(2024, 6, 2, 17, 14, tzinfo=ZoneInfo("America/New_York"))
window = window_at(tape, cursor, "15m")
# window.bars is empty. The 17:00 bar closes at 17:15.
```

Tests in `packages/bars/tests` cover this close rule on a hand-built series and on the synthetic day.
