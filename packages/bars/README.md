# bars

Symbol spec and the 1-minute tape. The cursor is a timestamp. Higher timeframes are built from minutes whose close is at or before that cursor. Prices stay decimal strings. Market-data files stay out of this package; a desk supplies its own tape.

`aggregate` builds higher timeframes from minutes whose close is at or before the cursor. Prices are decimal strings.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
