# replay

The replay clock and the session file. Pause, play, speed, step, seek, and jump to the next session open move one cursor. The session file stores that cursor, drawings, working orders, and fills on the machine. Every pane reads the same cursor. Bar aggregation stays in `packages/bars`. The fill matcher stays in `packages/orders`.

`stepCursor`, `nextSessionOpen`, and the session file live here.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
