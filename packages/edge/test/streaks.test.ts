// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expectedLongestLosingStreak,
  probabilityLongestAtLeast,
  typicalLosingStreak,
} from "../src/streaks.ts";

test("three fair trades match the enumerated streaks", () => {
  const q = 0.5;
  const n = 3;
  assert.ok(Math.abs(probabilityLongestAtLeast(q, n, 1) - 0.875) < 1e-12);
  assert.ok(Math.abs(probabilityLongestAtLeast(q, n, 2) - 0.375) < 1e-12);
  assert.ok(Math.abs(probabilityLongestAtLeast(q, n, 3) - 0.125) < 1e-12);
  assert.equal(probabilityLongestAtLeast(q, n, 4), 0);
  const expected = expectedLongestLosingStreak(q, n);
  assert.equal(expected.exact, true);
  assert.ok(Math.abs(expected.value - 1.375) < 1e-12);
  assert.equal(typicalLosingStreak(q, n, 0.5), 1);
});

test("a sure loss and a sure win are the boundaries", () => {
  assert.equal(probabilityLongestAtLeast(1, 5, 5), 1);
  assert.equal(probabilityLongestAtLeast(1, 5, 6), 0);
  assert.equal(probabilityLongestAtLeast(0, 5, 1), 0);
  assert.equal(expectedLongestLosingStreak(1, 5).value, 5);
  assert.equal(expectedLongestLosingStreak(0, 5).value, 0);
  assert.equal(typicalLosingStreak(0, 20, 0.5), null);
});

test("longer samples make a long losing streak more ordinary, and the survival falls", () => {
  const short = typicalLosingStreak(0.6, 20, 0.5);
  const long = typicalLosingStreak(0.6, 500, 0.5);
  assert.ok(short !== null && long !== null);
  assert.ok(long >= short);
  assert.ok(long < 40);
  let previous = 1;
  for (let length = 1; length <= 12; length++) {
    const probability = probabilityLongestAtLeast(0.6, 100, length);
    assert.ok(probability <= previous + 1e-12);
    previous = probability;
  }
  assert.ok(probabilityLongestAtLeast(0.6, 100, 1) > 0.99);
  assert.ok(probabilityLongestAtLeast(0.6, 100, 6) > 0.5);
});
