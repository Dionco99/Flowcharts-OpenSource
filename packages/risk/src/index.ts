// SPDX-License-Identifier: Apache-2.0

import type { RiskSettings } from "./types.js";

export { RiskError } from "./errors.js";
export { createFixture } from "./fixture.js";
export {
  assertSettings,
  currencyPnl,
  decimalPlaces,
  fills,
  lotStepsThatFit,
  resolvePlan,
  weekdayOf,
} from "./sizing.js";
export { settleTrade, simulate } from "./simulate.js";
export { buildEquity, summarize } from "./stats.js";
export type {
  AccountReport,
  AccountStats,
  BreakdownRow,
  ClosedTrade,
  EquityPoint,
  ExitKind,
  RiskSettings,
  Side,
  SkippedTrade,
  SymbolSpec,
  TradePlan,
} from "./types.js";

/** Session defaults from the desk brief: 100,000 account, one percent risk, 2R. */
export const DEFAULT_SETTINGS: RiskSettings = {
  accountSize: 100_000,
  riskPerTrade: 0.01,
  defaultRR: 2,
  commissionPerLot: 7,
  spread: 0.0001,
  symbol: {
    lotSize: 100_000,
    lotStep: 0.01,
    tickSize: 0.00001,
  },
};
