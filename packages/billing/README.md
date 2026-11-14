# billing

Checkout and customer-portal ports for a paid hosted tier, and a local check of Stripe's classic webhook signature. The trading packages do not import this package. The repository stays Apache-2.0.

This package has no Stripe SDK and no HTTP client. A host that later charges implements [`CheckoutPort`](src/checkout.ts) and [`PortalPort`](src/portal.ts) in its own deployment and passes that deployment's webhook signing secret into `verifyWebhook`. `OfflineBilling` is the in-memory stand-in: its session URLs use the reserved `.invalid` domain.

## Checkout and portal

```ts
import { OfflineBilling } from "@flowchart/billing";

const billing = new OfflineBilling();
const checkout = await billing.checkout.createSession({
  priceId: "price_hosted_tier",
  customerEmail: "ada@example.com",
  successUrl: "https://desk.example/billing/success",
  cancelUrl: "https://desk.example/billing/cancel",
});
const portal = await billing.portal.createSession({
  customerId: "cus_hosted_ada",
  returnUrl: "https://desk.example/account",
});
```

`mode` is `subscription`. Requests are copied onto an allowlist, so a secret stuck on the object is not kept. `successUrl`, `cancelUrl`, and `returnUrl` are absolute `http` or `https` URLs and are rejected when the host is Stripe.

## Webhooks

`verifyWebhook` reads the raw body and the `Stripe-Signature` header. The signed payload is `<timestamp>.<raw body>`, HMAC-SHA256, hex-encoded, compared in constant time with each `v1` value. The secret is the endpoint signing secret as Stripe shows it, including the `whsec_` prefix. It is not base64-decoded. The default tolerance is 300 seconds and follows Stripe's v1 age check: a signature older than the window is rejected. The function does not open a socket.

```ts
import { verifyWebhook } from "@flowchart/billing";

const secret = process.env.FLOWCHART_BILLING_WEBHOOK_SECRET;
const event = verifyWebhook({
  payload: rawBody,
  signature: headerValue,
  secret: secret ?? "",
});
```

The host owns `FLOWCHART_BILLING_WEBHOOK_SECRET`. This package never reads the environment. Tests sign a fixture with `whsec_test_flowchart_billing`, which is not a live key and is not a default inside the library. This is the classic `t=,v1=` scheme used by checkout and invoice events. It is not Stripe's thin-event scheme.

Hosted-tier event names are `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. A signature is checked for every event type. `livemode` is returned on the event. Acting on a live event is the host's decision, made with the secret that host configured.

## Run

From this directory, with Node.js 22 or newer:

```bash
npm install
npm test
```

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
