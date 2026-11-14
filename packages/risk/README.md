# risk

Size a replay account from the risk set before the session, then score the simulated balance.

This package does not play bars, place orders, or open a broker connection. Bar replay stays in [`packages/replay`](../replay). It does not bundle market data. The dashboard scores a seeded fixture of trade plans.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md). The repository `LICENSE` is Apache-2.0.

## Session settings

- **Account size.** Starting simulated balance, for example `100000`.
- **Risk per trade.** A fraction of the balance at entry. `0.01` is one percent.
- **Default RR.** Reward multiple used when a trade has no take-profit.
- **Commission.** Round-turn account currency per standard lot.
- **Spread.** Bid-ask width in price units. Chart prices are the bid: a long pays the spread on entry, a short pays it on the exit.

One R is the currency lost if the stop fills, including spread and commission. Lots are floored to the lot step, so a trade never risks more than that budget. The currency result updates the balance, and the next trade is sized from the new balance.

## Stats

The report includes the equity curve, balance, win rate, average R, expectancy, profit factor, max drawdown, longest win and loss streaks, average RR achieved against the planned chart RR, and P&L by session, UTC weekday, and setup.

Achieved RR is the average winning R divided by the average losing R. Planned RR is the average of target distance over stop distance.

## Library

```ts
import { DEFAULT_SETTINGS, createFixture, simulate } from "flowchart-risk";

const report = simulate(DEFAULT_SETTINGS, createFixture());
console.log(report.balance, report.stats.averageR);
```

Pass a `TradePlan` list when a desk has fills. Each plan is a side, entry, stop, optional target, and an exit of `stop`, `target`, or `manual`.

## Dashboard

```bash
cd packages/risk
npm install
npm test
npm run dashboard
```

Open http://127.0.0.1:4173/dashboard/

Change the session settings and choose Resimulate. The same generated trades are resized from the new account.
