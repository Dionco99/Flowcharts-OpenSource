# Flowchart dependencies and license

Flowchart license: Apache-2.0.

## Use

- Charting: KLineChart (https://github.com/klinecharts/KLineChart, Apache-2.0). Do not use TradingView lightweight-charts (NOTICE plus a visible tradingview.com link).
- Indicators: TA-Lib (BSD-3-Clause), indicatorts (MIT) for TypeScript, pandas-ta-classic (MIT). technicalindicators is stale.
- Backtesting: QuantConnect LEAN (Apache-2.0) for strategy backtests. Bar-replay UX is in-house. jesse (MIT) is an optional crypto alternative.
- Scripting: PyneCore (Apache-2.0) as a reference or sidecar. Long-term scripting is a clean-room Flowchart Script. Do not use the Pine Script or TradingView trademarks.
- Market data: CCXT (MIT), with OpenBB (Apache-2.0) as the adapter layer.

## Keep out of core

- PineTS, backtesting.py, cryptofeed (AGPL-3.0).
- freqtrade, backtrader (GPL-3.0).
- vectorbt (Commons Clause).
- nautilus_trader (LGPL, sidecar only).

## Data

Do not bundle Binance Vision (CC BY-NC-SA), Dukascopy, or HistData files. Yahoo data terms apply to yfinance. Users connect their own feeds.
