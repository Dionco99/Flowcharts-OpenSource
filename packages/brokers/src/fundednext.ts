// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { BrokerError } from "./errors.ts";

export type FundedPlatform = "cTrader" | "Match-Trader" | "MT4" | "MT5" | "Tradovate" | "other";

export interface FundedNextProfile {
  firm: "FundedNext";
  platform: FundedPlatform;
  /** Account size in USD. Required on MT4 and MT5. */
  accountSizeUsd?: number;
}

export interface FundedNextDecision {
  allowed: boolean;
  code?: "fundednext_automation_refused" | "fundednext_size_required";
  warnings: string[];
}

const BLOCKED_EA =
  "FundedNext does not allow automated trading on cTrader or Match-Trader, at any account size.";
const LARGE_ACCOUNT =
  "FundedNext requires manual trading on MT4 and MT5 accounts of $50,000 and above, including tools that only change stop, target, or size.";
const SMALL_ACCOUNT = [
  "EA fee",
  "A distinct strategy",
  "No Telegram or WhatsApp bridge",
  "The same strategy on the challenge and the funded account",
];

/**
 * Public FundedNext help pages, read 2026-11-14. This is a block, not a compliance certificate.
 * It does not detect HFT, latency arbitrage, copy trading, grid trading, tick scalping, or challenge-passing bots.
 */
export function reviewFundedNext(profile: FundedNextProfile | null | undefined): FundedNextDecision {
  if (!profile) return { allowed: true, warnings: [] };
  if (profile.firm !== "FundedNext") return { allowed: true, warnings: [] };
  const platform = profile.platform;
  if (platform === "cTrader" || platform === "Match-Trader") {
    return { allowed: false, code: "fundednext_automation_refused", warnings: [BLOCKED_EA] };
  }
  if (platform === "MT4" || platform === "MT5") {
    if (profile.accountSizeUsd === undefined || !Number.isFinite(profile.accountSizeUsd) || profile.accountSizeUsd <= 0) {
      return {
        allowed: false,
        code: "fundednext_size_required",
        warnings: ["Set the account size before automating a FundedNext MT4 or MT5 account."],
      };
    }
    if (profile.accountSizeUsd >= 50_000) {
      return { allowed: false, code: "fundednext_automation_refused", warnings: [LARGE_ACCOUNT] };
    }
    return { allowed: true, warnings: SMALL_ACCOUNT };
  }
  if (platform === "Tradovate") {
    return {
      allowed: true,
      warnings: ["FundedNext allows automated systems on Tradovate. This package has no Tradovate adapter."],
    };
  }
  return { allowed: true, warnings: [] };
}

export function assertFundedNext(profile: FundedNextProfile | null | undefined): string[] {
  const decision = reviewFundedNext(profile);
  if (!decision.allowed) {
    throw new BrokerError(decision.code ?? "fundednext_automation_refused", decision.warnings.join(" "));
  }
  return decision.warnings;
}
