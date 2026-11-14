// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0
const SECRET_KEY = /api[-_ ]?key|secret|password|passphrase|token|authorization|credential|private[-_ ]?key/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const ASSIGNED =
  /(api[-_ ]?key|secret|password|passphrase|token|authorization)(["']?\s*[:=]\s*["']?)[^"',\s}&]+/gi;

export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 4) out = out.split(secret).join("[redacted]");
  }
  out = out.replace(BEARER, "Bearer [redacted]");
  out = out.replace(ASSIGNED, "$1$2[redacted]");
  return out;
}

export function redactValue(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") return redactText(value, secrets);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? "[redacted]" : redactValue(item, secrets);
    }
    return out;
  }
  return "[redacted]";
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "request failed";
}
