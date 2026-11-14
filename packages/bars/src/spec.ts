// SPDX-License-Identifier: Apache-2.0

import type { SymbolSpec } from "./types";

/** EURUSD. The next market is another tape, not a new desk. */
export const EURUSD: SymbolSpec = {
  symbol: "EURUSD",
  tickSize: "0.00001",
  pipSize: "0.0001",
  lotSize: "100000",
  spread: "0.00008",
  commissionPerLot: "3.50",
  pricePrecision: 5,
  dayRollUtcMinute: 22 * 60,
  sessions: [
    { name: "Asia", openMinute: 0, closeMinute: 9 * 60, color: "rgba(126, 154, 186, 0.18)" },
    { name: "London", openMinute: 7 * 60, closeMinute: 16 * 60, color: "rgba(224, 161, 90, 0.16)" },
    { name: "New York", openMinute: 12 * 60, closeMinute: 21 * 60, color: "rgba(92, 168, 132, 0.15)" },
  ],
};
