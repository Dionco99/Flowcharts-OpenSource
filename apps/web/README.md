# Web

Self-hosted static shell. It serves files from `dist/` and a `/healthz` check. It does not compose the replay desk, open a broker, or read a market-data feed.

Build and run with Node 22:

```bash
node apps/web/build.mjs
node apps/web/src/server.mjs
```

Open `http://127.0.0.1:8080/`. Set `HOST=127.0.0.1` on a shared machine. `PORT` defaults to `8080`.

Docker and the hosted plan are in [docs/deploy.md](../../docs/deploy.md). The stage-1 replay desk stays in [`apps/desk`](../desk).

Licensed under the Apache License, Version 2.0. This package has no runtime dependencies.
