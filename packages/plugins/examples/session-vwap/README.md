# Session VWAP

Example indicator package. It registers through `packages/plugins`.

The study is a pure function of the sealed window. Prices stay decimal strings. Typical price is `(high + low + close) / 3`, anchored at the Asia, London, New York, or local-day open named on the symbol. A session with no volume weights each bar equally. Outside the session the plot is a gap.

```ts
import { PluginHost } from "@flowchart/plugins";
import { sessionVwapPlugin } from "./src/index.ts";

const host = new PluginHost();
host.register(sessionVwapPlugin);
const plots = host.runIndicator("example.session-vwap", window, { session: "london" });
```

`plots.vwap` lines up with `window.bars`. A bar that closes after the cursor is not part of that window.

Shipped desk studies stay in `packages/chart-tools`. This example is a further package, which is what `packages/plugins` registers.
