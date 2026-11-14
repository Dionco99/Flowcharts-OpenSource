# Flowchart Script

Flowchart Script is the desk's bar language. A script reads one window — the bars already closed — and returns plots, order intents, and alerts. It does not read a later bar, it does not open a broker, and it does not load market data.

The license is Apache-2.0, in the repository `LICENSE`. Product choices stay inside `docs/dependencies.md` at the repository root. This package lives at `packages/script`. It is not published on its own, and it has no runtime dependencies: the averages and the other builtins are implemented here.

## Run

```bash
npm install
npm test
npm run typecheck
```

`npm test` runs 24 tests in `packages/script/test`. `npm run typecheck` typechecks the same sources.

## File

A script is plain text. The sample is `packages/script/examples/ma-cross.flow`.

```
script ma_cross
param fast = 10
param slow = 30
param size = 1
def fast_ma = sma(close, fast)
def slow_ma = sma(close, slow)
draw fast_ma label "Fast"
draw slow_ma label "Slow"
on crosses_above(fast_ma, slow_ma)
  long size
  notify "fast crossed above slow"
end
on crosses_below(fast_ma, slow_ma)
  short size
  notify "fast crossed below slow"
end
end
```

`//` comments run to the end of the line. Text uses double quotes, with `\\`, `\"`, `\n`, and `\t`.

## Statements

A script is `script name` … `end`. The name is not a series.

| Statement | Effect |
| --- | --- |
| `param name = value` | A fixed input. The value is a number, text, `true`, or `false`. A leading minus is allowed on a number. |
| `def name = expression` | A series, computed each bar from params, sources, and earlier defs. |
| `draw expression label "title"` | One plot, aligned to the window. Warmup slots are null. |
| `on condition` … `end` | When the condition is true on this bar, run the actions once. |
| `long lots` / `short lots` | Ask for a long or short position of that size. |
| `flat` | Ask to close the position. |
| `notify "message"` | Emit an alert. The message can also be a text param. |

Expressions are one line, unless a parenthesis is still open. Comparisons do not chain; write `a < b and b < c`. `and` and `or` stop early. `not` applies to a boolean.

A def can use its own earlier bars through `shift`. It cannot use its own current bar. Names of sources and builtins are reserved.

## Window

The caller passes the closed bars, oldest first. Each bar has `open`, `high`, `low`, `close`, `volume`, and an optional `time`. The script has no clock of its own. A prefix of the tape produces the same plots and orders as the start of the full run, so a bar does not change when later bars arrive.

Evaluation walks the bars in order. A rolling value is null until its window is full, and null if any slot in that window is null. A null or false condition does not fire. A number or text used as a condition is an error. Division by zero is null.

`run(source, bars, options)` accepts `options.params` to replace a declared param. The replacement must be the same kind of value. An unknown name is an error.

## Sources and builtins

| Name | Value |
| --- | --- |
| `open` `high` `low` `close` `volume` | That field of the current bar. |
| `hl2` | Average of high and low. |
| `hlc3` | Average of high, low, and close. |
| `ohlc4` | Average of open, high, low, and close. |
| `bar_index` | Zero-based index of the current bar. |

| Call | Value |
| --- | --- |
| `sma(series, length)` | Simple moving average. |
| `ema(series, length)` | Exponential moving average. The seed is a simple average of the first `length` values. The smoothing weight is `2 / (length + 1)`. |
| `shift(series, bars)` | The value `bars` earlier. Zero is the current bar. A negative count is rejected. |
| `highest(series, length)` `lowest(series, length)` | Extreme of the last `length` values. |
| `crosses_above(left, right)` | Left was at or below right on the previous bar, and left is above right now. Both sides must be numbers. |
| `crosses_below(left, right)` | Left was at or above right, and left is below right now. |
| `abs(value)` `max(a, b)` `min(a, b)` | The usual numbers. Null stays null. |

`length` and `bars` are fixed numbers: a literal, a param, or arithmetic on those. They are not series. A length is a positive whole number. `shift` bars are a whole number, zero or more.

## Orders, fills, and alerts

