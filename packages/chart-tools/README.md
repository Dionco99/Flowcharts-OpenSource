# chart-tools

Drawings, chart types, and the studies that ship with the desk. A study receives bars whose close is at or before the cursor and returns plots. Chart rendering targets [KLineChart](https://github.com/klinecharts/KLineChart). Users bring their own bars. Indicator formulas come from [indicatorts](https://github.com/cinar/indicatorts), not from the chart library's built-in studies.

A further indicator or strategy package registers through `packages/plugins`. Layouts stay in `packages/workspace`. Alert rules stay in `packages/alerts`. The replay clock stays in `packages/replay`.

```bash
npm test
npm run typecheck
```

Importing `src/chart/geometry.ts` or `src/index.ts` loads KLineChart, which reads `window` while the module evaluates. In a browser that object already exists. Under Node, set `window` before the import. `test/dom-stub.ts` does that for the tests.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
