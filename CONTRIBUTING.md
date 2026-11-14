# Contributing

Flowchart is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

A contribution is licensed under the Apache License, Version 2.0, the same as the rest of the repository.

## Before you change code

- Read [docs/dependencies.md](docs/dependencies.md) before adding a library.
- Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Report vulnerabilities through a [private security advisory](https://github.com/Dionco99/Flowcharts-OpenSource/security/advisories/new), not a public issue. See [SECURITY.md](SECURITY.md).

## Where code goes

Match an existing package before adding a directory. Shells a person opens live in `apps/`. Libraries live in `packages/`.

| Concern | Path |
| --- | --- |
| Replay desk shell | `apps/desk` |
| Symbol spec, tape, and bar windows | `packages/bars` |
| Broker port, orders, fills, positions | `packages/orders` |
| Venue adapters | `packages/brokers` |
| Indicator and strategy registration | `packages/plugins` |
| Flowchart Script | `packages/script` |
| Replay clock and session file | `packages/replay` |
| Size, R, and account risk | `packages/risk` |
| Trade log | `packages/journal` |
| Local account session and sync | `packages/accounts` |
| Expectancy from the journal | `packages/edge` |
| Drawings, chart types, shipped studies | `packages/chart-tools` |
| Panes and layouts | `packages/workspace` |
| A second symbol | `packages/multi-instrument` |
| Alert rules, the local log, the screener, and watchlists | `packages/alerts` |

## License header

A new source file under `apps/`, `packages/`, or `scripts/` carries this line near the top:

```
SPDX-License-Identifier: Apache-2.0
```

Check it locally:

```bash
python3 scripts/check_apache_license.py
```

The root `LICENSE` file is the Apache License, Version 2.0 text. Leave that file unchanged. Put third-party attribution in `NOTICE` when a distributed component requires it.

## Dependencies

Core dependencies are the ones named in [docs/dependencies.md](docs/dependencies.md). AGPL-3.0, GPL-3.0, Commons Clause, and LGPL libraries stay out of core. `nautilus_trader` is a sidecar only.

Charting is KLineChart. Flowchart Script is the study language in `packages/script`. The Pine Script and TradingView names are not used for Flowchart's language or chart.

Market-data files stay out of the repository. Users connect their own feeds. Binance Vision, Dukascopy, and HistData files are not added here.

## Pull requests

Open a pull request against `main`. Name the package you changed and how you checked it. Keep the change inside the package that owns the concern.
