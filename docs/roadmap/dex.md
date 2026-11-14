# DEX roadmap

Plan only. This document describes a later non-custodial swap desk. It adds no package, no wallet SDK, no aggregator client, and no workflow. `.github/workflows/ci.yml` stays as it is.

Written against `main` at [`6badf61`](https://github.com/Dionco99/Flowcharts-OpenSource/commit/6badf6118b4d086981376995effd3e60521d2887) (trading journal, pull request 17). License of the repository: Apache-2.0. Dependency policy: [docs/dependencies.md](../dependencies.md). Hosted subscription ports: [packages/billing](../../packages/billing).

The swap work, when it starts, is a new package. `packages/brokers` implements `BrokerPort`: one symbol, one net position, and venue credentials in the vault. A spot swap is a single exchange of two token balances, signed by the user's wallet. It does not rest on the replay matcher and it does not use that port. `packages/chart-tools`, `packages/workspace`, `packages/alerts`, and `packages/journal` stay free of wallet and aggregator SDKs. The desk composes them.

## Non-custodial wallet connect

The wallet holds the keys. Flowchart stores a public session: chain id, address, and wallet name. The session lives in the same browser as the journal. Disconnect clears it.

`packages/accounts` syncs layouts and journal entries. It does not sync a signer. A second device connects the wallet again.

The desk asks the wallet to sign. The wallet broadcasts. The first slice has no relayer and no Flowchart-operated deposit address.

| Chain | Discovery | First named wallets |
| --- | --- | --- |
| Solana | Wallet Standard | Phantom. Solflare and Backpack register through the same standard. |
| EVM | EIP-6963 for injected providers, WalletConnect for a phone wallet, EIP-1193 to request accounts and send | MetaMask, Rabby, Coinbase Wallet, and Phantom's EVM provider |

Phantom is the first Solana wallet the desk names. The port is still Wallet Standard, so a second Solana wallet is another registration, not a second integration. `window.phantom.solana` is only the fallback when discovery returns no Solana wallet.

The desk requests accounts. It never asks for a seed phrase, a private key, or an export. Sign-in with Solana or sign-in with Ethereum can label a local session. Neither signature grants custody.

One connected address per chain in the first slice. An allowance revoke is its own transaction, with the same preview as a swap. Disconnect does not revoke an allowance.

A live broker order in `packages/brokers` waits for `confirmRealMoney` and `FLOWCHART_ALLOW_LIVE_NETWORK`. A swap has no server send behind those gates. The confirmation is the wallet prompt, and the desk refuses to open that prompt until the quote checks below have passed.

## Swap aggregation and the basis-point fee

Flowchart does not run a pool, an order book, or an inventory. It requests a quote from an aggregator, shows that quote, and asks the wallet to sign the transaction the aggregator built.

The host configures one fee, in basis points (1 bp is 0.01%), and one published recipient. The fee is collected inside the user's signed transaction. A free hosted tier can charge no subscription and still earn when someone chooses to swap. The open-source build ships at 0 bp, with no recipient and no fee account. A positive fee with an empty recipient is a hard error and produces no quote.

Planning assumption for the official hosted free tier: 25 bp. That number is a draft, not a price. It fits every aggregator cap below. A paid subscription, through the existing billing ports, can set a lower fee, including 0. The billing webhook does not collect this fee.

Checked against public integrator docs on 2026-11-14. The adapter pins the API revision it was written against. Parameter names below are the ones those docs use today.

| Route | Fee fields | Cap that 25 bp fits | Notes |
| --- | --- | --- | --- |
| Jupiter Swap `/build` (Solana) | `platformFeeBps`, and `feeAccount` when the fee is positive | 0–10000 bp | `feeAccount` is an initialized token account whose mint is one of the mints in the pair. This Metis path does not require Jupiter's referral program. [Add fees](https://developers.jup.ag/docs/swap/v1/add-fees-to-swap), [build](https://developers.jup.ag/docs/api-reference/swap/build). |
| Jupiter `/order` | `referralAccount`, `referralFee` | Floor 50 bp, ceiling 255 bp | Jupiter keeps 20% of that referral fee. 25 bp is below the floor, so the first Solana path is `/build`. `/order` also shows Jupiter's own pair fee (`feeBps`). [Swap API](https://developers.jup.ag/docs/swap). |
| 0x Swap API (EVM) | `swapFeeBps`, `swapFeeRecipient`, `swapFeeToken` | Default ceiling 1000 bp | `swapFeeToken` is the buy token or the sell token. One recipient in the first slice. [Monetize your app](https://docs.0x.org/evm/0x-swap-api/guides/monetize-your-app-using-swap). |
| 1inch classic swap (EVM) | `fee` as a percent of the source token, `referrer` as the recipient | 0–3% (0–300 bp) | The adapter converts basis points to that percent. 25 bp is `0.25`. The package re-checks this pair against the pinned 1inch revision before it calls the API. |

The first EVM adapter is 0x, because the fee is already in basis points. 1inch sits behind the same quote port as the second EVM route. The desk shows one quote at a time. It does not split one swap across both aggregators.

The quote the person sees, before the wallet opens:

- Input mint, output mint, and amounts, in token units
- Route label (`jupiter`, `0x`, or `1inch`) and chain
- Platform fee in basis points and in token units, and the recipient address
- Aggregator or pool fee, when the quote reports one
- Network fee estimate
- Price impact and minimum received after slippage
- Quote expiry

The executable price is that quote. The chart's last price is context beside it.

A route that bridges chains is refused in the first slice. The input and the output are on the connected chain.

Aggregator API keys, if a host uses them for rate limits, stay in the host environment. They are not written into the transaction and they are not a reason to close the package. The open-source app calls the public endpoint at 0 bp, or with a key the user supplies.

## Charts, alerts, and the journal

### Chart

The ticket reads the active chart symbol and maps it to a chain, an input mint, and an output mint. That mapping lives in the desk. A symbol with no mint, including the stage-1 EURUSD tape, leaves the ticket closed.

`packages/chart-tools` draws with KLineChart. A confirmed swap may add an execution mark at the confirmation time. The mark does not insert a bar, move the replay cursor, or change study inputs. Studies still see only bars the cursor has reached.

Replay never requests a quote and never signs. A replay session can show marks copied from journal entries that already exist.

### Alert

`packages/alerts` fires on bars the cursor has reached and delivers through webhook, email, push, and sound. An `AlertEvent` carries the alert id, symbol, name, message, cursor, price, and fired time. Those ports stay notifications.

A later local action, `prepareSwap`, is a desk handler. When an alert fires, the handler can open a quote for that symbol. It does not call the wallet. A webhook body stays the alert event. It does not carry a transaction, and a remote POST cannot arm a send.

The alert package does not take a wallet dependency. Preparing a quote does not fire the alert again.

### Journal

The journal record on `main` is `Trade` in `packages/journal/src/types.ts`. Source is `backtest`, `replay`, or `live`. Side is `long` or `short`. `tradeFromDraft` requires a symbol, a setup, an R result, and both times. Import uppercases the symbol and keeps it to 32 characters. `sessionRef` and `snapshotRef` keep 200 characters. Trades stay in IndexedDB `flowchart-journal`. The journal does not read the chart, the matcher, or a broker. Edge reads journal trades.

A spot swap uses that record as a round trip on the charted base:

- Buying the base opens or adds a `long`. The desk prefills source `live`, the symbol, setup `swap` (editable), and `openedAt` at the confirmation time.
- Selling the base closes the open `live` row for that symbol. `closedAt` is the sell confirmation. A sell with no open long becomes a `short` row only after the person confirms that choice. The draft shows the choice.
- `sessionRef` stores the transaction signature. A Solana signature and an EVM transaction hash both fit in 200 characters.
- Notes store the aggregator, the basis points, the fee amount, and the route label. Tags can carry the aggregator and the chain.
- `snapshotRef` is set when the desk captured the chart. The snapshot stays a reference, as the journal already stores it.
- R stays blank. `tradeFromDraft` rejects a save without an R result, and `0` is a scratch, so the desk does not write zero. The swap remains a draft until the person scores it. Edge does not count an unscored draft.

Amounts, mints, the public address, price impact, slippage, network fee, and status live on a side record, `flowchart.swap.v1`, kept by the desk. Status moves from `pending` to `confirmed` when the desk sees the confirmed transaction. A pending row is not a `Trade`. A dismissed quote writes nothing. The journal package does not import this record and does not import a wallet SDK.

## Security and audit

The threat is a swap the person did not mean to sign: a quote replaced after display, a fee recipient swapped, an unlimited token approval, or a delivery path that tries to send.

Before the wallet prompt, the desk:

1. Binds the displayed quote to the built transaction: mints, amounts, minimum out, fee in basis points, recipient, and fee account or fee token.
2. Parses the transaction and allows only the pinned Jupiter program ids, or the pinned 0x or 1inch router and allowance-holder addresses, for that deployment.
3. Simulates. Solana uses `simulateTransaction`. EVM uses `eth_call`. A failed simulation does not open the wallet.
4. Uses an exact-amount approval when an EVM allowance is required. An unlimited approval is refused.
5. Enforces quote expiry.
6. Compares the fee recipient in the transaction with the public host config. The open-source default is an empty recipient and 0 bp.

Slippage defaults to 50 bp. Above 300 bp the desk asks a second time. The product does not adopt an aggregator maximum (1inch classic allows a much wider slippage figure) as its own default.

Token names and logos from an aggregator are untrusted text. The desk escapes them.

The broker credential vault remains the place for venue API keys. A seed never enters that vault, a log, an issue, or a screenshot. Reports go through [GitHub Security Advisories](https://github.com/Dionco99/Flowcharts-OpenSource/security/advisories/new), as [SECURITY.md](../../SECURITY.md) already says.

Tests, when the package exists, mock the quote HTTP and use a fake wallet. They do not hold a mainnet key and they do not call a live aggregator. That work does not require an edit to `ci.yml` for this document, and a later package follows the per-package workflow pattern already on `main`.

Audit order:

1. A written threat model before any swap package.
2. An internal review of quote binding, the program allowlist, and the approval amount.
3. An external audit of fee injection and the signing path before a hosted fee is set above 0 bp.
4. A bug bounty only after that audit, once there is code to bounty.

## Regulatory notes

This section is a checklist for counsel. It is not a legal opinion, and it is not a conclusion that any license is or is not required.

The product is non-custodial. The user signs, the wallet broadcasts, and Flowchart holds no inventory and no client assets. That design avoids a custody service. It does not, by itself, answer exchange, order-transmission, financial-promotion, or sanctions rules. A hosted desk that sets a fee and names a recipient needs those checked before the fee is turned on. The Apache-2.0 tree can be published as software while that review is open. The fee stays at 0 bp until counsel clears the places the host actually serves.

| Topic | What counsel checks |
| --- | --- |
| EU MiCA, Regulation (EU) 2023/1114 | Recital 22 leaves services provided in a fully decentralised manner, with no intermediary, outside the regulation. A company that hosts the desk, sets the fee, and publishes a recipient is an intermediary for that test. The service list in Article 3 includes exchange of crypto-assets for other crypto-assets, and reception and transmission of orders. Custody is the service this design stays away from. Title V is the authorization regime if counsel finds a crypto-asset service is being provided. |
| Token issuance | Out of this plan. There is no Flowchart token, so issuer whitepaper duties are not taken on. |
| United Kingdom | The FCA financial-promotions regime for qualifying cryptoassets. A non-custodial interface can still be an invitation or inducement to UK consumers. |
| United States | FinCEN guidance FIN-2019-G001 distinguishes publishing unhosted-wallet software from accepting and transmitting value. A hosted UI that charges a swap fee needs its own opinion. State money-transmitter statutes differ. Securities and commodities rules follow the asset. This plan has no margin and no matching engine. |
| Other homes | Payment Services Act treatment in Singapore, VARA in Dubai, and the law of the place the host is established. |
| Sanctions | The first slice does not relay transactions. Whether the host screens a public address before quoting is a counsel decision. The open-source journal is a local trade log, not an AML monitor. |
| Recordkeeping | If the host is a crypto-asset service provider, its records belong in the host's compliance system. `packages/journal` stays on the device. |
| Adjacent products | Fiat on-ramps, lending, and staking are separate regulated activities. They are outside this plan. |

A jurisdiction limit, if counsel requires one, is a setting on the hosted deployment. This plan does not put a blocklist in the open-source packages.

## Apache-2.0 and a fee on the free tier

Apache-2.0 allows commercial use. A fee is compatible with the license. The license also means the fee math ships in the open tree, where the person signing can read it. The trading packages stay Apache-2.0. `scripts/check_apache_license.py` keeps requiring `SPDX-License-Identifier: Apache-2.0` on first-party source under `apps/`, `packages/`, and `scripts/`. This document adds no source file, so it does not change that check.

Open core here means an open trading desk plus an optional paid host. It does not mean a proprietary swap module.

| Build | Fee | What the person pays |
| --- | --- | --- |
| Open-source default | 0 bp, no recipient | Network fee and the aggregator's own fee, if any. No platform fee. |
| Official hosted free tier | The published basis points (planning assumption 25) | That fee, inside the signed swap, plus network and aggregator fees. No subscription. |
| Official hosted paid tier | A lower basis-point setting, including 0 | The subscription through `packages/billing`, and whatever swap fee that tier's config sets. |

`packages/billing` remains the checkout and portal ports for the subscription. It does not import a swap client, and a swap package does not import `@flowchart/billing`. The two prices share one codebase. The swap fee moves from the user's transaction to the published recipient. Stripe is not on that path.

A fork may set its own recipient. Apache-2.0 does not grant the Flowchart trademark, so a fork does not present that recipient as the official desk. The official recipient is the one the hosted deployment shows in the quote.

The fee check stays in the open package. A closed plugin, a Commons Clause, or a relicensed swap tree would hide the amount the wallet is about to move. That is the wrong trust model, and it breaks the license policy in [docs/dependencies.md](../dependencies.md).

## Order of work

This change is step 0. Later steps are not started here.

1. Counsel review for the places a host would serve, and a written threat model.
2. `flowchart.swap.v1` and the journal draft mapping. Types and tests with fixtures. No SDK and no network.
3. A quote port with mocked HTTP, fee 0, and the recipient check. Positive fee with an empty recipient fails.
4. Wallet connect. Phantom through Wallet Standard, then EIP-6963. The wallet opens only after the quote checks.
5. The chart ticket, an alert that opens a quote, and a journal draft the person scores with R.
6. External audit of fee injection and the signing path.
7. The host sets a non-zero basis-point fee only after that audit and the licensing review.

## Left out of the first slice

- Any package, client, or workflow in the change that adds this document
- An edit to `.github/workflows/ci.yml`
- A pool, an RFQ book, inventory, or a bridge product
- An alert that signs or broadcasts
- A project token, a fiat on-ramp, lending, or staking
- Merging this branch
