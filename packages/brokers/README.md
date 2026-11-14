# brokers

Venue adapters behind the broker port in `packages/orders`. A rejected call returns `{ ok: false, code }` and leaves the book unchanged. Demo and paper hosts are the default. A live-money call stays behind `confirmRealMoney` (default `false`) and `FLOWCHART_ALLOW_LIVE_NETWORK=1`. API keys, secrets, and tokens stay in `CredentialVault` (AES-256-GCM). They are not logged.

Demo or paper placement, when a credential and a client are supplied:

- Binance, Bybit, and OKX through a CCXT-shaped client. The CCXT package is not bundled. Spot Binance does not attach a stop or target. Kraken has no demo, so that adapter makes no call.
- OANDA v20 practice (`api-fxpractice.oanda.com`), with `stopLossOnFill` and `takeProfitOnFill`.
- Alpaca paper (`paper-api.alpaca.markets`), including the OAuth authorize URL and code exchange.
- Tradier sandbox. A stop or target attaches on a limit or stop as OTO or OTOCO, not on a market order.
- TradeLocker demo, with absolute stop and target. Login is a demo JWT.

cTrader maps `PROTO_OA_NEW_ORDER_REQ` (volume is lots × 100) and the default transport opens no socket. IBKR Client Portal Gateway maps a bracket and `place` returns `interface_only` without calling the gateway. MT5 and Tradovate stay documented. MetaApi, Rithmic, and CQG are rejected. Backtest fills locally at the mark or the order price and does not attach a stop or target.

`modify` and `modifyProtection` return `modify_unsupported` or `order_not_working`. They do not amend a venue order. `cancel` is wired for the demo and paper adapters above.

FundedNext automation is refused on cTrader and Match-Trader, and on MT4 or MT5 at $50,000 or above. Under $50,000 the call is allowed with the published warnings. This is a block, not a compliance certificate.

```bash
npm install
npm test
npm run typecheck
```

Apache-2.0. See [docs/dependencies.md](../../docs/dependencies.md). No market-data files and no venue SDK are bundled. Tests mock the HTTP or CCXT client and do not place an order.