Each `long`, `short`, or `flat` appends an order intent and calls the backtest hook. Each `notify` appends an alert and calls the alert hook.

```ts
run(source, bars, {
  backtest: { onOrder(order, bar) {} },
  alert: { onAlert(alert, bar) {} },
})
```

An order has `barIndex`, the bar `time` when the bar has one, `side` (`long`, `short`, or `flat`), and `lots`. `flat` uses `lots` 0. A long or short lot size must be a positive finite number.

The in-house fill updates a single net position at the bar's close:

- `long` or `short` sets the position to that side and size. The fill price is the close, and that close becomes `averagePrice`.
- The same side and size again keeps the position and writes no fill. The intent is still recorded.
- `flat` closes the open size at the close. The fill's `lots` is the size that was closed.
- A reversal is one fill that replaces the position. This module does not compute realized P&L.

That fill is not the desk's broker port. A full strategy backtest stays behind the hook. The dependency policy names QuantConnect LEAN for that job.

## Editor completion

`complete(source, offset)` returns suggestions for a caret in the source. Each item has `label`, `kind` (`keyword`, `builtin`, `source`, or `name`), `detail`, and the `start` and `end` of the partial name the editor should replace.

- Inside text or a comment, the list is empty.
- A statement position suggests the words legal in that block: `script` at the top, `param`, `def`, `draw`, `on`, and `end` in the script, and `long`, `short`, `flat`, `notify`, and `end` inside `on`.
- A value position suggests sources, builtins, params, defs that are already complete, `true`, `false`, and `not`.
- The def being typed is not suggested inside its own expression.
- After a finished `draw` value, `label` is suggested. After a finished value, `and` and `or` are suggested.
- Text after the caret is ignored.

`languageCatalog()` lists the keywords, sources, and builtins for an editor that wants the whole set.

## Moving-average crossover

`packages/script/test/ma-crossover.test.ts` loads the sample and sets `fast` to 2 and `slow` to 4. The closes are `1, 1, 1, 1, 1, 2, 3, 4, 1, 1`.

| Bar | Close | Fast | Slow | Result |
| --- | --- | --- | --- | --- |
| 0–3 | 1 | warmup, then 1 | warmup, then 1 | no cross |
| 4 | 1 | 1 | 1 | equal, no cross |
| 5 | 2 | 1.5 | 1.25 | long 1, alert "fast crossed above slow", fill at 2 |
| 6–7 | 3, then 4 | above | above | no new cross |
| 8 | 1 | 2.5 | 2.5 | equal, no cross |
| 9 | 1 | 1 | 2.25 | short 1, alert "fast crossed below slow", fill at 1 |

The position ends short 1 lot at price 1. The hooks receive the same orders and alerts. With the sample windows of 10 and 30, the slow average stays null on this series, the fast average is null until the last bar (1.6), and nothing fires. The first six bars of the overridden run match the start of the full run.

## Code

- `packages/script/src/index.ts` — public exports
- `packages/script/src/lexer.ts` — tokens and the caret context
- `packages/script/src/parser.ts` — the script tree
- `packages/script/src/evaluate.ts` — bar walk, hooks, and the close fill
- `packages/script/src/complete.ts` — editor suggestions
- `packages/script/src/catalog.ts` — names and descriptions
- `packages/script/src/ast.ts` — the tree types
- `packages/script/src/errors.ts` — `ScriptError`, with a line and a column
- `packages/script/examples/ma-cross.flow` — the sample
- `packages/script/test/ma-crossover.test.ts` — the crossover backtest
- `packages/script/test/complete.test.ts` — editor suggestions
- `packages/script/test/interpret.test.ts` — averages, shift, fills, and causality
- `packages/script/docs/flowchart-script.md` — this contract beside the code
- `docs/dependencies.md` — allowed product dependencies
- `LICENSE` — Apache-2.0, shared with this package copy

## Out of this module

A script sees one symbol and only the bars it was given. It does not request another symbol, and `shift` cannot read a later bar. No market-data files are bundled. indicatorts, PyneCore, and LEAN are not imported. Live brokerage, prop rules, and the replay clock stay outside this module.
