# brokers

Venue adapters behind the broker port in `packages/orders`. A rejected `BrokerPort` call returns `{ ok: false, code }` and leaves the book unchanged. Demo and paper hosts are the default. A live-money call stays behind `confirmRealMoney`, which defaults to off, and also requires `FLOWCHART_ALLOW_LIVE_NETWORK=1`. API keys, secrets, and tokens stay in `CredentialVault` (AES-256-GCM). They are not logged.

Demo or paper placement, when a credential and a client are supplied:

- Binance, Bybit, and OKX through CCXT (MIT). Spot Binance does not attach a stop or target, so those controls stay hidden.
- OANDA v20 practice.
- Alpaca paper, using OAuth.
- Tradier sandbox. OAuth for partner apps. A stop or target attaches on a resting order, not a market order.
- TradeLocker demo.

Kraken has no self-service CCXT demo, so that adapter refuses the network. cTrader maps `PROTO_OA_NEW_ORDER_REQ` and does not open a socket. IBKR Client Portal Gateway is an interface: the bracket is mapped and not submitted. MT5 and Tradovate stay documented. MetaApi, Rithmic, and CQG are rejected.

CCXT is a dependency. It is not vendored in this repository.

```bash
npm install
npm test
npm run typecheck
```

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
