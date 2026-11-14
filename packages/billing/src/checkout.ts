// SPDX-License-Identifier: Apache-2.0

/**
 * Subscription checkout for the paid hosted tier.
 * A host implements this port. This package does not call Stripe.
 */
export interface CheckoutRequest {
  readonly priceId: string;
  /** Defaults to 1. */
  readonly quantity?: number;
  /** The hosted tier is a subscription. Any other mode is rejected. */
  readonly mode?: "subscription";
  readonly customerId?: string;
  readonly customerEmail?: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly clientReferenceId?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
}

export interface CheckoutPort {
  createSession(request: CheckoutRequest): Promise<CheckoutSession>;
}
