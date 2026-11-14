// SPDX-License-Identifier: Apache-2.0

export type Drawing =
  | { id: string; kind: "level"; t: number; price: number }
  | { id: string; kind: "segment"; t1: number; p1: number; t2: number; p2: number }
  | { id: string; kind: "range"; t1: number; p1: number; t2: number; p2: number }
  | { id: string; kind: "fib"; t1: number; p1: number; t2: number; p2: number };

export type DrawingKind = Drawing["kind"];
