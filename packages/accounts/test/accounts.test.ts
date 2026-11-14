// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { AccountsError, connectAccounts, memoryDirectory, readJournalEntry, readLayoutDocument } from "../src/index.ts";
import type { AccountsClock, JournalEntry, JournalSyncRecord, LayoutDocument, LayoutSyncRecord, SyncRecord } from "../src/index.ts";

function clock(): AccountsClock {
  let tick = 0;
  let token = 0;
  return {
    now() {
      tick += 1;
      return new Date(Date.UTC(2024, 2, 12, 8, 0, tick)).toISOString();
    },
    token() {
      token += 1;
      return `token-${token}-abcdefghijklmnop`;
    },
    salt() {
      token += 1;
      return Buffer.alloc(16, token);
    },
  };
}

function entry(id = "trade-1"): JournalEntry {
  return {
    id,
    createdAt: "2024-03-12T12:00:00.000Z",
    updatedAt: "2024-03-12T12:00:00.000Z",
    source: "replay",
    symbol: "EURUSD",
    side: "short",
    openedAt: "2024-03-12T08:15:00.000Z",
    closedAt: "2024-03-12T09:40:00.000Z",
    setup: "London sweep",
    tags: ["late-entry"],
    notes: "Second touch failed.",
    emotions: "Chased it.",
    ruleAdherence: "partial",
    rResult: -0.5,
    snapshotRef: "sessions/london-short.png",
    snapshotId: null,
    sessionRef: "eurusd-2024-03-12",
  };
}

function layout(name = "London"): LayoutDocument {
  return {
    format: "flowchart.layout",
    version: 1,
    name,
    symbol: "EURUSD",
    candleType: "candle_solid",
    period: "7m",
    priceScale: "logarithm",
    timezone: "America/New_York",
    crosshairSync: true,
    panes: [{ id: "price" }],
    drawings: [],
    strategies: [],
    tree: [{ id: "price", kind: "pane" }],
  };
}

function asJournal(record: SyncRecord): JournalSyncRecord {
  assert.equal(record.kind, "journal");
  if (record.kind !== "journal") throw new Error("expected a journal row");
  return record;
}

function asLayout(record: SyncRecord): LayoutSyncRecord {
  assert.equal(record.kind, "layout");
  if (record.kind !== "layout") throw new Error("expected a layout row");
  return record;
}

function signUp(directory = memoryDirectory({ clock: clock() }), id = "ada", name = "Ada") {
  const device = connectAccounts(directory);
  const session = device.auth.signUp({ id, displayName: name, passphrase: "passphrase-one" });
  return { directory, device, session };
}

test("sign up, sign in, and sign out stay on this device", () => {
  const { directory, device, session } = signUp();
  assert.equal(session.accountId, "ada");
  assert.equal(session.displayName, "Ada");
  assert.equal(session.token.length >= 16, true);
  assert.equal(JSON.stringify(session).includes("passphrase-one"), false);
  assert.deepEqual(device.auth.current(), session);

  device.auth.signOut();
  assert.equal(device.auth.current(), null);

  const again = device.auth.signIn({ id: "ada", passphrase: "passphrase-one" });
  assert.equal(again.accountId, "ada");
  assert.notEqual(again.token, session.token);

  const other = connectAccounts(directory);
  assert.equal(other.auth.current(), null);
  other.auth.signIn({ id: "ada", passphrase: "passphrase-one" });
  assert.notEqual(other.auth.current()?.token, device.auth.current()?.token);
});

test("rejected sign-in leaves the current session in place", () => {
  const { device } = signUp();
  const current = device.auth.current();
  assert.throws(
    () => device.auth.signIn({ id: "ada", passphrase: "wrong-passphrase" }),
    (error: unknown) => {
      assert.ok(error instanceof AccountsError);
      assert.equal(error.code, "bad_passphrase");
      assert.equal(error.message.includes("wrong-passphrase"), false);
      return true;
    },
  );
  assert.deepEqual(device.auth.current(), current);
  assert.throws(() => device.auth.signIn({ id: "missing", passphrase: "passphrase-one" }), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "unknown_account");
    return true;
  });
  assert.throws(() => signUp(memoryDirectory({ clock: clock() }), "Ada"), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "invalid_account");
    return true;
  });
  assert.throws(
    () => device.auth.signUp({ id: "ada", displayName: "Ada", passphrase: "passphrase-one" }),
    (error: unknown) => {
      assert.ok(error instanceof AccountsError);
      assert.equal(error.code, "account_exists");
      return true;
    },
  );
  assert.throws(
    () => device.auth.signUp({ id: "bea", displayName: "Bea", passphrase: "short" }),
    (error: unknown) => {
      assert.ok(error instanceof AccountsError);
      assert.equal(error.code, "invalid_account");
      return true;
    },
  );
});

test("a directory does not share rows with another directory", () => {
  const first = signUp();
  first.device.sync().push({
    kind: "journal",
    key: "trade-1",
    baseRevision: 0,
    deleted: false,
    entry: entry(),
  });
  const second = connectAccounts(memoryDirectory({ clock: clock() }));
  second.auth.signUp({ id: "ada", displayName: "Ada", passphrase: "passphrase-one" });
  assert.deepEqual(second.sync().pull(0), []);
});

