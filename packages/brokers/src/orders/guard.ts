// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { LiveNetworkDisabled, PropFirmAutomationBlocked, RealMoneyConfirmationRequired } from "./errors.js";
import type { FillReason } from "./journal.js";
import type { PropFirmDecision, PropFirmProfile } from "../brokers/prop-firm.js";
import { reviewPropFirmAutomation } from "../brokers/prop-firm.js";

/** UI confirmation for a real-money order. Omitted and false both mean off. */
export const REAL_MONEY_CONFIRMATION_DEFAULT = false;

export type AccountMode = "live" | "demo" | "paper" | "backtest";

export interface ExecutionContext {
  mode: AccountMode;
  /**
   * Must be exactly `true` to select a live endpoint.
   * The UI default is `REAL_MONEY_CONFIRMATION_DEFAULT` (`false`).
   */
  confirmRealMoney?: boolean;
  markPrice?: string;
  now?: string;
  spread?: string;
  commission?: string;
  propFirm?: PropFirmProfile;
  /** Overrides the fill reason. `close` marks a position flatten. */
  reason?: FillReason;
}

export function liveNetworkOptIn(): boolean {
  return process.env.FLOWCHART_ALLOW_LIVE_NETWORK === "1";
}

export function fillSourceFor(mode: AccountMode): "live" | "demo" | "backtest" {
  if (mode === "live") return "live";
  if (mode === "backtest") return "backtest";
  return "demo";
}

export interface SendDecision {
  warnings: string[];
}

export function assertCanSend(ctx: ExecutionContext): SendDecision {
  const warnings: string[] = [];
  if (ctx.propFirm) {
    const decision: PropFirmDecision = reviewPropFirmAutomation(ctx.propFirm);
    if (!decision.allowed) {
      throw new PropFirmAutomationBlocked(decision.warnings.join(" "));
    }
    warnings.push(...decision.warnings);
  }
  if (ctx.mode === "live") {
    if (ctx.confirmRealMoney !== true) {
      throw new RealMoneyConfirmationRequired();
    }
    if (!liveNetworkOptIn()) {
      throw new LiveNetworkDisabled();
    }
  }
  return { warnings };
}

export function endpointFor(
  mode: AccountMode,
  confirmRealMoney: boolean | undefined,
  endpoints: { demo: string; live: string },
): string {
  if (mode === "backtest") {
    throw new LiveNetworkDisabled();
  }
  if (mode === "live") {
    if (confirmRealMoney !== true) throw new RealMoneyConfirmationRequired();
    if (!liveNetworkOptIn()) throw new LiveNetworkDisabled();
    return endpoints.live;
  }
  return endpoints.demo;
}
