// SPDX-License-Identifier: Apache-2.0

import { VENUE_CAPABILITIES, protectionsVisible } from "../../../packages/brokers/src/capabilities.ts";
import { REAL_MONEY_CONFIRMATION_DEFAULT } from "../../../packages/brokers/src/guard.ts";
import { createBroker } from "../../../packages/brokers/src/port.ts";

/** The desk fills here. Demo and paper hosts are not called. */
export const DESK_VENUE = "backtest";

export type VenueRow = {
  venue: string;
  adapterId: string;
  placement: string;
  protections: boolean;
};

export function venueRows(orderType: "market" | "limit" | "stop" = "market"): VenueRow[] {
  return Object.values(VENUE_CAPABILITIES)
    .map((caps) => ({
      venue: caps.venue,
      adapterId: caps.adapterId,
      placement: caps.placement,
      protections: protectionsVisible(caps.venue, orderType).stopLoss,
    }))
    .sort((left, right) => left.venue.localeCompare(right.venue));
}

export type DemoFill =
  | { ok: true; venue: string; status: string; transmitted: false; price: string; orderId: string }
  | { ok: false; code: string };

/**
 * Fill one order on the local backtest adapter.
 * `confirmRealMoney` stays false, and the request is not transmitted.
 */
export async function fillOnBacktest(input: {
  clientOrderId: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop";
  lots: string;
  markPrice: string;
  limitPrice?: string;
  stopPrice?: string;
  now: string;
}): Promise<DemoFill> {
  if (REAL_MONEY_CONFIRMATION_DEFAULT !== false) return { ok: false, code: "live_refused" };
  const broker = createBroker({
    venue: DESK_VENUE,
    symbol: "EURUSD",
    mode: "backtest",
    markPrice: input.markPrice,
    commission: "0",
    now: input.now,
  });
  const result = await broker.place({
    clientOrderId: input.clientOrderId,
    side: input.side,
    type: input.type,
    lots: input.lots,
    limitPrice: input.type === "limit" ? input.limitPrice : undefined,
    stopPrice: input.type === "stop" ? input.stopPrice : undefined,
    confirmRealMoney: false,
  });
  if (!result.ok) return { ok: false, code: result.code };
  if (result.value.transmitted !== false) return { ok: false, code: "transmitted" };
  return {
    ok: true,
    venue: result.value.venue,
    status: result.value.status,
    transmitted: false,
    price: result.value.fill?.price ?? input.markPrice,
    orderId: result.value.orderId,
  };
}
