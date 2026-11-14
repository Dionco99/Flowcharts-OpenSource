// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { AccountsError } from "./errors.ts";
import { copyJson, readJournalEntry, readLayoutDocument, syncKey } from "./records.ts";
import type {
  AccountsClock,
  JournalSyncRecord,
  LayoutSyncRecord,
  LocalAuth,
  PushInput,
  Session,
  SignInInput,
  SignUpInput,
  SyncClient,
  SyncKind,
  SyncRecord,
} from "./types.ts";

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const ACCOUNT_ID = /^[a-z][a-z0-9-]{1,31}$/;

interface AccountRow {
  id: string;
  displayName: string;
  salt: Buffer;
  verifier: Buffer;
}

interface DirectoryState {
  clock: AccountsClock;
  accounts: Map<string, AccountRow>;
  sessions: Map<string, Session>;
  records: Map<string, Map<string, SyncRecord>>;
  changeSeq: Map<string, number>;
}

/** Process-local roster and sync rows. A directory is not a user database. */
export interface AccountDirectory {
  readonly kind: "memory";
}

export interface Accounts {
  auth: LocalAuth;
  sync(): SyncClient;
}

const STATES = new WeakMap<AccountDirectory, DirectoryState>();

export function systemClock(): AccountsClock {
  return {
    now(): string {
      return new Date().toISOString();
    },
    token(): string {
      return crypto.randomBytes(32).toString("hex");
    },
    salt(): Uint8Array {
      return crypto.randomBytes(16);
    },
  };
}

export function memoryDirectory(options?: { clock?: AccountsClock }): AccountDirectory {
  const directory: AccountDirectory = { kind: "memory" };
  STATES.set(directory, {
    clock: options?.clock ?? systemClock(),
    accounts: new Map(),
    sessions: new Map(),
    records: new Map(),
    changeSeq: new Map(),
  });
  return directory;
}

export function connectAccounts(directory: AccountDirectory): Accounts {
  const state = stateOf(directory);
  let token: string | null = null;

  const auth: LocalAuth = {
    current() {
      if (!token) return null;
      const session = state.sessions.get(token);
      return session ? copySession(session) : null;
    },
    signUp(input: SignUpInput) {
      const row = createAccount(state, input);
      token = replaceSession(state, token, row);
      return copySession(mustSession(state, token));
    },
    signIn(input: SignInInput) {
      const row = verifyAccount(state, input);
      token = replaceSession(state, token, row);
      return copySession(mustSession(state, token));
    },
    signOut() {
      if (token) state.sessions.delete(token);
      token = null;
    },
  };

  return {
    auth,
    sync() {
      if (!token) {
        throw new AccountsError("signed_out", "Sign in before syncing.");
      }
      const session = state.sessions.get(token);
      if (!session) {
        throw new AccountsError("signed_out", "Sign in before syncing.");
      }
      return syncClient(state, session.accountId);
    },
  };
}

function stateOf(directory: AccountDirectory): DirectoryState {
  const state = STATES.get(directory);
  if (!state || directory.kind !== "memory") {
    throw new AccountsError("invalid_account", "Connect a memory directory.");
  }
  return state;
}

function createAccount(state: DirectoryState, input: SignUpInput): AccountRow {
  const id = accountId(input.id);
  const displayName = displayNameOf(input.displayName);
  const passphrase = passphraseOf(input.passphrase);
  if (state.accounts.has(id)) {
    throw new AccountsError("account_exists", "An account with that id already exists.");
  }
  const salt = Buffer.from(state.clock.salt());
  if (salt.length < 16) {
    throw new AccountsError("invalid_account", "The clock salt must be at least 16 bytes.");
  }
  const row: AccountRow = {
    id,
    displayName,
    salt,
    verifier: hashPassphrase(passphrase, salt),
  };
  state.accounts.set(id, row);
  return row;
}

function verifyAccount(state: DirectoryState, input: SignInInput): AccountRow {
  const id = accountId(input.id);
  const passphrase = passphraseOf(input.passphrase);
  const row = state.accounts.get(id);
  if (!row) {
    throw new AccountsError("unknown_account", "No account uses that id.");
  }
  const got = hashPassphrase(passphrase, row.salt);
  if (!crypto.timingSafeEqual(got, row.verifier)) {
    throw new AccountsError("bad_passphrase", "The passphrase does not match.");
  }
  return row;
}

function replaceSession(state: DirectoryState, current: string | null, row: AccountRow): string {
  const token = state.clock.token();
  if (typeof token !== "string" || token.length < 16 || state.sessions.has(token)) {
    throw new AccountsError("invalid_account", "The clock issued an unusable session token.");
  }
  const session: Session = {
    accountId: row.id,
    displayName: row.displayName,
    token,
    issuedAt: clockNow(state.clock),
  };
  if (current) state.sessions.delete(current);
  state.sessions.set(token, session);
  return token;
}

function mustSession(state: DirectoryState, token: string): Session {
  const session = state.sessions.get(token);
  if (!session) {
    throw new AccountsError("signed_out", "Sign in before syncing.");
  }
  return session;
}

function syncClient(state: DirectoryState, accountId: string): SyncClient {
  return {
    push(input: PushInput) {
      return pushRecord(state, accountId, input);
    },
    get(kind: SyncKind, key: string) {
      const slot = slotOf(kind, syncKey(key, "sync key"));
      const record = storedRows(state, accountId)?.get(slot);
      return record ? copyRecord(record) : null;
    },
    list(kind: SyncKind) {
      const rows: SyncRecord[] = [];
      for (const record of storedRows(state, accountId)?.values() ?? []) {
        if (record.kind === kind) rows.push(copyRecord(record));
      }
      rows.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
      return rows;
    },
    pull(sinceChangeId: number) {
      const cursor = wholeNumber(sinceChangeId, "sinceChangeId");
      const rows: SyncRecord[] = [];
      for (const record of storedRows(state, accountId)?.values() ?? []) {
        if (record.changeId > cursor) rows.push(copyRecord(record));
      }
      rows.sort((left, right) => left.changeId - right.changeId);
      return rows;
    },
  };
}

