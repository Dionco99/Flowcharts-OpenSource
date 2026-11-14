// SPDX-License-Identifier: Apache-2.0

import type { CheckoutPort, CheckoutRequest, CheckoutSession } from "./checkout.js";
import type { PortalPort, PortalRequest, PortalSession } from "./portal.js";
import { assertCheckoutRequest, type NormalizedCheckoutRequest, assertPortalRequest, type NormalizedPortalRequest } from "./validate.js";

export interface RecordedCheckout {
  readonly request: NormalizedCheckoutRequest;
  readonly session: CheckoutSession;
}

export interface RecordedPortal {
  readonly request: NormalizedPortalRequest;
  readonly session: PortalSession;
}

/**
 * In-memory checkout and portal. Session URLs use the reserved `.invalid`
 * domain. This stands in for a host adapter and never contacts Stripe.
 */
export class OfflineBilling {
  readonly checkout: CheckoutPort;
  readonly portal: PortalPort;
  private readonly checkouts: RecordedCheckout[] = [];
  private readonly portals: RecordedPortal[] = [];
  private sequence = 0;

  constructor() {
    this.checkout = {
      createSession: (request) => this.createCheckout(request),
    };
    this.portal = {
      createSession: (request) => this.createPortal(request),
    };
  }

  recordedCheckouts(): readonly RecordedCheckout[] {
    return [...this.checkouts];
  }

  recordedPortals(): readonly RecordedPortal[] {
    return [...this.portals];
  }

  private async createCheckout(input: CheckoutRequest): Promise<CheckoutSession> {
    const request = assertCheckoutRequest(input);
    const id = `offline_checkout_${this.nextId()}`;
    const session = Object.freeze({
      id,
      url: `https://billing.invalid/checkout/${id}`,
    });
    this.checkouts.push(Object.freeze({ request, session }));
    return session;
  }

  private async createPortal(input: PortalRequest): Promise<PortalSession> {
    const request = assertPortalRequest(input);
    const id = `offline_portal_${this.nextId()}`;
    const session = Object.freeze({
      id,
      url: `https://billing.invalid/portal/${id}`,
    });
    this.portals.push(Object.freeze({ request, session }));
    return session;
  }

  private nextId(): number {
    this.sequence += 1;
    return this.sequence;
  }
}
