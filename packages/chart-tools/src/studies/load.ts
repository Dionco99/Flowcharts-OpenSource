// SPDX-License-Identifier: Apache-2.0

import type { IndicatorPackage } from "../study";

const modules = (import.meta as unknown as { glob: (pattern: string, options?: { eager?: boolean }) => Record<string, { study: IndicatorPackage }> }).glob(
  "./packages/*.ts",
  { eager: true },
);

/** Every file in packages/ that exports `study` is a chart study. The chart does not name them. */
export function loadStudies(): IndicatorPackage[] {
  return Object.keys(modules)
    .sort()
    .map((key) => modules[key].study);
}
