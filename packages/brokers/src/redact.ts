// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

/** Replace credential material in a venue error. Short fragments are left alone. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 8) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out;
}
