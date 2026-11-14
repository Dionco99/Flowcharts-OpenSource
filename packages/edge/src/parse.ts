// SPDX-License-Identifier: Apache-2.0

const R_TOKEN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/** Parse a paste of R results. Commas, semicolons, and whitespace separate values. */
export function parseRSample(text: string): number[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("Enter at least one R value. Separate values with commas or new lines.");
  }
  const tokens = trimmed.split(/[\s,;]+/).filter((token) => token.length > 0);
  const values: number[] = [];
  for (const token of tokens) {
    if (!R_TOKEN.test(token)) {
      throw new Error(`Could not read "${token}" as an R value.`);
    }
    const value = Number(token);
    if (!Number.isFinite(value)) {
      throw new Error(`Could not read "${token}" as an R value.`);
    }
    values.push(value);
  }
  if (values.length === 0) {
    throw new Error("Enter at least one R value. Separate values with commas or new lines.");
  }
  return values;
}
