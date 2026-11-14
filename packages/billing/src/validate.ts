// SPDX-License-Identifier: Apache-2.0

import { BillingError } from "./errors.js";
import type { CheckoutRequest } from "./checkout.js";
import type { PortalRequest } from "./portal.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const SECRET_PREFIX = /^(?:sk_|rk_|whsec_)/;
const METADATA_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const STRIPE_HOSTS = new Set(["api.stripe.com", "stripe.com"]);

export interface NormalizedCheckoutRequest {
  readonly priceId: string;
  readonly quantity: number;
  readonly mode: "subscription";
  readonly customerId?: string;
  readonly customerEmail?: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly clientReferenceId?: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface NormalizedPortalRequest {
  readonly customerId: string;
  readonly returnUrl: string;
}

export function assertCheckoutRequest(input: CheckoutRequest): NormalizedCheckoutRequest {
  if (!isPlainRecord(input)) {
    throw new BillingError("invalid_argument", "Checkout request is invalid");
  }
  if (input.mode !== undefined && input.mode !== "subscription") {
    throw new BillingError("invalid_argument", "Checkout mode must be subscription");
  }
  const customerId = optionalIdentifier(input.customerId, "customerId");
  const customerEmail = optionalEmail(input.customerEmail);
  const clientReferenceId = optionalReference(input.clientReferenceId);
  return Object.freeze({
    priceId: assertIdentifier(input.priceId, "priceId"),
    quantity: assertQuantity(input.quantity),
    mode: "subscription",
    successUrl: assertHttpUrl(input.successUrl, "successUrl"),
    cancelUrl: assertHttpUrl(input.cancelUrl, "cancelUrl"),
    metadata: assertMetadata(input.metadata),
    ...(customerId === undefined ? {} : { customerId }),
    ...(customerEmail === undefined ? {} : { customerEmail }),
    ...(clientReferenceId === undefined ? {} : { clientReferenceId }),
  });
}

export function assertPortalRequest(input: PortalRequest): NormalizedPortalRequest {
  if (!isPlainRecord(input)) {
    throw new BillingError("invalid_argument", "Portal request is invalid");
  }
  return Object.freeze({
    customerId: assertIdentifier(input.customerId, "customerId"),
    returnUrl: assertHttpUrl(input.returnUrl, "returnUrl"),
  });
}

function assertIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value) || SECRET_PREFIX.test(value)) {
    throw new BillingError("invalid_argument", `${field} is invalid`);
  }
  return value;
}

function optionalIdentifier(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertIdentifier(value, field);
}

function optionalEmail(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new BillingError("invalid_argument", "customerEmail is invalid");
  }
  return value;
}

function optionalReference(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || /[\r\n]/.test(value)) {
    throw new BillingError("invalid_argument", "clientReferenceId is invalid");
  }
  return value;
}

function assertQuantity(value: unknown): number {
  if (value === undefined) {
    return 1;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 99) {
    throw new BillingError("invalid_argument", "quantity must be an integer from 1 to 99");
  }
  return value;
}

function assertMetadata(value: unknown): Readonly<Record<string, string>> {
  if (value === undefined) {
    return Object.freeze({});
  }
  if (!isPlainRecord(value)) {
    throw new BillingError("invalid_argument", "metadata must be a string record");
  }
  const entries = Object.entries(value);
  if (entries.length > 16) {
    throw new BillingError("invalid_argument", "metadata is too large");
  }
  const metadata: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (!METADATA_KEY.test(key)) {
      throw new BillingError("invalid_argument", "metadata key is invalid");
    }
    if (typeof item !== "string" || item.length > 200) {
      throw new BillingError("invalid_argument", "metadata value is invalid");
    }
    metadata[key] = item;
  }
  return Object.freeze(metadata);
}

function assertHttpUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    throw new BillingError("invalid_argument", `${field} must be an absolute http(s) URL`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BillingError("invalid_argument", `${field} must be an absolute http(s) URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BillingError("invalid_argument", `${field} must be an absolute http(s) URL`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new BillingError("invalid_argument", `${field} must not include credentials`);
  }
  const host = url.hostname.toLowerCase();
  if (STRIPE_HOSTS.has(host) || host.endsWith(".stripe.com")) {
    throw new BillingError("invalid_argument", `${field} must not target Stripe`);
  }
  return url.toString();
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}
