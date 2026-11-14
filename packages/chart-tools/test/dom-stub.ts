// Copyright 2026 Dionco_X
// SPDX-License-Identifier: Apache-2.0
// Sets window before KLineChart evaluates. Import this module first.
const windowStub = {
  navigator: { userAgent: "node" },
  devicePixelRatio: 1,
};
Object.defineProperty(globalThis, "window", { value: windowStub, configurable: true });
