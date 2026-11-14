# accounts

Local account session and sync records for layouts and journal entries. The package is `@flowchart/accounts`, Apache-2.0.

`memoryDirectory()` keeps the roster and the sync rows in the process. `connectAccounts(directory)` is one device. Two connections on the same directory can push and pull the same rows. A passphrase is checked with scrypt and is not kept. There is no user database, no network client, and no chart image bytes in a sync row.

A journal row carries the trade fields from `packages/journal`. A layout row carries a `flowchart.layout` version 1 document. Pane contents stay JSON. `packages/workspace` owns that shape.

```bash
cd packages/accounts
npm install
npm test
npm run typecheck
```

See the repository [README](../../README.md) and [docs/dependencies.md](../../docs/dependencies.md).
