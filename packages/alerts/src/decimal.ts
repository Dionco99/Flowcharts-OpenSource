// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import { AlertsError } from "./errors.ts";

const DECIMAL = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;

/** A decimal string parsed to a scaled integer. Prices stay exact. */
export class Decimal {
  private constructor(
    readonly n: bigint,
    readonly scale: number,
  ) {}

  static parse(value: string): Decimal {
    const match = DECIMAL.exec(value);
    if (!match) {
      throw new AlertsError("invalid_argument", `not a decimal string: ${value}`);
    }
    const sign = match[1] === "-" ? -1n : 1n;
    const frac = match[3] ?? "";
    const digits = (match[2] + frac).replace(/^0+(?=\d)/, "");
    const n = BigInt(digits) * sign;
    return new Decimal(n, frac.length);
  }

  static zero(): Decimal {
    return new Decimal(0n, 0);
  }

  static int(value: bigint): Decimal {
    return new Decimal(value, 0);
  }

  static max(a: Decimal, b: Decimal): Decimal {
    return a.cmp(b) >= 0 ? a : b;
  }

  static min(a: Decimal, b: Decimal): Decimal {
    return a.cmp(b) <= 0 ? a : b;
  }

  static scaled(n: bigint, scale: number): Decimal {
    if (!Number.isInteger(scale) || scale < 0) {
      throw new AlertsError("invalid_argument", "scale must be a non-negative integer");
    }
    return new Decimal(n, scale);
  }

  rescale(scale: number): Decimal {
    if (!Number.isInteger(scale) || scale < 0) {
      throw new AlertsError("invalid_argument", "scale must be a non-negative integer");
    }
    if (scale >= this.scale) return new Decimal(this.align(scale), scale);
    const factor = 10n ** BigInt(this.scale - scale);
    const neg = this.n < 0n;
    const an = neg ? -this.n : this.n;
    const q = an / factor;
    const r = an % factor;
    const digit = r * 2n >= factor ? q + 1n : q;
    return new Decimal(neg ? -digit : digit, scale);
  }

  private align(scale: number): bigint {
    if (scale < this.scale) {
      throw new AlertsError("invalid_argument", "cannot align to a smaller scale");
    }
    return this.n * 10n ** BigInt(scale - this.scale);
  }

  cmp(other: Decimal): -1 | 0 | 1 {
    const scale = Math.max(this.scale, other.scale);
    const a = this.align(scale);
    const b = other.align(scale);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  neg(): Decimal {
    return new Decimal(-this.n, this.scale);
  }

  add(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    return new Decimal(this.align(scale) + other.align(scale), scale);
  }

  sub(other: Decimal): Decimal {
    return this.add(other.neg());
  }

  mul(other: Decimal): Decimal {
    return new Decimal(this.n * other.n, this.scale + other.scale);
  }

  isZero(): boolean {
    return this.n === 0n;
  }

  /** Divide and round half away from zero at `scale` fractional digits. */
  div(other: Decimal, scale: number): Decimal {
    if (other.n === 0n) {
      throw new AlertsError("invalid_argument", "division by zero");
    }
    if (!Number.isInteger(scale) || scale < 0) {
      throw new AlertsError("invalid_argument", "scale must be a non-negative integer");
    }
    const neg = (this.n < 0n) !== (other.n < 0n);
    const an = this.n < 0n ? -this.n : this.n;
    const ad = other.n < 0n ? -other.n : other.n;
    const base = an * 10n ** BigInt(other.scale + scale);
    const den = ad * 10n ** BigInt(this.scale);
    const q = base / den;
    const r = base % den;
    const digit = r * 2n >= den ? q + 1n : q;
    return new Decimal(neg ? -digit : digit, scale);
  }

  toString(): string {
    if (this.n === 0n) return "0";
    const neg = this.n < 0n;
    const digits = (neg ? -this.n : this.n).toString();
    let text: string;
    if (this.scale === 0) {
      text = digits;
    } else if (digits.length <= this.scale) {
      text = `0.${digits.padStart(this.scale, "0")}`;
    } else {
      const cut = digits.length - this.scale;
      text = `${digits.slice(0, cut)}.${digits.slice(cut)}`;
    }
    if (text.includes(".")) {
      text = text.replace(/0+$/, "").replace(/\.$/, "");
    }
    return neg ? `-${text}` : text;
  }
}

export function isDecimal(value: string): boolean {
  return DECIMAL.test(value);
}

export function cmpDecimal(a: string, b: string): -1 | 0 | 1 {
  return Decimal.parse(a).cmp(Decimal.parse(b));
}

export function subDecimal(a: string, b: string): string {
  return Decimal.parse(a).sub(Decimal.parse(b)).toString();
}

export function addDecimal(a: string, b: string): string {
  return Decimal.parse(a).add(Decimal.parse(b)).toString();
}

/** `(latest - past) / past * 100`, or null when past is zero. */
export function percentChange(latest: string, past: string, scale = 6): string | null {
  const base = Decimal.parse(past);
  if (base.isZero()) return null;
  const hundred = Decimal.int(100n);
  return Decimal.parse(latest).sub(base).mul(hundred).div(base, scale).toString();
}

export function decimalToNumber(value: string): number {
  const parsed = Decimal.parse(value);
  const n = Number(parsed.toString());
  if (!Number.isFinite(n)) {
    throw new AlertsError("invalid_argument", `decimal is not finite: ${value}`);
  }
  return n;
}
