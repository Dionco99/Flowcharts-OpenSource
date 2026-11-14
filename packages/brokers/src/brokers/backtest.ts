// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import type { BrokerAdapter, OrderAck } from "./adapter.js";
import { VENUE_CAPABILITIES } from "./capabilities.js";
import { assertPositiveDecimal } from "../orders/decimal.js";
import { OrderRejected } from "../orders/errors.js";
import { assertCanSend, type ExecutionContext } from "../orders/guard.js";
import { buildFill, fillReason, type FillJournal } from "../orders/journal.js";
import { assertProtectionsAllowed, validateOrder, type OrderIntent } from "../orders/model.js";

function fillPrice(order: OrderIntent, ctx: ExecutionContext): string {
  if (order.type === "market") {
    if (!ctx.markPrice) throw new OrderRejected("A backtest market order needs markPrice.");
    assertPositiveDecimal(ctx.markPrice, "markPrice");
    return ctx.markPrice;
  }
  if (order.type === "stop") {
    assertPositiveDecimal(order.prices?.stop ?? "", "prices.stop");
    return order.prices?.stop ?? "";
  }
  assertPositiveDecimal(order.prices?.limit ?? "", "prices.limit");
  return order.prices?.limit ?? "";
}

/** Local fill writer. Same record as a demo or live fill. No network. */
export function createBacktestBroker(journal: FillJournal): BrokerAdapter {
  return {
    id: "backtest",
    capabilities: VENUE_CAPABILITIES.backtest,
    async placeOrder(order, ctx) {
      validateOrder(order);
      assertProtectionsAllowed(order, VENUE_CAPABILITIES.backtest);
      const decision = assertCanSend(ctx);
      if (ctx.mode !== "backtest") throw new OrderRejected("The backtest adapter only accepts mode backtest.");
      const price = fillPrice(order, ctx);
      const time = ctx.now ?? new Date().toISOString();
      const fill = buildFill({
        id: `backtest:${order.clientOrderId}`,
        source: "backtest",
        adapterId: "backtest",
        venue: "backtest",
        symbol: order.symbol,
        side: order.side,
        lots: order.qty,
        price,
        time,
        barCloseTime: time,
        orderId: order.clientOrderId,
        clientOrderId: order.clientOrderId,
        reason: fillReason(order.type, ctx.reason),
        commission: ctx.commission,
        spread: ctx.spread,
      });
      journal.append(fill);
      return {
        venue: "backtest",
        orderId: order.clientOrderId,
        clientOrderId: order.clientOrderId,
        status: "filled",
        fill,
        warnings: decision.warnings,
      } satisfies OrderAck;
    },
    async cancelOrder() {
      return;
    },
  };
}
