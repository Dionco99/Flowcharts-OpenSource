// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
/** Later venues. No adapter, no network client. */
export const DOCUMENTED_ONLY = [
  {
    id: "mt5-local",
    name: "MetaTrader 5 local Python bridge",
    note: "Optional sidecar on the same machine via the MetaTrader5 Python package. Not a core dependency. MetaApi is not used.",
  },
  {
    id: "schwab",
    name: "Charles Schwab",
    note: "OAuth. Documented for a later adapter. No client in this package.",
  },
  {
    id: "ninjatrader",
    name: "NinjaTrader",
    note: "Documented only. No client in this package.",
  },
  {
    id: "tradovate",
    name: "Tradovate",
    note: "Documented only. FundedNext futures allows automation here, still under their prohibited-strategy rules.",
  },
] as const;

/** Kept out of core on purpose. createBroker rejects these ids. */
export const EXCLUDED_FROM_CORE = [
  { id: "metaapi", reason: "Hosted MetaTrader bridge. Out of core." },
  { id: "rithmic", reason: "Out of core." },
  { id: "cqg", reason: "Out of core." },
] as const;

export type DocumentedId = (typeof DOCUMENTED_ONLY)[number]["id"];
export type ExcludedId = (typeof EXCLUDED_FROM_CORE)[number]["id"];
