# Flowchart

Open-source trading platform. The first desk is market replay: you supply a 1-minute history, and studies, drawings, and orders see only the bars the cursor has already reached.

Licensed under the [Apache License, Version 2.0](LICENSE).

The packages in this repository are scaffolds. Live brokerage, prop-firm rules, and Flowchart Script attach later to the same contracts. Stage 1 is one symbol.

## Layout

Shells live in `apps/`. Libraries live in `packages/`.

| Path | Owns |
| --- | --- |
| [`apps/desk`](apps/desk) | Stage-1 replay desk. |
| [`packages/bars`](packages/bars) | Symbol spec, 1-minute tape, and higher-timeframe windows. |
| [`packages/orders`](packages/orders) | Order, fill, and position records, and the broker port. |
| [`packages/brokers`](packages/brokers) | Venue adapters behind that port. |
| [`packages/plugins`](packages/plugins) | How an indicator or strategy package registers. |
| [`packages/script`](packages/script) | Flowchart Script, a clean-room study language. |
| [`packages/replay`](packages/replay) | Replay clock and the session file. |
| [`packages/risk`](packages/risk) | Position size, R, and later account risk checks. |
| [`packages/journal`](packages/journal) | Local trade log shared by replay, backtest, and live. |
| [`packages/edge`](packages/edge) | Expectancy and sample statistics from journal records. |
| [`packages/chart-tools`](packages/chart-tools) | Drawings, chart types, and the studies that ship with the desk. |
| [`packages/workspace`](packages/workspace) | Panes, layouts, and crosshair sync. |
| [`packages/multi-instrument`](packages/multi-instrument) | A second symbol, compare, and ratio. |
| [`packages/alerts`](packages/alerts) | Alert rules on bars the cursor has reached. |

## Dependencies

Allowed libraries, and the ones that stay out of core, are listed in [docs/dependencies.md](docs/dependencies.md).

Charting is [KLineChart](https://github.com/klinecharts/KLineChart) (Apache-2.0). The study language is Flowchart Script. Users connect their own market data.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) · [SECURITY.md](SECURITY.md)

Continuous integration runs `python3 scripts/check_apache_license.py`. The root `LICENSE` file must be the Apache License, Version 2.0, and first-party source under `apps/`, `packages/`, and `scripts/` must declare `SPDX-License-Identifier: Apache-2.0`.
