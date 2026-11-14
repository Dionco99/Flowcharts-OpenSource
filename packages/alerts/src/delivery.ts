// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { AlertsError } from "./errors.ts";

export type DeliveryKind = "webhook" | "email" | "push" | "sound";

export interface AlertEvent {
  alertId: string;
  symbol: string;
  name: string;
  message: string;
  cursor: string;
  price: string;
  firedAt: string;
}

export interface WebhookTarget {
  url: string;
}

export interface EmailTarget {
  to: string;
  subject?: string;
}

export interface PushTarget {
  token: string;
  title?: string;
}

export interface SoundTarget {
  cue: string;
}

export interface DeliveryReceipt {
  kind: DeliveryKind;
  accepted: true;
  id: string;
}

export interface WebhookPort {
  readonly kind: "webhook";
  deliver(event: AlertEvent, target: WebhookTarget): DeliveryReceipt | Promise<DeliveryReceipt>;
}

export interface EmailPort {
  readonly kind: "email";
  deliver(event: AlertEvent, target: EmailTarget): DeliveryReceipt | Promise<DeliveryReceipt>;
}

export interface PushPort {
  readonly kind: "push";
  deliver(event: AlertEvent, target: PushTarget): DeliveryReceipt | Promise<DeliveryReceipt>;
}

/** A local cue. Sound stays on this machine. */
export interface SoundPort {
  readonly kind: "sound";
  deliver(event: AlertEvent, target: SoundTarget): DeliveryReceipt | Promise<DeliveryReceipt>;
}

export interface DeliveryPorts {
  webhook?: WebhookPort;
  email?: EmailPort;
  push?: PushPort;
  sound?: SoundPort;
}

export interface DeliveryPlan {
  webhook?: WebhookTarget;
  email?: EmailTarget;
  push?: PushTarget;
  sound?: SoundTarget;
}

export interface OutboxItem {
  kind: DeliveryKind;
  event: AlertEvent;
  target: WebhookTarget | EmailTarget | PushTarget | SoundTarget;
  body: string;
}

export function assertDeliveryPlan(plan: DeliveryPlan | undefined): void {
  if (!plan) return;
  if (plan.webhook) assertWebhook(plan.webhook.url);
  if (plan.email) assertEmail(plan.email.to);
  if (plan.push) assertToken(plan.push.token);
  if (plan.sound && plan.sound.cue.trim() === "") {
    throw new AlertsError("invalid_argument", "sound cue is empty");
  }
}

export function assertWebhook(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AlertsError("invalid_argument", "webhook url is not a URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AlertsError("invalid_argument", "webhook url must be http or https");
  }
}

export function assertEmail(to: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new AlertsError("invalid_argument", "email address is invalid");
  }
}

export function assertToken(token: string): void {
  if (token.trim() === "" || token.length > 512) {
    throw new AlertsError("invalid_argument", "push token is empty or too long");
  }
}

export function webhookBody(event: AlertEvent): string {
  return JSON.stringify({
    alertId: event.alertId,
    symbol: event.symbol,
    name: event.name,
    message: event.message,
    cursor: event.cursor,
    price: event.price,
    firedAt: event.firedAt,
  });
}

export function emailBody(event: AlertEvent, target: EmailTarget): string {
  const subject = target.subject ?? `${event.symbol} ${event.name}`;
  return `To: ${target.to}\nSubject: ${subject}\n\n${event.message}\nPrice: ${event.price}\nCursor: ${event.cursor}\n`;
}

export function pushBody(event: AlertEvent, target: PushTarget): string {
  const title = target.title ?? event.name;
  return `${title}\n${event.symbol} ${event.message}\n${event.price}`;
}

export interface RecordingPorts {
  ports: DeliveryPorts;
  outbox: OutboxItem[];
}

/** In-memory ports. They record the payload and do not open a connection. */
export function recordingPorts(): RecordingPorts {
  const outbox: OutboxItem[] = [];
  let n = 0;
  const next = (kind: DeliveryKind): DeliveryReceipt => {
    n += 1;
    return { kind, accepted: true, id: `local-${kind}-${n}` };
  };
  return {
    outbox,
    ports: {
      webhook: {
        kind: "webhook",
        deliver(event, target) {
          assertWebhook(target.url);
          outbox.push({ kind: "webhook", event, target, body: webhookBody(event) });
          return next("webhook");
        },
      },
      email: {
        kind: "email",
        deliver(event, target) {
          assertEmail(target.to);
          outbox.push({ kind: "email", event, target, body: emailBody(event, target) });
          return next("email");
        },
      },
      push: {
        kind: "push",
        deliver(event, target) {
          assertToken(target.token);
          outbox.push({ kind: "push", event, target, body: pushBody(event, target) });
          return next("push");
        },
      },
      sound: {
        kind: "sound",
        deliver(event, target) {
          if (target.cue.trim() === "") throw new AlertsError("invalid_argument", "sound cue is empty");
          outbox.push({ kind: "sound", event, target, body: target.cue });
          return next("sound");
        },
      },
    },
  };
}
