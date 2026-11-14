// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
export type PropPlatform = "mt4" | "mt5" | "ctrader" | "match-trader" | "tradovate" | "other";

export interface PropFirmProfile {
  firm: string;
  platform?: PropPlatform;
  /** Account size in USD. Required before FundedNext automation on MT4 or MT5. */
  accountSizeUsd?: number;
  automated: boolean;
}

export interface PropFirmDecision {
  allowed: boolean;
  warnings: string[];
}

const PROHIBITED =
  "FundedNext prohibits HFT, latency arbitrage, copy or group trading, grid trading, tick scalping, and challenge-passing bots. Flowchart does not detect those styles.";

/**
 * FundedNext's public help center (read 2026-11-14) allows EAs only in a narrow case.
 * The check blocks the cases they state as disallowed. It is not a compliance certificate.
 */
export function reviewPropFirmAutomation(profile: PropFirmProfile): PropFirmDecision {
  if (!profile.automated) return { allowed: true, warnings: [] };
  if (profile.firm.trim().toLowerCase() !== "fundednext") {
    return {
      allowed: true,
      warnings: ["Confirm that firm's current automation rules before unattended orders."],
    };
  }
  const platform = profile.platform;
  if (platform === "ctrader" || platform === "match-trader") {
    return {
      allowed: false,
      warnings: [
        "FundedNext does not allow EAs or automated trading on cTrader or Match-Trader, at any account size.",
      ],
    };
  }
  if (platform === "mt4" || platform === "mt5") {
    if (profile.accountSizeUsd === undefined) {
      return {
        allowed: false,
        warnings: ["Set accountSizeUsd before automating a FundedNext MT4 or MT5 account."],
      };
    }
    if (profile.accountSizeUsd >= 50_000) {
      return {
        allowed: false,
        warnings: [
          "FundedNext requires manual trading on MT4 and MT5 accounts of $50,000 and above, including tools that only change stop-loss, take-profit, or size.",
        ],
      };
    }
    return {
      allowed: true,
      warnings: [
        "FundedNext allows EAs on MT4 and MT5 only under $50,000, with their EA fee.",
        "Each EA needs its own strategy, with no Telegram or WhatsApp bridge, and the same strategy on the challenge and the funded account.",
        PROHIBITED,
      ],
    };
  }
  if (platform === "tradovate") {
    return {
      allowed: true,
      warnings: [
        "FundedNext futures copy says automated systems are allowed on Tradovate. There is no Tradovate adapter in this package.",
        PROHIBITED,
      ],
    };
  }
  return {
    allowed: false,
    warnings: ["Set the FundedNext platform before sending an automated order."],
  };
}
