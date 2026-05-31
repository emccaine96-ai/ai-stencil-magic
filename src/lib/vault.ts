// Browser-only IndexedDB wrapper for the Storage Vault.
// SSR-safe: every public method bails out early when `window` is missing.

export type VaultEntry = {
  id: string;
  createdAt: number;
  thumb: string;   // small dataURL preview
  stencil: string; // full stencil dataURL
  photo: string | null;
  style: string;
  meta?: Record<string, unknown>;
};

const DB_NAME = "primalprint-vault";
const STORE = "stencils";
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  const db = await openDB();
  return new Promise<T | void>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out: T | void;
    const req = fn(store);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

async function makeThumb(dataUrl: string, max = 320): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height || 1;
      const w = ratio > 1 ? max : Math.round(max * ratio);
      const h = ratio > 1 ? Math.round(max / ratio) : max;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

export async function saveStencil(input: {
  stencil: string;
  photo: string | null;
  style: string;
  meta?: Record<string, unknown>;
}): Promise<VaultEntry | void> {
  if (typeof window === "undefined") return;
  const thumb = await makeThumb(input.stencil);
  const entry: VaultEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    thumb,
    stencil: input.stencil,
    photo: input.photo,
    style: input.style,
    meta: input.meta,
  };
  await tx("readwrite", (s) => s.add(entry));
  return entry;
}

export async function listStencils(): Promise<VaultEntry[]> {
  const out = (await tx<VaultEntry[]>("readonly", (s) => s.getAll())) as VaultEntry[] | undefined;
  return (out ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteStencil(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function getStencil(id: string): Promise<VaultEntry | undefined> {
  const r = await tx<VaultEntry>("readonly", (s) => s.get(id));
  return r as VaultEntry | undefined;
}