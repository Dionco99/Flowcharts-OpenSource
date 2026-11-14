# bars

Symbol spec and the bars a desk supplies. The cursor is a timestamp. Higher timeframes are built from source bars whose close is at or before that cursor. A higher-timeframe bar stays hidden until the cursor reaches the bucket close. Prices stay decimal strings. This package ships no market-data file.

`@flowchart/bars` `aggregate` builds `1m`, `5m`, `15m`, `1h`, and `4h` from minutes whose close is at or before the cursor. Prices are decimal strings.

`flowchart_bars` is the Python library for calendar buckets, session days, seconds, and tick bars. It is Apache-2.0 and has no runtime dependencies.

## Timeframes

`window_at(tape, cursor, timeframe)` returns the closed bars. `forming_bar` is the open bucket and is not part of that window. On `1m` and `1s` the source bars are already closed, so `forming_bar` is absent.

| Text | Bucket |
| --- | --- |
| `15s` | Fixed seconds from 1970-01-01 00:00 UTC. The source tape is finer than one minute. |
| `7m`, `2h` | Real-time steps from the session anchor. A step that would pass the next anchor is clipped, so `7m` ends a 24-hour session day with a five-minute bar. |
| `1D`, `3D` | Session days. The phase is counted from Sunday 1970-01-04. `3D` closes at the anchor clock three session days later. |
| `1W`, `2W` | Market weeks, from the market open to the market close. `2W` groups weeks from that same Sunday origin. |
| `1M`, `3M` | Civil months in the symbol zone. `3M` is a quarter (January, April, July, October). |

`alignment="calendar"` uses UTC instead of the session clock: minutes, hours, and days are fixed lengths from the epoch, weeks start on Monday 00:00 UTC, and months start on the first at 00:00 UTC. Seconds are fixed from the epoch either way.

`session="London"` moves the minute, hour, and session-day anchor to that session's open. The bucket still runs until the next open, not until the session's close.

Across a daylight-saving change, a minute or hour close is one real-time span after its open. A session day closes at the same civil clock, which is 23 real hours on the New York spring-forward.

A missing source bar does not hold a bucket open past its end. A weekend print is outside a market week.

## Tick bars

`tick_bars(trades, count, cursor)` builds one bar per `count` trades the caller supplies. Trades after the cursor are ignored. A short tail is the forming bar, not a closed bar.

## Tape

`format` is `flowchart.tape` and `version` is `1`. Timestamps are `YYYY-MM-DDTHH:MM:SSZ`. Prices are decimal strings. A JSON number is rejected. Bars in one tape share one duration, oldest first. A gap is allowed.

`eurusd_spec()` is the sample clock: `America/New_York`, tick `0.00001`, lot `100000`. Asia is `17:00`–`03:00`, London is `03:00`–`12:00`, and New York is `08:00`–`17:00`. The week opens Sunday `17:00` and closes Friday `17:00`. The close minute is outside the week.

## Tests

```bash
npm test -w @flowchart/bars
PYTHONPATH=packages/bars/src python3 -m unittest discover -s packages/bars/tests -v
```

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
