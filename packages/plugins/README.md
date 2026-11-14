# plugins

Registration for an indicator package or a strategy package. An indicator is a pure function of the bar window and its parameters, and it returns plots. A strategy reads that same window and submits orders only through the broker port (`place`, `modify`, `cancel`, `close`, `modifyProtection`, `snapshot`). Neither one sees a bar the cursor has not reached.

Prices on the window are decimal strings, matching `packages/bars`. This package does not load a tape and does not fill orders. `packages/orders` owns the port records and the replay matcher. `packages/brokers` owns venue adapters. Shipped drawings and studies live in `packages/chart-tools`.

## Register

```ts
import { PluginHost } from "@flowchart/plugins";

const host = new PluginHost();
host.register(plugin);
const plots = host.runIndicator(plugin.id, window, { session: "london" });
```

`runIndicator` throws `window_leak` when a bar closes after the cursor, and it does not call the study. Plot values are decimal strings or `null`.

A plugin id is lowercase and contains a dot. `apiVersion` is `1`.

## Example

[`examples/session-vwap`](examples/session-vwap) is a further indicator package: session-anchored VWAP. It is not a study shipped with the desk.

From this directory:

```bash
npm install
npm test
```

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
