# chart-tools

Drawings, chart types, and the studies that ship with the desk. A study receives bars whose close is at or before the cursor and returns plots. Chart rendering targets KLineChart. Users bring their own bars. Indicator formulas come from the libraries named in `docs/dependencies.md`, not from a chart vendor's built-in studies.

A further indicator or strategy package registers through `packages/plugins`.

Shipped studies and the KLineChart pane live here. A further study is another file under `src/studies/packages`.

Candle styles, line and area series, Heikin-Ashi, brick types, price scales, and the crosshair readout are pure transforms in `src/chart-types`. Line geometry, Fibonacci, channels, shapes, labels, the position tool, lock, and magnet are in `src/figures`. `runStudy` calls [indicatorts](https://github.com/cinar/indicatorts) (MIT) and only sees bars whose close is at or before the cursor.

```bash
npm test -w @flowchart/chart-tools
npm run typecheck -w @flowchart/chart-tools
```

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
