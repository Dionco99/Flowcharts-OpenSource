# brokers

Venue adapters behind the broker port in `packages/orders`. A rejected call leaves the book unchanged. Demo and paper hosts are the default. A live-money call stays behind an explicit confirmation. API keys, secrets, and tokens stay in a credential vault.

Named venues include OANDA, cTrader, TradeLocker, IBKR, Alpaca, Tradier, and CCXT. MT5 and Tradovate stay documented until an adapter exists.

This directory is a scaffold.

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
