# Flowchart journal

The journal is the local log for every Flowchart trade. A replay, a backtest, and later a live fill use one record. The chart is not linked in. A snapshot is a path, a URL, or an image attached to the entry.

License: Apache-2.0. Dependency policy: [docs/dependencies.md](../../../docs/dependencies.md).

## Run

```bash
cd packages/journal
npm install
npm run dev
```

Open http://127.0.0.1:5173

`npm test` checks the filter and import rules. `npm run build` typechecks and writes `dist/`.

## What an entry keeps

| Field | Meaning |
| --- | --- |
| Source | `backtest`, `replay`, or `live` |
| Symbol, side, opened, closed | The trade |
| Setup / strategy | The setup tag |
| Tags | Extra tags. Filters treat them the same as the setup |
| Chart snapshot | A reference string, an `http(s)` image, or an attached image |
| Notes | What the tape did |
| Emotions or mistakes | What you did |
| Rule adherence | `followed`, `partial`, or `broken` |
| R result | Realized R. Above zero is a winner, below zero is a loser, zero is a scratch |
| Session or run | Replay session id or backtest run id |

## Filters

The tape narrows by search (symbol, notes, emotions, session, snapshot reference), source, result (winners, losers, scratches), rule adherence, and tag. A tag matches the setup or any extra tag, ignoring case. Clear filters shows the whole journal. Trade count, net R, average R, and the share of trades that followed the rules follow the current filter.

## Reopen

Trades and attached images stay in this browser, in an IndexedDB database named `flowchart-journal`. Reload the page and the same entries are there. Saving a trade sets the address to `#/trade/<id>`, and that entry is the one open when you come back.

Export writes `flowchart-journal.json`. Import reads a JSON array, or an object with a `trades` array, and merges by id. Attached images stay in this browser. The file keeps the snapshot reference.

## Record shape

```json
{
  "source": "replay",
  "symbol": "EURUSD",
  "side": "short",
  "openedAt": "2024-03-12T08:15:00.000Z",
  "closedAt": "2024-03-12T09:40:00.000Z",
  "setup": "London sweep",
  "tags": ["late-entry"],
  "notes": "Second touch failed.",
  "emotions": "Chased it.",
  "ruleAdherence": "partial",
  "rResult": -0.5,
  "snapshotRef": "sessions/london-short.png",
  "sessionRef": "eurusd-2024-03-12"
}
```

A later replay tape or backtest run can emit this object. The journal does not read the chart, the matcher, or a broker.
