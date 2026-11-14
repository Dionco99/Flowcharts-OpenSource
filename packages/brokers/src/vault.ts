// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { BrokerError } from "./errors.ts";

interface Envelope {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

interface StoredEntry {
  id: string;
  envelope: Envelope;
}

/**
 * AES-256-GCM credentials. The passphrase and the field values stay off
 * `JSON.stringify` and `util.inspect`.
 */
export class CredentialVault {
  #passphrase: string;
  #entries = new Map<string, Envelope>();

  constructor(passphrase: string, state?: string) {
    if (typeof passphrase !== "string" || passphrase.length < 8) {
      throw new BrokerError("bad_vault", "The vault passphrase must be at least 8 characters.");
    }
    this.#passphrase = passphrase;
    if (state !== undefined) {
      const parsed = JSON.parse(state) as { entries?: StoredEntry[] };
      for (const entry of parsed.entries ?? []) this.#entries.set(entry.id, entry.envelope);
    }
  }

  put(id: string, fields: Record<string, string>): void {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(this.#passphrase, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(fields), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    this.#entries.set(id, {
      v: 1,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: data.toString("base64"),
    });
  }

  get(id: string): Record<string, string> {
    const envelope = this.#entries.get(id);
    if (!envelope) throw new BrokerError("credential_required", "No credential is stored under that id.");
    try {
      const key = scryptSync(this.#passphrase, Buffer.from(envelope.salt, "base64"), 32);
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, "base64")),
        decipher.final(),
      ]).toString("utf8");
      return JSON.parse(plain) as Record<string, string>;
    } catch (error) {
      if (error instanceof BrokerError) throw error;
      throw new BrokerError("credential_unreadable", "The credential envelope could not be opened.");
    }
  }

  exportState(): string {
    return JSON.stringify(this.toJSON());
  }

  toJSON(): { entries: StoredEntry[] } {
    return {
      entries: [...this.#entries].map(([id, envelope]) => ({ id, envelope })),
    };
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `CredentialVault { entries: ${this.#entries.size} }`;
  }
}
