// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BillingError,
  OfflineBilling,
  verifyWebhook,
  type CheckoutRequest,
} from "../src/index.ts";

/** Fixture only. Not a Stripe key, and the library does not read it from the environment. */
const TEST_SECRET = "whsec_test_flowchart_billing";

const RAW_EVENT =
  '{"id":"evt_test_checkout","type":"checkout.session.completed","created":1700000000,"livemode":false,"data":{"object":{"id":"cs_test_hosted","object":"checkout.session","mode":"subscription"}}}';

/**
 * Independent HMAC-SHA256 of `1700000000.` + RAW_EVENT with TEST_SECRET.
 * Recomputed outside this package (Python hmac) so the scheme stays fixed.
 */
const KNOWN_SIGNATURE = "7f05797294280e496e5935269c7a9d2436330a9a538f1d0bfe0e49be4baa33e0";

const checkoutRequest: CheckoutRequest = {
  priceId: "price_hosted_tier",
  customerEmail: "ada@example.com",
  successUrl: "https://desk.example/billing/success",
  cancelUrl: "https://desk.example/billing/cancel",
  clientReferenceId: "user_ada",
  metadata: { tier: "hosted" },
};

test("offline checkout and portal stay on the .invalid domain", async () => {
  const billing = new OfflineBilling();
  const fetchCalls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string) => {
    fetchCalls.push(String(input));
    return Promise.reject(new Error("network"));
  }) as typeof fetch;
  try {
    const checkout = await billing.checkout.createSession({
      ...checkoutRequest,
      secret: "sk_live_nope",
    } as CheckoutRequest);
    const portal = await billing.portal.createSession({
      customerId: "cus_hosted_ada",
      returnUrl: "https://desk.example/account",
    });
    assert.equal(checkout.id, "offline_checkout_1");
    assert.equal(checkout.url, "https://billing.invalid/checkout/offline_checkout_1");
    assert.equal(portal.url, "https://billing.invalid/portal/offline_portal_2");
    assert.deepEqual(fetchCalls, []);
    const recorded = billing.recordedCheckouts()[0];
    assert.ok(recorded);
    assert.equal(recorded.request.mode, "subscription");
    assert.equal(recorded.request.quantity, 1);
    assert.equal(recorded.request.customerEmail, "ada@example.com");
    assert.equal(recorded.request.clientReferenceId, "user_ada");
    assert.equal(recorded.request.metadata.tier, "hosted");
    assert.equal("secret" in recorded.request, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("checkout rejects secrets, non-subscription mode, and Stripe URLs", async () => {
  const billing = new OfflineBilling();
  const secrety = { ...checkoutRequest, priceId: "sk_live_secret" };
  await assert.rejects(() => billing.checkout.createSession(secrety), (error: unknown) => {
    assert.ok(error instanceof BillingError);
    assert.equal(error.code, "invalid_argument");
    return true;
  });
  await assert.rejects(
    () => billing.checkout.createSession({ ...checkoutRequest, mode: "payment" as "subscription" }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_argument",
  );
  await assert.rejects(
    () =>
      billing.checkout.createSession({
        ...checkoutRequest,
        successUrl: "https://api.stripe.com/v1/checkout/sessions",
      }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_argument",
  );
  await assert.rejects(
    () =>
      billing.checkout.createSession({
        ...checkoutRequest,
        successUrl: "https://user:pass@desk.example/ok",
      }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_argument",
  );
  assert.deepEqual(billing.recordedCheckouts(), []);
});

test("portal requires a customer id and an http(s) return URL", async () => {
  const billing = new OfflineBilling();
  await assert.rejects(
    () => billing.portal.createSession({ customerId: "", returnUrl: "https://desk.example/account" }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_argument",
  );
  await assert.rejects(
    () => billing.portal.createSession({ customerId: "cus_hosted_ada", returnUrl: "/account" }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_argument",
  );
});

test("webhook accepts the fixture signed with the test secret", () => {
  const event = verifyWebhook({
    payload: RAW_EVENT,
    signature: `t=1700000000,v1=${KNOWN_SIGNATURE}`,
    secret: TEST_SECRET,
    nowSeconds: 1700000000,
  });
  assert.equal(event.id, "evt_test_checkout");
  assert.equal(event.type, "checkout.session.completed");
  assert.equal(event.livemode, false);
  assert.equal(event.data.object.id, "cs_test_hosted");
});

test("webhook rejects a tampered body, a wrong secret, and a stale timestamp", () => {
  const signature = `t=1700000000,v1=${KNOWN_SIGNATURE}`;
  assert.throws(
    () =>
      verifyWebhook({
        payload: RAW_EVENT.replace("subscription", "payment"),
        signature,
        secret: TEST_SECRET,
        nowSeconds: 1700000000 + 10_000,
      }),
    (error: unknown) => {
      assert.ok(error instanceof BillingError);
      assert.equal(error.code, "invalid_signature");
      assert.equal(error.message.includes(TEST_SECRET), false);
      return true;
    },
  );
  assert.throws(
    () =>
      verifyWebhook({
        payload: RAW_EVENT,
        signature,
        secret: "whsec_test_other_secret",
        nowSeconds: 1700000000,
      }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_signature",
  );
  assert.throws(
    () =>
      verifyWebhook({
        payload: RAW_EVENT,
        signature,
        secret: TEST_SECRET,
        nowSeconds: 1700000000 + 301,
      }),
    (error: unknown) => error instanceof BillingError && error.code === "stale_timestamp",
  );
});

test("webhook tolerance matches Stripe's v1 age check", () => {
  const signature = `t=1700000000,v1=${KNOWN_SIGNATURE}`;
  const fresh = verifyWebhook({
    payload: RAW_EVENT,
    signature,
    secret: TEST_SECRET,
    nowSeconds: 1700000000 + 300,
  });
  assert.equal(fresh.id, "evt_test_checkout");
  const ahead = verifyWebhook({
    payload: RAW_EVENT,
    signature,
    secret: TEST_SECRET,
    nowSeconds: 1700000000 - 3600,
  });
  assert.equal(ahead.type, "checkout.session.completed");
});

test("webhook accepts a rotated v1 signature and a utf-8 body", () => {
  const payload =
    '{"id":"evt_test_unicode","type":"invoice.paid","created":1700000000,"livemode":true,"data":{"object":{"id":"in_test","object":"invoice","note":"café"}}}';
  const timestamp = 1700000200;
  const good = sign(TEST_SECRET, timestamp, payload);
  const event = verifyWebhook({
    payload,
    signature: `t=${timestamp},v0=ignored,v1=${"ab".repeat(32)}, v1=${good.toUpperCase()}`,
    secret: TEST_SECRET,
    nowSeconds: timestamp,
  });
  assert.equal(event.data.object.note, "café");
  assert.equal(event.livemode, true);
  assert.throws(
    () =>
      verifyWebhook({
        payload: `${payload} `,
        signature: `t=${timestamp},v1=${good}`,
        secret: TEST_SECRET,
        nowSeconds: timestamp,
      }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_signature",
  );
});

test("a bad signature fails before the payload is parsed", () => {
  assert.throws(
    () =>
      verifyWebhook({
        payload: "not-json",
        signature: "t=1700000000,v1=deadbeef",
        secret: TEST_SECRET,
        nowSeconds: 1700000000,
      }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_signature",
  );
  const signed = sign(TEST_SECRET, 1700000000, "not-json");
  assert.throws(
    () =>
      verifyWebhook({
        payload: "not-json",
        signature: `t=1700000000,v1=${signed}`,
        secret: TEST_SECRET,
        nowSeconds: 1700000000,
      }),
    (error: unknown) => error instanceof BillingError && error.code === "invalid_payload",
  );
});

test("billing source has no Stripe client and no HTTP client", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const packageJson = JSON.parse(readFileSync(join(root, "../package.json"), "utf8")) as {
    license: string;
    dependencies?: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.equal(packageJson.license, "Apache-2.0");
  assert.equal(packageJson.dependencies, undefined);
  for (const name of Object.keys(packageJson.devDependencies)) {
    assert.equal(name === "stripe" || name.startsWith("@stripe/"), false);
  }
  const banned = [
    /https?:\/\/(?:api\.)?stripe\.com/,
    /from\s+["']stripe["']/,
    /node:https/,
    /node:http["']/,
    /node:net["']/,
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /undici/,
  ];
  const src = join(root, "../src");
  const files = readdirSync(src).filter((name) => name.endsWith(".ts"));
  assert.ok(files.length >= 5);
  for (const name of files) {
    const text = readFileSync(join(src, name), "utf8");
    assert.match(text, /SPDX-License-Identifier:\s*Apache-2\.0/);
    for (const pattern of banned) {
      assert.equal(pattern.test(text), false, `${name} matched ${pattern}`);
    }
  }
});

function sign(secret: string, timestamp: number, payload: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
}