test("journal and layout pushes sync to a second device", () => {
  const { directory, device } = signUp();
  const sync = device.sync();
  const journal = sync.push({
    kind: "journal",
    key: "trade-1",
    baseRevision: 0,
    deleted: false,
    entry: entry(),
  });
  const savedLayout = sync.push({
    kind: "layout",
    key: "London",
    baseRevision: 0,
    deleted: false,
    layout: layout(),
  });
  const journalRow = asJournal(journal);
  assert.equal(journalRow.revision, 1);
  assert.equal(journalRow.changeId, 1);
  assert.equal(journalRow.accountId, "ada");
  assert.equal(journalRow.entry?.symbol, "EURUSD");
  const layoutRow = asLayout(savedLayout);
  assert.equal(layoutRow.revision, 1);
  assert.equal(layoutRow.changeId, 2);
  assert.equal(layoutRow.layout?.period, "7m");
  assert.equal(layoutRow.layout?.crosshairSync, true);

  const other = connectAccounts(directory);
  other.auth.signIn({ id: "ada", passphrase: "passphrase-one" });
  const pulled = other.sync().pull(0);
  assert.deepEqual(pulled, [journal, savedLayout]);
  assert.deepEqual(other.sync().pull(journal.changeId), [savedLayout]);
  assert.deepEqual(other.sync().list("journal"), [journal]);
  assert.equal(other.sync().get("layout", "London")?.key, "London");
});

test("a later push keeps one latest row and a stale base conflicts", () => {
  const { directory, device } = signUp();
  device.sync().push({
    kind: "journal",
    key: "trade-1",
    baseRevision: 0,
    deleted: false,
    entry: entry(),
  });
  const updated = device.sync().push({
    kind: "journal",
    key: "trade-1",
    baseRevision: 1,
    deleted: false,
    entry: entry(),
  });
  const updatedRow = asJournal(updated);
  assert.equal(updatedRow.revision, 2);
  assert.equal(updatedRow.entry?.notes, "Second touch failed.");
  const latest = device.sync().pull(0);
  assert.equal(latest.length, 1);
  assert.equal(latest[0]?.revision, 2);

  const other = connectAccounts(directory);
  other.auth.signIn({ id: "ada", passphrase: "passphrase-one" });
  assert.throws(
    () =>
      other.sync().push({
        kind: "journal",
        key: "trade-1",
        baseRevision: 1,
        deleted: false,
        entry: { ...entry(), notes: "Stale note." },
      }),
    (error: unknown) => {
      assert.ok(error instanceof AccountsError);
      assert.equal(error.code, "conflict");
      assert.equal(error.revision, 2);
      return true;
    },
  );
  const unchanged = device.sync().get("journal", "trade-1");
  assert.ok(unchanged);
  assert.equal(asJournal(unchanged).entry?.notes, "Second touch failed.");

  const deleted = other.sync().push({
    kind: "journal",
    key: "trade-1",
    baseRevision: 2,
    deleted: true,
    entry: null,
  });
  const tombstone = asJournal(deleted);
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.entry, null);
  assert.equal(tombstone.revision, 3);
  const pulledDelete = device.sync().pull(updatedRow.changeId);
  assert.equal(pulledDelete[0]?.deleted, true);
});

test("accounts cannot read each other's rows", () => {
  const { directory, device } = signUp();
  device.sync().push({
    kind: "layout",
    key: "London",
    baseRevision: 0,
    deleted: false,
    layout: layout(),
  });
  const bea = connectAccounts(directory);
  bea.auth.signUp({ id: "bea", displayName: "Bea", passphrase: "passphrase-two" });
  assert.deepEqual(bea.sync().pull(0), []);
  assert.equal(bea.sync().get("layout", "London"), null);
  device.auth.signOut();
  assert.throws(() => device.sync().pull(0), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "signed_out");
    return true;
  });
});

test("returned records are copies", () => {
  const { device } = signUp();
  const pushed = asJournal(
    device.sync().push({
      kind: "journal",
      key: "trade-1",
      baseRevision: 0,
      deleted: false,
      entry: entry(),
    }),
  );
  assert.ok(pushed.entry);
  pushed.entry.notes = "mutated";
  const reread = device.sync().get("journal", "trade-1");
  assert.ok(reread);
  assert.equal(asJournal(reread).entry?.notes, "Second touch failed.");

  const body = entry("trade-2");
  device.sync().push({
    kind: "journal",
    key: "trade-2",
    baseRevision: 0,
    deleted: false,
    entry: body,
  });
  body.notes = "changed after push";
  const stored = device.sync().get("journal", "trade-2");
  assert.ok(stored);
  assert.equal(asJournal(stored).entry?.notes, "Second touch failed.");
});

test("journal and layout bodies must match the sync key", () => {
  assert.equal(readJournalEntry({ ...entry(), symbol: "eurusd" }).symbol, "EURUSD");
  assert.throws(() => readJournalEntry({ ...entry(), source: "paper" }), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "invalid_record");
    return true;
  });
  assert.throws(() => readJournalEntry({ ...entry(), rResult: Number.NaN }), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "invalid_record");
    return true;
  });
  assert.throws(() => readLayoutDocument({ ...layout(), format: "other" }), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "invalid_record");
    return true;
  });
  assert.throws(() => readLayoutDocument({ ...layout(), period: "15min" }), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "invalid_record");
    return true;
  });

  const { device } = signUp();
  assert.throws(
    () =>
      device.sync().push({
        kind: "journal",
        key: "other",
        baseRevision: 0,
        deleted: false,
        entry: entry(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof AccountsError);
      assert.equal(error.code, "invalid_record");
      return true;
    },
  );
  assert.throws(
    () =>
      device.sync().push({
        kind: "layout",
        key: "London",
        baseRevision: 0,
        deleted: false,
        layout: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AccountsError);
      assert.equal(error.code, "invalid_record");
      return true;
    },
  );
  assert.throws(() => device.sync().pull(-1), (error: unknown) => {
    assert.ok(error instanceof AccountsError);
    assert.equal(error.code, "invalid_revision");
    return true;
  });
});
