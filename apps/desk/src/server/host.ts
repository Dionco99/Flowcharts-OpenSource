// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectAccounts, memoryDirectory } from "../../../../packages/accounts/src/index.ts";
import { OfflineBilling } from "../../../../packages/billing/src/offline.ts";
import { starterLayout } from "../../../../packages/workspace/src/reference.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const layout = starterLayout();
const directory = memoryDirectory();
const accounts = connectAccounts(directory);
accounts.auth.signUp({ id: "desk", displayName: "Desk", passphrase: "local-replay-desk" });
const synced = accounts.sync().push({
  kind: "layout",
  key: layout.name,
  baseRevision: 0,
  deleted: false,
  layout: {
    format: "flowchart.layout",
    version: 1,
    name: layout.name,
    symbol: layout.symbol,
    candleType: layout.candleType,
    period: layout.period,
    priceScale: layout.priceScale,
    timezone: layout.timezone,
    crosshairSync: layout.crosshairSync,
    panes: layout.panes,
    drawings: layout.drawings,
    strategies: layout.strategies,
    tree: layout.tree,
  },
});

const billing = new OfflineBilling();

export type HostBody = {
  cursor: number;
  price: string;
  minutes: Array<{ t: number; o: string; h: string; l: string; c: string }>;
  timeframes: string[];
  previewCheckout?: boolean;
};

export type HostReport = {
  workspace: string;
  accounts: { displayName: string; revision: number; layout: string };
  bars: Record<string, number>;
  symbol: { name: string; sessions: string[]; pip: string; catalog: number };
  billing: { implementation: string; required: false; checkouts: number; url: string | null };
};

export async function localReport(body: HostBody): Promise<HostReport> {
  const python = await readPython(body);
  let url: string | null = null;
  if (body.previewCheckout === true) {
    const session = await billing.checkout.createSession({
      priceId: "price_hosted_tier",
      successUrl: "https://billing.invalid/success",
      cancelUrl: "https://billing.invalid/cancel",
    });
    url = session.url;
  }
  return {
    workspace: `${layout.name} · ${layout.period}`,
    accounts: { displayName: "Desk", revision: synced.revision, layout: layout.name },
    bars: python.windows,
    symbol: { name: python.symbol, sessions: python.sessions, pip: python.pip, catalog: python.catalog },
    billing: {
      implementation: "OfflineBilling",
      required: false,
      checkouts: billing.recordedCheckouts().length,
      url,
    },
  };
}

function readPython(body: HostBody): Promise<{ windows: Record<string, number>; symbol: string; sessions: string[]; pip: string; catalog: number }> {
  const script = path.join(root, "apps/desk/src/server/read.py");
  const child = spawn("python3", [script], {
    env: {
      ...process.env,
      PYTHONPATH: [path.join(root, "packages/bars/src"), path.join(root, "packages/multi-instrument/src")].join(":"),
    },
  });
  let out = "";
  let err = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    out += chunk;
  });
  child.stderr.on("data", (chunk) => {
    err += chunk;
  });
  child.stdin.end(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err || `python exited ${code}`));
        return;
      }
      resolve(JSON.parse(out) as { windows: Record<string, number>; symbol: string; sessions: string[]; pip: string; catalog: number });
    });
  });
}
