# edge

Expectancy and sample statistics from journal R results: trade count, net R, average R, win rate, payoff, and a Monte Carlo of the same sample. The input is the R results a journal already recorded. This package does not read the chart or the fill matcher.

Profitability comes from repeating the same edge over a long sample.

## Model

Each trade risks the same 1R, so results add. A repetition draws the sample independently, with replacement. An account that touches the ruin level stops.

Expectancy over N trades is the sample mean times N. The standard error of that mean uses the unbiased standard deviation. Repetitions use the empirical distribution of the sample. They do not add uncertainty about whether the sample edge is the true one.

Statistics are in-house. This package does not use vectorbt, backtrader, or freqtrade. See [docs/dependencies.md](../../docs/dependencies.md).

## Use

```ts
import { analyzeEdge } from "./src/index.ts";

const report = analyzeEdge([-1, -1, -1, 2, 2], {
  horizon: 100,
  paths: 4000,
  startingR: 25,
  ruinAt: 0,
  seed: 1,
});
```

`report.stats.expectancy` is the mean R. `report.expectedR` is that mean times the horizon. `report.reading` is what to expect, including the losing streak a positive edge still produces.

## Page

```sh
npm install
npm test
npm run dev
```

The page serves at http://127.0.0.1:4731/. Paste R results, or use the synthetic samples. Nothing is uploaded.

License: Apache-2.0, the same as the rest of the repository.
