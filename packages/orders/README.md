# orders

The strategy-facing broker port: `place`, `modify`, `cancel`, `close`, `modifyProtection`, and `snapshot`. One port is one symbol and one net position. The replay fill adapter is the stage-1 matcher. Orders, fills, and the position are plain records.

This package does not import a broker SDK. Later venue adapters live in [`packages/brokers`](../brokers) and implement `BrokerPort`. Their `adapterId` values are `oanda`, `ctrader`, `tradelocker`, `mt5`, `ibkr`, `alpaca`, `tradovate`, and `ccxt`. Stage 1's matcher is `ReplayFillAdapter`, and its `adapterId` is `replay`.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).

## Port

| Call | Effect |
| --- | --- |
| `place` | Market, limit, or stop. Buy or sell. Size in lots. An optional stop and target attach when the order opens, adds, or reverses. |
| `modify` | Lots, limit or stop price, and the levels attached to a working order. |
| `cancel` | Cancel a working order. |
| `close` | Market-close the whole position, or `lots` of it. |
| `modifyProtection` | Replace or clear the open position's stop and target. |
| `snapshot` | Position, working orders, fills, realized P&L, unrealized P&L, and commission paid. |

A repeated `clientOrderId` on `place` or `close` returns the original order and does not fill again. `snapshot().orders` is working orders only. A rejected call returns `ok: false` and leaves the book unchanged.

The replay engine drives `setCursor`, `onBar`, `exportState`, and `loadState`. Strategies do not.

## Prices and fills

Order prices and protective levels are mid prices on the symbol tick grid. Bar OHLC are mid. `spread` is the full bid-ask width. Buys pay half of it, rounded up to a tick. Sells give up half of it, rounded down to a tick.

P&L is quote currency: `(exit − entry) × lots × lotSize` for a long, and the opposite for a short. Commission is quote currency per lot. Unrealized P&L marks the open position to the last completed mid close and does not include the spread of an exit.

Only a minute whose close is at or before the cursor can fill. A market or marketable order uses that minute's close, not its wick. Resting orders fill on a later minute. Stop and target arm on the minute after the entry. If one minute trades through both, the fill is the stop and `ambiguous` is set.

`exportState()` is the session book: cursor, last bar, position, orders, fills, and the size ledger. `version` is `1`.

## Check

From this directory, on Node 22.18 or newer:

```bash
npm test
npm run typecheck
```

The repository license check is `python3 scripts/check_apache_license.py` from the repo root.
