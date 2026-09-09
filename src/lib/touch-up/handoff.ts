/**
 * Touch-Up Studio hand-off store.
 *
 * Why this exists: the previous hand-off wrote the full stencil data URL plus
 * the source photo data URL into sessionStorage. A 2K/4K PNG data URL is
 * commonly 3-8 MB, and sessionStorage caps around 5 MB per origin, so
 * `setItem` threw QuotaExceededError — which the caller swallowed — and the
 * Studio opened with nothing loaded (blank canvas), or with a stale photo left
 * over from an earlier session.
 *
 * IndexedDB has no such practical cap, so the payload goes here. The existing
 * sessionStorage keys are still honoured as a read fallback so older
 * hand-offs keep working.
 */
import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import type { TouchUpPayload, TouchUpAutosave } from "./session";

interface TouchUpDB extends DBSchema {
  handoff: { key: string; value: unknown };
}

const DB_NAME = "TouchUpStudioDB";
const DB_VERSION = 1;
const STORE = "handoff";

export const HANDOFF_KEY = "pending";
export const CURRENT_KEY = "current";
export const AUTOSAVE_KEY = "autosave";

let dbPromise: Promise<IDBPDatabase<TouchUpDB>> | null = null;

function db() {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  if (!dbPromise) {
    dbPromise = openDB<TouchUpDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

async function put(key: string, value: unknown): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  try {
    await d.put(STORE, value, key);
    return true;
  } catch {
    return false;
  }
}

async function get<T>(key: string): Promise<T | null> {
  const d = await db();
  if (!d) return null;
  try {
    return ((await d.get(STORE, key)) as T) ?? null;
  } catch {
    return null;
  }
}

async function del(key: string): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    await d.delete(STORE, key);
  } catch {
    /* ignore */
  }
}

/** Called from the generator before navigating to /touch-up. */
export async function writeHandoff(payload: TouchUpPayload): Promise<boolean> {
  return put(HANDOFF_KEY, payload);
}

export async function takeHandoff(): Promise<TouchUpPayload | null> {
  const payload = await get<TouchUpPayload>(HANDOFF_KEY);
  if (payload) await del(HANDOFF_KEY);
  return payload;
}

/** The stencil currently open in the Studio — survives reloads. */
export async function writeCurrent(payload: TouchUpPayload): Promise<boolean> {
  return put(CURRENT_KEY, payload);
}

export async function readCurrent(): Promise<TouchUpPayload | null> {
  return get<TouchUpPayload>(CURRENT_KEY);
}

export async function writeAutosave(value: TouchUpAutosave): Promise<boolean> {
  return put(AUTOSAVE_KEY, value);
}

export async function readAutosave(): Promise<TouchUpAutosave | null> {
  return get<TouchUpAutosave>(AUTOSAVE_KEY);
}

export async function clearAutosave(): Promise<void> {
  await del(AUTOSAVE_KEY);
}
