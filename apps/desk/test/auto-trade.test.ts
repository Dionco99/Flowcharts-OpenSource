// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { EURUSD, type Minute } from "@flowchart/bars";
import { runReplay } from "@flowchart/orders";
import { replayScriptStrategy } from "../src/auto-trade.ts";
import { scriptOnClosedBars } from "../src/script-study.ts";

const source = `script once
on bar_index == 1
  long 0.1
end
on bar_index == 3
  flat
end
end
`;

function tape(count: number): Minute[] {
  const start = Date.parse("2024-06-03T07:00:00Z");
  return Array.from({ length: count }, (_, i) => {
    const price = (1.1 + i * 0.0001).toFixed(5);
    return { t: start + i * 60_000, o: price, h: price, l: price, c: price };
  });
}

test("replay auto-trade is off unless asked, and then fills only through the replay ticket", () => {
  const minutes = tape(6);
  const cursor = minutes[5].t + 60_000;
  const report = scriptOnClosedBars(source, minutes, "1m", cursor);
  assert.equal(report.error, null);
  assert.equal(replayScriptStrategy(false, report.intents), null);

  const idle = runReplay({
    minutes,
    cursor,
    spec: EURUSD,
    tradingTimeframe: "1m",
    orders: [],
    cancels: [],
    strategy: null,
  });
  assert.equal(idle.fills.length, 0);

  const book = runReplay({
    minutes,
    cursor,
    spec: EURUSD,
    tradingTimeframe: "1m",
    orders: [],
    cancels: [],
    strategy: replayScriptStrategy(true, report.intents),
  });
  assert.deepEqual(
    book.fills.map((fill) => [fill.side, fill.lots, fill.source]),
    [
      ["buy", "0.10", "strategy"],
      ["sell", "0.10", "strategy"],
    ],
  );
  assert.equal(book.position.lots, "0.00");
});
