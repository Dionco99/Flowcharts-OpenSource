// SPDX-License-Identifier: Apache-2.0

import { createHmac, timingSafeEqual } from "node:crypto";
import { BillingError } from "./errors.js";

/**
 * Stripe's classic webhook scheme: header `t=<unix>,v1=<hex>` and
 * HMAC-SHA256 over `<t>.<raw body>`. The signing secret is the caller-supplied
 * string, including a `whsec_` prefix. It is not base64-decoded. This is not
 * the thin-event scheme, and it does not contact Stripe.
 */
export const DEFAULT_TOLERANCE_SECONDS = 300;

const HEX_64 = /^[0-9a-f]{64}$/;

/** Events a hosted tier reads. The verifier accepts any signed event type. */
export const HOSTED_TIER_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export type HostedTierEvent = (typeof HOSTED_TIER_EVENTS)[number];

export function isHostedTierEvent(type: string): type is HostedTierEvent {
  return (HOSTED_TIER_EVENTS as readonly string[]).includes(type);
}

export interface WebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly created: number;
  readonly livemode: boolean;
  readonly data: {
    readonly object: Record<string, unknown>;
  };
}

export interface VerifyWebhookInput {
  /** Raw request body. Do not re-serialize it. */
  readonly payload: string;
  /** Value of the `Stripe-Signature` header. */
  readonly signature: string;
  /** Endpoint signing secret supplied by the host. */
  readonly secret: string;
  /**
   * Seconds a signature may lag the clock. Default {@link DEFAULT_TOLERANCE_SECONDS}.
   * Zero disables the age check, matching Stripe's documented verifier.
   */
  readonly toleranceSeconds?: number;
  /** Unix seconds. Tests pass a fixed clock. Defaults to the current time. */
  readonly nowSeconds?: number;
}

export function verifyWebhook(input: VerifyWebhookInput): WebhookEvent {
  if (!isPlainRecord(input)) {
    throw new BillingError("invalid_argument", "Webhook input is invalid");
  }
  const secret = requireSecret(input.secret);
  const payload = requirePayload(input.payload);
  const header = parseSignatureHeader(input.signature);
  const tolerance = requireTolerance(input.toleranceSeconds);
  const now = requireNow(input.nowSeconds);
  if (!signatureMatches(secret, header.timestamp, payload, header.signatures)) {
    throw new BillingError("invalid_signature", "Webhook signature does not match");
  }
  if (tolerance > 0 && header.timestamp < now - tolerance) {
    throw new BillingError("stale_timestamp", "Webhook timestamp is outside the tolerance window");
  }
  return parseEvent(payload);
}

function requireSecret(secret: unknown): string {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new BillingError("invalid_argument", "Webhook signing secret is missing");
  }
  if (secret.length > 256) {
    throw new BillingError("invalid_argument", "Webhook signing secret is invalid");
  }
  return secret;
}

function requirePayload(payload: unknown): string {
  if (typeof payload !== "string") {
    throw new BillingError("invalid_argument", "Webhook payload must be the raw request body");
  }
  return payload;
}

function requireTolerance(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_TOLERANCE_SECONDS;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new BillingError("invalid_argument", "toleranceSeconds must be a non-negative integer");
  }
  return value;
}

function requireNow(value: unknown): number {
  if (value === undefined) {
    return Math.floor(Date.now() / 1000);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new BillingError("invalid_argument", "nowSeconds must be a unix time");
  }
  return value;
}

interface ParsedSignature {
  readonly timestamp: number;
  readonly signatures: readonly string[];
}

function parseSignatureHeader(header: unknown): ParsedSignature {
  if (typeof header !== "string" || header.trim() === "") {
    throw new BillingError("invalid_argument", "Webhook signature header is missing");
  }
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const item = part.trim();
    if (item === "") {
      continue;
    }
    const eq = item.indexOf("=");
    if (eq <= 0) {
      throw new BillingError("invalid_argument", "Webhook signature header is malformed");
    }
    const key = item.slice(0, eq);
    const value = item.slice(eq + 1);
    if (key === "t") {
      if (timestamp !== undefined || !/^\d{1,12}$/.test(value)) {
        throw new BillingError("invalid_argument", "Webhook signature header is malformed");
      }
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) {
        throw new BillingError("invalid_argument", "Webhook signature header is malformed");
      }
      timestamp = parsed;
    } else if (key === "v1") {
      signatures.push(value.toLowerCase());
    }
  }
  if (timestamp === undefined) {
    throw new BillingError("invalid_argument", "Webhook signature header is malformed");
  }
  return { timestamp, signatures };
}

function signatureMatches(
  secret: string,
  timestamp: number,
  payload: string,
  signatures: readonly string[],
): boolean {
  const expectedHex = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  let matched = false;
  for (const candidate of signatures) {
    if (!HEX_64.test(candidate)) {
      continue;
    }
    const given = Buffer.from(candidate, "hex");
    if (timingSafeEqual(expected, given)) {
      matched = true;
    }
  }
  return matched;
}

function parseEvent(payload: string): WebhookEvent {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new BillingError("invalid_payload", "Webhook payload is not JSON");
  }
  if (!isPlainRecord(value)) {
    throw new BillingError("invalid_payload", "Webhook payload must be an object");
  }
  const { id, type, created, livemode, data } = value;
  if (typeof id !== "string" || id.length === 0 || id.length > 255) {
    throw new BillingError("invalid_payload", "Webhook payload is missing id");
  }
  if (typeof type !== "string" || type.length === 0 || type.length > 120) {
    throw new BillingError("invalid_payload", "Webhook payload is missing type");
  }
  if (typeof created !== "number" || !Number.isInteger(created)) {
    throw new BillingError("invalid_payload", "Webhook payload is missing created");
  }
  if (typeof livemode !== "boolean") {
    throw new BillingError("invalid_payload", "Webhook payload is missing livemode");
  }
  if (!isPlainRecord(data) || !isPlainRecord(data.object)) {
    throw new BillingError("invalid_payload", "Webhook payload is missing data.object");
  }
  return Object.freeze({
    id,
    type,
    created,
    livemode,
    data: Object.freeze({ object: data.object }),
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}
