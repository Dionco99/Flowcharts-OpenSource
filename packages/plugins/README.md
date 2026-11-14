# plugins

Registration for an indicator package or a strategy package. An indicator is a pure function of the bar window and its parameters, and it returns plots. A strategy reads that same window and submits orders only through the broker port. Neither one sees a bar the cursor has not reached.

Shipped drawings and studies live in `packages/chart-tools`. This package is how a further package joins the desk.

This directory is a scaffold.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
