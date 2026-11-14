# journal

The local trade log. Replay, backtest, and live fills share one record: symbol, side, times, setup, tags, notes, emotions or mistakes, rule adherence, R, and a chart snapshot reference. The chart, the matcher, and the broker are not linked in.

Trades and attached images stay in this browser (IndexedDB `flowchart-journal`).

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173

`npm test` checks filters and import. Field notes are in [docs/journal.md](docs/journal.md).

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
