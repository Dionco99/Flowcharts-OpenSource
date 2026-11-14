// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import type { Trade } from "./types.ts";

const DB_NAME = "flowchart-journal";
const DB_VERSION = 1;

export interface SnapshotRecord {
  id: string;
  blob: Blob;
  name: string;
  type: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("trades")) {
        db.createObjectStore("trades", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("snapshots")) {
        db.createObjectStore("snapshots", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the journal database."));
  });
}

function finish(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Journal write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Journal write aborted."));
  });
}

export async function loadTrades(): Promise<Trade[]> {
  const db = await openDb();
  const tx = db.transaction("trades", "readonly");
  const request = tx.objectStore("trades").getAll();
  const rows = await new Promise<Trade[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as Trade[]);
    request.onerror = () => reject(request.error);
  });
  await finish(tx);
  db.close();
  return rows;
}

export async function saveTrade(trade: Trade): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("trades", "readwrite");
  tx.objectStore("trades").put(trade);
  await finish(tx);
  db.close();
}

export async function deleteTrade(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("trades", "readwrite");
  tx.objectStore("trades").delete(id);
  await finish(tx);
  db.close();
}

export async function saveSnapshot(record: SnapshotRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("snapshots", "readwrite");
  tx.objectStore("snapshots").put(record);
  await finish(tx);
  db.close();
}

export async function loadSnapshot(id: string): Promise<SnapshotRecord | null> {
  const db = await openDb();
  const tx = db.transaction("snapshots", "readonly");
  const request = tx.objectStore("snapshots").get(id);
  const row = await new Promise<SnapshotRecord | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as SnapshotRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  await finish(tx);
  db.close();
  return row ?? null;
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("snapshots", "readwrite");
  tx.objectStore("snapshots").delete(id);
  await finish(tx);
  db.close();
}
