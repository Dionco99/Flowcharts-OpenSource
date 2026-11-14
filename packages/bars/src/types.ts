// SPDX-License-Identifier: Apache-2.0

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h";

/** One completed minute. Prices are decimal strings. */
export type Minute = {
  /** Open time, UTC milliseconds. */
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
};

/** A bar built only from minutes whose close is at or before the cursor. */
export type Bar = {
  t: number;
  ct: number;
  o: string;
  h: string;
  l: string;
  c: string;
  partial: boolean;
};

export type SessionName = "Asia" | "London" | "New York";

export type SessionDef = {
  name: SessionName;
  /** Minutes from 00:00 UTC. */
  openMinute: number;
  closeMinute: number;
  color: string;
};

export type SymbolSpec = {
  symbol: string;
  tickSize: string;
  pipSize: string;
  /** Units of base currency in 1.00 lot, as a decimal string. */
  lotSize: string;
  /** Full bid/ask width, decimal string. */
  spread: string;
  /** Account currency per side per 1.00 lot. */
  commissionPerLot: string;
  pricePrecision: number;
  /** FX day roll, minutes from 00:00 UTC. */
  dayRollUtcMinute: number;
  sessions: SessionDef[];
};

export type MarketWindow = {
  spec: SymbolSpec;
  timeframe: Timeframe;
  bars: readonly Bar[];
  cursor: number;
};
