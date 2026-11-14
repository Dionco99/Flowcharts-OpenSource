# Deploy

`apps/web` is the self-hosted shell. `apps/desk` remains the stage-1 replay desk and is not the container entrypoint. The shell serves static files and a health check. It does not store a session, connect to a broker, or fetch market data.

No repository secret, paid API key, or market-data token is required to build or run it.

## Docker

Install Docker (or a compatible engine). From the repository root:

```bash
docker compose -f apps/web/compose.yaml up --build
```

The host port is bound to `127.0.0.1:8080`. Inside the container the process listens on `0.0.0.0:8080` as user `node`. The image is `node:22-alpine`. The build copies this package only, runs `node build.mjs`, and starts `node src/server.mjs`.

- App: http://127.0.0.1:8080/
- Health: http://127.0.0.1:8080/healthz returns `{"status":"ok","service":"flowchart-web"}`

Stop it with:

```bash
docker compose -f apps/web/compose.yaml down
```

There is no volume. Session files, tapes, and journals stay on the machine that runs the desk, not in this image. To publish the port beyond localhost, change the `ports` entry in `apps/web/compose.yaml`. The shell has no login.

The image health check requests `/healthz` with Node. It does not call out to another host.

## Node, without Docker

Node 22 or newer:

```bash
node apps/web/build.mjs
HOST=127.0.0.1 node apps/web/src/server.mjs
```

`PORT` defaults to `8080`. The default `HOST` in `src/server.mjs` is `0.0.0.0`, so set `HOST=127.0.0.1` when you are not inside the container.

Check the package:

```bash
node --test apps/web/test/server.test.mjs
python3 scripts/check_apache_license.py
```

## Hosted plan

Host the static build, not a replay session. Accounts, billing, hosted sessions, broker credentials, and bundled market-data files stay out.

GitHub Pages is the hosted target. The workflow is `.github/workflows/pages.yml`.

1. In the repository settings, set Pages → Build and deployment → GitHub Actions.
2. Run the **Pages** workflow with `workflow_dispatch`. It does not run on pull requests and it does not run on every push.
3. The workflow checks out the repository, runs `node apps/web/build.mjs`, and uploads `apps/web/dist`.
4. Permissions are `contents: read`, `pages: write`, and `id-token: write`. The token is the built-in `GITHUB_TOKEN`. Do not add a secret.

On Pages the site is a file tree. `/healthz` exists only when `src/server.mjs` is running, so the page reports mode `static host`. In Docker or under Node it reports mode `container` and health `ok`.

Relative asset URLs (`styles.css`, `app.js`, `build.json`) keep the page working when Pages serves the repository under a subpath.

## What the image does not include

- The replay desk in `apps/desk`.
- KLineChart. Charting for the desk is KLineChart (Apache-2.0) when that app is attached. This shell does not load it.
- Market-data files. Users connect their own feeds. Binance Vision, Dukascopy, and HistData files are not added.
- A paid vendor key, a container-registry login, or a broker credential.
