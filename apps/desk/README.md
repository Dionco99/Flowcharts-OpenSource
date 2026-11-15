# Desk

Stage-1 replay desk. One symbol, one cursor, up to four panes. Playback uses the replay clock. The ticket uses the replay fill adapter. Flowchart Script runs on bars whose close is at or before the cursor, and those order intents stay off the ticket.

The rail also reads the merged libraries that belong beside that loop: a local backtest fill (not transmitted), a 7-minute window from `flowchart_bars`, the EURUSD session and pip from `flowchart_multi`, workspace layout sync, session VWAP, a risk lot, a local alert, edge once two R values exist, and a replay journal note with no chart snapshot. Hosted checkout is optional and uses `OfflineBilling`. EURUSD has no mint, so the swap ticket stays closed and replay does not request a quote.

`npm run dev` from the repository root serves the desk. It generates a sample EURUSD tape in memory. A live broker connection is outside this app.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
