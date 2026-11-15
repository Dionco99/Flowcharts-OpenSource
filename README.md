# Flowchart

Open-source trading platform. The first desk is market replay: you supply a 1-minute history, and studies, drawings, and orders see only the bars the cursor has already reached.

Licensed under the [Apache License, Version 2.0](LICENSE).

The replay desk is in `apps/desk`. It uses the merged libraries on `main`, runs Flowchart Script on bars the cursor has reached, and leaves the swap ticket closed for EURUSD. Live brokerage and a non-custodial swap attach later. Stage 1 is one symbol. Replay auto-trade stays off. When it is on, Flowchart Script intents fill on the replay ticket only.

## Quickstart

```bash
npm install
npm run dev
npm test
docker compose up --build
```

`npm run dev` serves the replay desk at http://127.0.0.1:5173. `npm test` runs the bar and order libraries. `docker compose up --build` builds the desk and serves it at that same address. Stop the dev server first; both listen on port 5173.

## Layout

Shells live in `apps/`. Libraries live in `packages/`.

| Path | Owns |
| --- | --- |
| [`apps/desk`](apps/desk) | Stage-1 replay desk. |
| [`apps/web`](apps/web) | Self-hosted static shell. Docker and Pages are in [docs/deploy.md](docs/deploy.md). |
| [`packages/bars`](packages/bars) | Symbol spec, 1-minute tape, and higher-timeframe windows. |
| [`packages/orders`](packages/orders) | Order, fill, and position records, and the broker port. |
| [`packages/brokers`](packages/brokers) | Venue adapters behind that port. |
| [`packages/plugins`](packages/plugins) | How an indicator or strategy package registers. |
| [`packages/script`](packages/script) | Flowchart Script, a clean-room study language. |
| [`packages/replay`](packages/replay) | Replay clock and the session file. |
| [`packages/risk`](packages/risk) | Position size, R, and later account risk checks. |
| [`packages/journal`](packages/journal) | Local trade log shared by replay, backtest, and live. |
| [`packages/accounts`](packages/accounts) | Local account session and sync of layouts and journal entries. |
| [`packages/edge`](packages/edge) | Expectancy and sample statistics from journal records. |
| [`packages/chart-tools`](packages/chart-tools) | Drawings, chart types, and the studies that ship with the desk. |
| [`packages/workspace`](packages/workspace) | Panes, layouts, and crosshair sync. |
| [`packages/multi-instrument`](packages/multi-instrument) | A second symbol, compare, and ratio. |
| [`packages/alerts`](packages/alerts) | Alert rules, the local log, the screener, and watchlists. |
| [`packages/billing`](packages/billing) | Hosted-tier checkout and portal ports, and local webhook signatures. |

## Dependencies

Allowed libraries, and the ones that stay out of core, are listed in [docs/dependencies.md](docs/dependencies.md).

Charting is [KLineChart](https://github.com/klinecharts/KLineChart) (Apache-2.0). The study language is Flowchart Script. Users connect their own market data.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md)

Continuous integration runs `python3 scripts/check_apache_license.py`. The root `LICENSE` file must be the Apache License, Version 2.0, and first-party source under `apps/`, `packages/`, and `scripts/` must declare `SPDX-License-Identifier: Apache-2.0`.
