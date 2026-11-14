# Parity

Living gap list. TradingView is the reference for charting through brokers. FX Replay is the reference for replay UX.

Status is what `main` contains. Checked on 2026-11-14 at [`5786800`](https://github.com/Dionco99/Flowcharts-OpenSource/commit/57868000ce77c36815b4c4e1496e69938d6bae57), the bootstrap commit: Apache-2.0 layout, package scaffolds, and the license check. No package implements a behavior. A README scaffold is `missing`, not `in progress`.

| Status | Count | Use it when |
| --- | --- | --- |
| shipped | 0 | The behavior is on `main` and tests cover it. |
| in progress | 0 | Part of the behavior is on `main`. |
| missing | 67 | `main` does not do this yet. |

A pull request that lands a behavior updates that row in this file. Homes are the packages in the [README](../README.md). Screener and watchlist have no package in the bootstrap. Charting is [KLineChart](https://github.com/klinecharts/KLineChart). The study language is Flowchart Script. See [dependencies.md](dependencies.md).

Journal, edge, and the risk package are in the layout and are outside this comparison.

## TradingView

### Charting

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Candles and OHLC bars | Solid, hollow, and bar styles on one symbol. | `packages/chart-tools` | missing |
| Line and area styles | Line, step line, area, baseline, columns, and high-low. | `packages/chart-tools` | missing |
| Heikin-Ashi | Synthetic candles from the source bars. | `packages/chart-tools` | missing |
| Brick chart types | Renko, Kagi, line break, point and figure, and range bars. | `packages/chart-tools` | missing |
| Price scales | Linear, logarithmic, and percentage. | `packages/chart-tools` | missing |
| Readout | Crosshair OHLC, last price, and countdown to bar close. | `packages/chart-tools` | missing |
| Chart render | A window of bars drawn with the chart library. | `packages/chart-tools` | missing |

### Drawings

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Lines | Segment, ray, and extended line. | `packages/chart-tools` | missing |
| Horizontal and vertical | Price lines and time lines, including rays and segments. | `packages/chart-tools` | missing |
| Fibonacci | Retracement, extension, fan, and time zone. | `packages/chart-tools` | missing |
| Channels | Parallel channel and pitchfork. | `packages/chart-tools` | missing |
| Shapes | Rectangle, ellipse, triangle, and brush. | `packages/chart-tools` | missing |
| Labels | Text, note, callout, and price label. | `packages/chart-tools` | missing |
| Position tool | Long or short with entry, stop, target, and R. | `packages/chart-tools` | missing |
| Drawing edits | Lock, magnet, and drawings that stay put across a seek. | `packages/chart-tools` | missing |

### Indicators

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Moving averages | EMA, SMA, and the other common averages on the window. | `packages/chart-tools` | missing |
| Oscillators | RSI, MACD, stochastic, and that family. | `packages/chart-tools` | missing |
| Volatility | Bollinger bands, Keltner channels, and average true range. | `packages/chart-tools` | missing |
| Volume | On-balance volume, VWAP, and the other volume studies. | `packages/chart-tools` | missing |
| Session levels | Session high and low, and the previous day's high and low. | `packages/chart-tools` | missing |
| Closed bars only | A study reads bars whose close is at or before the cursor. | `packages/chart-tools` | missing |

### Object tree

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Tree | A list of panes, studies, and drawings on the desk. | `packages/workspace` | missing |
| Manage from the tree | Show, hide, lock, and delete an object. | `packages/workspace` | missing |
| Undo | Undo and redo for drawings. | `packages/chart-tools` | missing |

### Custom studies

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Study expression | A person writes one expression over the bar window. TradingView uses Pine Script. Flowchart's language is Flowchart Script. | `packages/script` | missing |
| Named scripts | Save an expression under a name and run it again. | `packages/script` | missing |
| Several plots | One script returns more than one series. | `packages/script` | missing |
| Custom strategy | A strategy package places orders through the broker port. | `packages/plugins` | missing |

### Custom timeframes

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Calendar buckets | Minutes, hours, days, weeks, and months built from the 1-minute tape. | `packages/bars` | missing |
| Seconds | Sub-minute bars from a finer tape. | `packages/bars` | missing |
| Tick bars | One bar per N trades the caller supplies. | `packages/bars` | missing |
| Session day | Buckets that open at a session time in the symbol's zone. | `packages/bars` | missing |
| Close rule | A higher-timeframe bar stays hidden until its minutes have closed. | `packages/bars` | missing |

### Layouts

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Layout document | Panes, candle type, period, price scale, timezone, and studies. | `packages/workspace` | missing |
| Templates | Save and load a layout on this machine. | `packages/workspace` | missing |
| Several panes | Up to four panes of one symbol. | `apps/desk` | missing |

### Multi-chart

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Shared time | One timestamp written onto every chart. | `packages/workspace` | missing |
| Synced crosshair | The crosshair matches across panes. | `packages/workspace` | missing |
| Second symbol | Compare and ratio of two symbols. | `packages/multi-instrument` | missing |

### Alerts

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Compare and cross | A series crosses a level or another series. | `packages/alerts` | missing |
| Channel and percent | Enter or leave a band, or move a percent over a lookback. | `packages/alerts` | missing |
| Drawing touch | A bar's range meets a drawn level. | `packages/alerts` | missing |
| Local log | Arm, fire, and expire a row on this machine. | `packages/alerts` | missing |
| Delivery | Sound, push, email, and webhook. | `packages/alerts` | missing |

### Screener

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Study filters | Study range, close versus a study, percent change, volume versus average, and new high or low. | unassigned | missing |
| Supplied rows | Fundamental numbers and headlines the caller already has. | unassigned | missing |
| Hotlists | Ranked mover lists. | unassigned | missing |

### Watchlists

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Symbol list | Add and remove a symbol, with an optional label. | unassigned | missing |
| Search | Match a symbol, name, or venue in records the caller supplies. | unassigned | missing |
| Quote | Last price and change for each row. | unassigned | missing |

### Brokers

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Order ticket | Market, limit, and stop. Modify, cancel, and close. One symbol, one net position. | `packages/orders` | missing |
| Protection | Stop and target on the position. Spread, commission, and a partial close. | `packages/orders` | missing |
| Demo and paper | Adapters that send a demo or paper order when given a credential. | `packages/brokers` | missing |
| Live confirmation | A live order waits for an explicit confirmation and a process lock. | `packages/brokers` | missing |
| Venues | OANDA, cTrader, TradeLocker, MT5, IBKR, Alpaca, Tradovate, and CCXT. | `packages/brokers` | missing |

## FX Replay

Replay UX. A long session stays on one cursor, restores on the same candle, and keeps the next candle hidden until the step that reveals it.

| Gap | Reference behavior | Home | Status |
| --- | --- | --- | --- |
| Tape | One symbol. The desk loads a 1-minute history the user supplies. | `packages/bars` | missing |
| Transport | Pause, play, and speed. | `packages/replay` | missing |
| Step | Move one bar on the trading timeframe. | `packages/replay` | missing |
| Seek | Jump the cursor to a timestamp inside the tape. | `packages/replay` | missing |
| Next session | Jump to the next session open. | `packages/replay` | missing |
| Keys | Step and pause on keyboard shortcuts. | `packages/replay` | missing |
| Hidden future | A higher-timeframe candle appears only after its minutes have closed. | `packages/bars` | missing |
| Restore | Reopen on the same candle, with the same drawings and working orders. | `packages/replay` | missing |
| Replay orders | Market, limit, and stop fill only on minutes already closed. Partial close included. | `packages/orders` | missing |
| Fill cost | Spread, commission, and an ambiguous flag when one minute trades through both stop and target. | `packages/orders` | missing |
| Session tape | Fills from this replay and the running P&L. | `packages/orders` | missing |
| Sessions | Asia, London, and New York shaded in the viewer's timezone. | `packages/chart-tools` | missing |
