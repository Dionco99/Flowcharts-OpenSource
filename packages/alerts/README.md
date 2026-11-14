# alerts

Price, indicator, and drawing alerts on bars the cursor has reached. A multi-symbol screener and watchlists live here too. The local log arms, fires, and expires a row. Webhook, email, and push are ports: this package formats the payload and can record it. It does not open a connection.

License: Apache-2.0. See [docs/dependencies.md](../../docs/dependencies.md). No market-data file is shipped. The demo uses a generated tape.

## Run

```bash
cd packages/alerts
npm install
npm test
npm run typecheck
npm run demo
npm run test:browser
```

`npm run demo` serves the desk page at http://127.0.0.1:5173. `npm run test:browser` drives that page: arm, run, fire, screener, hotlist, watchlist search, add, remove, reload, and a phone-width layout.

## Cursor

A rule reads bars whose close is at or before the cursor. `evaluateRule` throws `window_leak` if the window still contains a later bar. `closedBars` is how a tape that holds the future is sliced first. Prices and volume are decimal strings. A JSON number is rejected.

## Rules

Compare, cross, channel enter or exit, and percent change fire on the bar where they become true. A cross needs the previous bar on the other side. An indicator rule uses `sma`, `ema`, `rsi`, `atr`, `bollinger`, `highest`, or `lowest`, or a `values` series the caller already computed for that sealed window. A drawing rule touches a horizontal price, segment, ray, line, or rectangle when the bar's range meets it. The bar's time interval is half-open: `[openTime, closeTime)`.

## Log and ports

`AlertLog` stores rows as `flowchart.alerts` version 1. `once` defaults to true. Advancing the cursor forward delivers new fires. Seeking backward recomputes and does not deliver again. A saved log at the same cursor does not deliver again. `expire` holds the row so a later seek does not revive it.

`recordingPorts` implements webhook, email, push, and a local sound cue. The recording stays in memory. A host that should leave the machine implements `WebhookPort`, `EmailPort`, or `PushPort` itself.

## Screener and watchlists

`screen` keeps a symbol only when every filter passes. Filters cover a study range, close versus a study, percent change, volume versus the prior average, a new high or low, and fundamentals or headlines the caller already has. A headline after the cursor is ignored. `hotlist` ranks gainers, losers, or active names.

`WatchlistBook` adds and removes a symbol and an optional label, searches symbol, name, or venue in records the caller supplies, and quotes the last closed price and the change from the bar before it. The file format is `flowchart.watchlists` version 1. `browserStore` keeps the log and the book in `localStorage` under `flowchart.alerts` and `flowchart.watchlists`.

## Fixture

`generateTape` builds a seeded walk in ticks. The demo scenario uses seed `20240602` for a rising EURUSD tape and seed `20240603` for a falling GBPUSD tape. Nothing in that path is a downloaded history.
