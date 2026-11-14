// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export interface SecretStore {
  read(id: string): string | undefined;
  write(id: string, sealed: string): void;
  delete(id: string): void;
}

export class MemorySecretStore implements SecretStore {
  readonly #records = new Map<string, string>();

  read(id: string): string | undefined {
    return this.#records.get(id);
  }

  write(id: string, sealed: string): void {
    this.#records.set(id, sealed);
  }

  delete(id: string): void {
    this.#records.delete(id);
  }

  /** Ciphertext envelopes only. */
  exportAll(): Record<string, string> {
    return Object.fromEntries(this.#records);
  }
}

interface Envelope {
  v: 1;
  venue: string;
  alg: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function derive(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function sealFields(passphrase: string, venue: string, fields: Record<string, string>): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = derive(passphrase, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(fields), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const envelope: Envelope = {
      v: 1,
      venue,
      alg: "aes-256-gcm",
      kdf: "scrypt",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    return JSON.stringify(envelope);
  } finally {
    key.fill(0);
  }
}

export function openFields(passphrase: string, sealed: string): { venue: string; fields: Record<string, string> } {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(sealed) as Envelope;
  } catch {
    throw new Error("unable to open credential");
  }
  if (envelope.v !== 1 || envelope.alg !== "aes-256-gcm" || envelope.kdf !== "scrypt") {
    throw new Error("unable to open credential");
  }
  const key = derive(passphrase, Buffer.from(envelope.salt, "base64"));
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    const fields = JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
    plaintext.fill(0);
    return { venue: envelope.venue, fields };
  } catch {
    throw new Error("unable to open credential");
  } finally {
    key.fill(0);
  }
}

export class CredentialVault {
  readonly #passphrase: string;

  constructor(
    passphrase: string,
    private readonly store: SecretStore,
  ) {
    if (passphrase.length < 8) {
      throw new Error("Credential passphrase must be at least 8 characters.");
    }
    this.#passphrase = passphrase;
  }

  put(id: string, venue: string, fields: Record<string, string>): void {
    this.store.write(id, sealFields(this.#passphrase, venue, fields));
  }

  get(id: string): { venue: string; fields: Record<string, string> } {
    const sealed = this.store.read(id);
    if (sealed === undefined) throw new Error("credential not found");
    return openFields(this.#passphrase, sealed);
  }

  toString(): string {
    return "CredentialVault";
  }

  toJSON(): string {
    return "[redacted]";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "CredentialVault";
  }
}
