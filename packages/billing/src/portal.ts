// SPDX-License-Identifier: Apache-2.0

/**
 * Customer portal session for the paid hosted tier.
 * A host implements this port. This package does not call Stripe.
 */
export interface PortalRequest {
  readonly customerId: string;
  readonly returnUrl: string;
}

export interface PortalSession {
  readonly id: string;
  readonly url: string;
}

export interface PortalPort {
  createSession(request: PortalRequest): Promise<PortalSession>;
}