function pushRecord(state: DirectoryState, accountId: string, input: PushInput): SyncRecord {
  const key = syncKey(input.key, "sync key");
  const baseRevision = wholeNumber(input.baseRevision, "baseRevision");
  const next = draftRecord(accountId, key, input);
  const rows = rowsForWrite(state, accountId);
  const slot = slotOf(input.kind, key);
  const existing = rows.get(slot);
  const current = existing ? existing.revision : 0;
  if (baseRevision !== current) {
    throw new AccountsError("conflict", `The ${input.kind} "${key}" is at revision ${current}.`, current);
  }
  const changeId = (state.changeSeq.get(accountId) ?? 0) + 1;
  state.changeSeq.set(accountId, changeId);
  const record = stamp(next, current + 1, changeId, clockNow(state.clock));
  rows.set(slot, record);
  return copyRecord(record);
}

function draftRecord(accountId: string, key: string, input: PushInput): SyncRecord {
  if (typeof input.deleted !== "boolean") {
    throw new AccountsError("invalid_record", "deleted must be true or false.");
  }
  if (input.kind === "journal") {
    if (input.deleted) {
      if (input.entry !== null) {
        throw new AccountsError("invalid_record", "A deleted journal entry has no body.");
      }
      const tombstone: JournalSyncRecord = {
        accountId,
        kind: "journal",
        key,
        revision: 0,
        changeId: 0,
        updatedAt: "",
        deleted: true,
        entry: null,
      };
      return tombstone;
    }
    if (input.entry === null) {
      throw new AccountsError("invalid_record", "A journal push needs an entry.");
    }
    const entry = readJournalEntry(input.entry);
    if (entry.id !== key) {
      throw new AccountsError("invalid_record", "The journal key must match the entry id.");
    }
    const row: JournalSyncRecord = {
      accountId,
      kind: "journal",
      key,
      revision: 0,
      changeId: 0,
      updatedAt: "",
      deleted: false,
      entry,
    };
    return row;
  }
  if (input.kind !== "layout") {
    throw new AccountsError("invalid_record", "Sync kind must be journal or layout.");
  }
  if (input.deleted) {
    if (input.layout !== null) {
      throw new AccountsError("invalid_record", "A deleted layout has no body.");
    }
    const tombstone: LayoutSyncRecord = {
      accountId,
      kind: "layout",
      key,
      revision: 0,
      changeId: 0,
      updatedAt: "",
      deleted: true,
      layout: null,
    };
    return tombstone;
  }
  if (input.layout === null) {
    throw new AccountsError("invalid_record", "A layout push needs a layout.");
  }
  const layout = readLayoutDocument(input.layout);
  if (layout.name !== key) {
    throw new AccountsError("invalid_record", "The layout key must match the layout name.");
  }
  const row: LayoutSyncRecord = {
    accountId,
    kind: "layout",
    key,
    revision: 0,
    changeId: 0,
    updatedAt: "",
    deleted: false,
    layout,
  };
  return row;
}

function stamp(record: SyncRecord, revision: number, changeId: number, updatedAt: string): SyncRecord {
  return { ...record, revision, changeId, updatedAt };
}

function storedRows(state: DirectoryState, accountId: string): Map<string, SyncRecord> | undefined {
  return state.records.get(accountId);
}

function rowsForWrite(state: DirectoryState, accountId: string): Map<string, SyncRecord> {
  let rows = state.records.get(accountId);
  if (!rows) {
    rows = new Map();
    state.records.set(accountId, rows);
  }
  return rows;
}

function slotOf(kind: SyncKind, key: string): string {
  if (kind !== "journal" && kind !== "layout") {
    throw new AccountsError("invalid_record", "Sync kind must be journal or layout.");
  }
  return `${kind}\0${key}`;
}

function copyRecord(record: SyncRecord): SyncRecord {
  return copyJson(record, "sync record");
}

function copySession(session: Session): Session {
  return { ...session };
}

function accountId(value: unknown): string {
  if (typeof value !== "string" || !ACCOUNT_ID.test(value)) {
    throw new AccountsError(
      "invalid_account",
      "An account id is 2 to 32 characters: a lowercase letter, then lowercase letters, digits, or hyphens.",
    );
  }
  return value;
}

function displayNameOf(value: unknown): string {
  if (typeof value !== "string") {
    throw new AccountsError("invalid_account", "A display name must be a string.");
  }
  const name = value.trim();
  if (!name || name.length > 80 || /\p{C}/u.test(name)) {
    throw new AccountsError("invalid_account", "A display name must be 1 to 80 characters.");
  }
  return name;
}

function passphraseOf(value: unknown): string {
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    throw new AccountsError("invalid_account", "A passphrase must be 8 to 200 characters.");
  }
  return value;
}

function hashPassphrase(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32, SCRYPT);
}

function clockNow(clock: AccountsClock): string {
  const value = clock.now();
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(parsed)) {
    throw new AccountsError("invalid_account", "The clock time must be an ISO timestamp.");
  }
  return new Date(parsed).toISOString();
}

function wholeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AccountsError("invalid_revision", `${label} must be a whole number.`);
  }
  return value;
}
