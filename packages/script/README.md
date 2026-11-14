# script

Flowchart Script, the desk's bar language. A script reads the bars already closed and returns plots, order intents, and alerts. It does not read a later bar, open a broker, or load market data.

This package has no runtime dependencies. The averages and the other builtins are implemented here. PyneCore may be consulted as an external reference sidecar and is not a dependency. The dependency policy is [docs/dependencies.md](../../docs/dependencies.md).

## Run

From this directory:

```bash
npm install
npm test
npm run typecheck
```

`npm test` runs 24 tests. The moving-average crossover is `test/ma-crossover.test.ts`. The sample script is `examples/ma-cross.flow`.

The language contract is [docs/flowchart-script.md](docs/flowchart-script.md).

Licensed under the Apache License, Version 2.0. See the repository [LICENSE](../../LICENSE).
