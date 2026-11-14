# workspace

Layout document for the desk: panes, candle type, period, price scale, timezone, studies, drawings, strategy hooks, and the object tree. Templates stay on this machine. Stage 1 is one symbol. A second symbol belongs in `packages/multi-instrument`.

Chart rendering uses [KLineChart](https://github.com/klinecharts/KLineChart) (Apache-2.0). Studies and strategy hooks receive bars whose close is at or before the cursor. Prices in the layout and the tape stay decimal strings. The chart boundary converts them for display.

Custom periods are `7m`, `2h`, and `3D` (any positive span with those suffixes). Minute and hour buckets are real-time steps from the symbol's market-open clock and restart at the next market open. A bucket that would run past that open is clipped, so a 7-minute day ends with a short bar. Day buckets cover that many session days. A higher bar stays out of the closed window until the cursor reaches its close.

The object tree can show or hide a node, lock it, reorder it among its siblings, group nodes that share a parent, rename it, and delete it. A locked node ignores rename, reorder, group, delete, and setting edits. Hiding a group hides its children.

An indicator hook is a pure function of the closed bars and its settings. A strategy hook is a `backtest` function of those same bars. It does not submit orders. A full backtest engine stays outside this package.

Saved layouts are JSON (`flowchart.layout` version 1) in an in-memory book or in browser storage. Loading returns a copy.

```bash
cd packages/workspace
npm install
npm test
npm run typecheck
npm run demo
npm run test:browser
```

`npm run demo` serves the desk page on `127.0.0.1:5173`. The page draws a generated EURUSD-shaped tape. No market-data file is shipped.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
