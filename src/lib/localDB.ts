// AI Stencil Magic local document management — IndexedDB store.
// SSR-safe: every public method bails out when window/indexedDB is missing.

import { openDB, type IDBPDatabase, type DBSchema } from "idb";
import { v4 as uuidv4 } from "uuid";

export type VersionSnapshot = {
  timestamp: number;
  thumbnail: string;
  changes: string;
  /** Optional full editor state at this version (JSON-serialised). */
  editorState?: string;
};

export type LayerState = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  alphaLock: boolean;
  clipping: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** PNG dataURL of the layer pixels. */
  dataUrl: string;
};

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "color-dodge"
  | "color-burn"
  | "darken"
  | "lighten"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export type EditorState = {
  width: number;
  height: number;
  layers: LayerState[];
  activeLayerId: string;
};

export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
};

export type DocumentData = {
  id: string;
  name: string;
  tags: string[];
  folderId: string | null;
  thumbnail: string;
  originalAIImage: string | null;
  /** JSON-stringified EditorState. Kept as a string for fast IDB round-trips. */
  layeredEditorData: string | null;
  animationData?: string;
  clientNotes: string;
  versionHistory: VersionSnapshot[];
  style: string;
  createdAt: number;
  lastEdited: number;
  schemaVersion: number;
};

interface StencilMagicDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentData;
    indexes: {
      "by-name": string;
      "by-tags": string;
      "by-createdAt": number;
      "by-lastEdited": number;
      "by-folder": string;
    };
  };
  folders: {
    key: string;
    value: Folder;
    indexes: { "by-parent": string };
  };
}

const DB_NAME = "StencilMagicDB";
const DB_VERSION = 1;
export const CURRENT_SCHEMA = 1;

const LEGACY_DB_NAME = "PrimalPrintDB";
let _legacyMigrationRan = false;

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === "QuotaExceededError" ||
    e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(e.message ?? "")
  );
}

/** Drop heavy blobs from older version snapshots so a retry can succeed. */
function thinVersionHistory(doc: DocumentData): DocumentData {
  const hist = (doc.versionHistory ?? []).slice(-8).map((v, i, arr) => {
    // Keep the last 2 full; strip editorState + shrink older thumbs
    if (i < arr.length - 2) {
      return { ...v, editorState: undefined, thumbnail: v.thumbnail?.slice(0, 64) ?? "" };
    }
    return { ...v, editorState: undefined };
  });
  return { ...doc, versionHistory: hist };
}

async function putDocument(
  d: IDBPDatabase<StencilMagicDB>,
  doc: DocumentData,
): Promise<DocumentData> {
  try {
    await d.put("documents", doc);
    return doc;
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    console.warn("[vault] QuotaExceeded — thinning version history and retrying once");
    const thinned = thinVersionHistory(doc);
    await d.put("documents", thinned);
    return thinned;
  }
}

async function migrateLegacyDatabaseIfNeeded(): Promise<void> {
  if (_legacyMigrationRan) return;
  _legacyMigrationRan = true;
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  try {
    if (typeof indexedDB.databases === "function") {
      const existing = await indexedDB.databases();
      const hasLegacy = existing.some((entry) => entry.name === LEGACY_DB_NAME);
      if (!hasLegacy) return;
    }
    const legacyDb = await openDB(LEGACY_DB_NAME, 1).catch(() => null);
    if (!legacyDb) return;
    if (!legacyDb.objectStoreNames.contains("documents")) {
      legacyDb.close();
      return;
    }
    const legacyDocs = await legacyDb.getAll("documents");
    const legacyFolders = legacyDb.objectStoreNames.contains("folders")
      ? await legacyDb.getAll("folders")
      : [];
    legacyDb.close();
    if (legacyDocs.length === 0 && legacyFolders.length === 0) return;

    const newDb = await openDB<StencilMagicDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("documents")) {
          const s = d.createObjectStore("documents", { keyPath: "id" });
          s.createIndex("by-name", "name");
          s.createIndex("by-tags", "tags", { multiEntry: true });
          s.createIndex("by-createdAt", "createdAt");
          s.createIndex("by-lastEdited", "lastEdited");
          s.createIndex("by-folder", "folderId");
        }
        if (!d.objectStoreNames.contains("folders")) {
          const f = d.createObjectStore("folders", { keyPath: "id" });
          f.createIndex("by-parent", "parentId");
        }
      },
    });
    const existingCount = await newDb.count("documents");
    if (existingCount > 0) return;
    const tx = newDb.transaction(["documents", "folders"], "readwrite");
    for (const doc of legacyDocs) await tx.objectStore("documents").put(doc);
    for (const f of legacyFolders) await tx.objectStore("folders").put(f);
    await tx.done;
    console.info(
      `[vault] Migrated ${legacyDocs.length} document(s) and ${legacyFolders.length} folder(s) from legacy storage.`,
    );
  } catch (err) {
    console.warn("[vault] Legacy database migration skipped due to an error:", err);
  }
}

let _dbPromise: Promise<IDBPDatabase<StencilMagicDB>> | null = null;
function db(): Promise<IDBPDatabase<StencilMagicDB>> | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!_dbPromise) {
    _dbPromise = migrateLegacyDatabaseIfNeeded().then(() =>
      openDB<StencilMagicDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("documents")) {
            const s = db.createObjectStore("documents", { keyPath: "id" });
            s.createIndex("by-name", "name");
            s.createIndex("by-tags", "tags", { multiEntry: true });
            s.createIndex("by-createdAt", "createdAt");
            s.createIndex("by-lastEdited", "lastEdited");
            s.createIndex("by-folder", "folderId");
          }
          if (!db.objectStoreNames.contains("folders")) {
            const f = db.createObjectStore("folders", { keyPath: "id" });
            f.createIndex("by-parent", "parentId");
          }
        },
      }),
    );
  }
  return _dbPromise;
}

/* --- Thumbnails --- */

export async function makeThumbnail(dataUrl: string, max = 384): Promise<string> {
  if (typeof window === "undefined") return dataUrl;
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const r = img.width / img.height || 1;
      const w = r > 1 ? max : Math.round(max * r);
      const h = r > 1 ? Math.round(max / r) : max;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

/** Prefer the latest stencil layer, then originalAIImage, then thumbnail. */
export function bestExportUrl(doc: DocumentData): string {
  if (doc.layeredEditorData) {
    try {
      const es = JSON.parse(doc.layeredEditorData) as EditorState;
      const stencil = es.layers?.find((l) => l.name === "Stencil" || l.id === "stencil");
      if (stencil?.dataUrl) return stencil.dataUrl;
    } catch {
      /* ignore parse errors */
    }
  }
  return doc.originalAIImage ?? doc.thumbnail;
}

/* --- Document CRUD --- */

export async function createDocument(
  input: Partial<DocumentData> & { thumbnail: string },
): Promise<DocumentData> {
  const now = Date.now();
  const doc: DocumentData = {
    id: input.id ?? uuidv4(),
    name: input.name ?? "Untitled Stencil",
    tags: input.tags ?? [],
    folderId: input.folderId ?? null,
    thumbnail: input.thumbnail,
    originalAIImage: input.originalAIImage ?? null,
    layeredEditorData: input.layeredEditorData ?? null,
    clientNotes: input.clientNotes ?? "",
    versionHistory: input.versionHistory ?? [],
    style: input.style ?? "hatching",
    createdAt: input.createdAt ?? now,
    lastEdited: input.lastEdited ?? now,
    schemaVersion: CURRENT_SCHEMA,
  };
  const d = await db();
  if (d) await putDocument(d, doc);
  return doc;
}

export async function saveDocument(
  doc: DocumentData,
  snapshot?: { changes: string; thumbnail?: string; editorState?: string },
): Promise<DocumentData> {
  const d = await db();
  if (!d) return doc;
  const now = Date.now();
  const next: DocumentData = { ...doc, lastEdited: now, schemaVersion: CURRENT_SCHEMA };
  if (snapshot) {
    const hist = [
      ...doc.versionHistory,
      {
        timestamp: now,
        thumbnail: snapshot.thumbnail ?? doc.thumbnail,
        changes: snapshot.changes,
        editorState: snapshot.editorState,
      },
    ];
    // Keep last 40 versions to bound storage.
    next.versionHistory = hist.slice(-40);
  }
  return putDocument(d, next);
}

export async function getDocument(id: string): Promise<DocumentData | undefined> {
  const d = await db();
  if (!d) return undefined;
  return d.get("documents", id);
}

export async function listDocuments(): Promise<DocumentData[]> {
  const d = await db();
  if (!d) return [];
  const all = await d.getAll("documents");
  return all.sort((a, b) => b.lastEdited - a.lastEdited);
}

export async function deleteDocument(id: string): Promise<void> {
  const d = await db();
  if (!d) return;
  await d.delete("documents", id);
}

/* --- Layered editor state helpers (used by VaultProcreateEditor) --- */

export async function getDocumentWithLayers(
  id: string,
): Promise<{ doc: DocumentData; editorState: EditorState | null } | undefined> {
  const doc = await getDocument(id);
  if (!doc) return undefined;
  let editorState: EditorState | null = null;
  if (doc.layeredEditorData) {
    try {
      editorState = JSON.parse(doc.layeredEditorData) as EditorState;
    } catch (err) {
      console.warn("[vault] layeredEditorData parse failed", err);
      editorState = null;
    }
  }
  return { doc, editorState };
}

export async function saveEditorState(
  id: string,
  editorState: EditorState,
  thumbnail?: string,
  animationData?: string,
): Promise<void> {
  const d = await db();
  if (!d) return;
  const cur = await d.get("documents", id);
  if (!cur) return;
  await putDocument(d, {
    ...cur,
    layeredEditorData: JSON.stringify(editorState),
    animationData: animationData ?? cur.animationData,
    thumbnail: thumbnail ?? cur.thumbnail,
    // Keep flatten in sync with the active stencil layer so library export is current.
    originalAIImage:
      editorState.layers.find((l) => l.name === "Stencil" || l.id === "stencil")?.dataUrl ??
      cur.originalAIImage,
    lastEdited: Date.now(),
    schemaVersion: CURRENT_SCHEMA,
  });
}

/** Single path: write both flatten PNG + layered editor state + thumbnail. */
export async function persistStudioEdit(
  doc: DocumentData,
  opts: {
    flattenPng: string;
    thumbnail: string;
    editorState: EditorState;
    snapshotChanges?: string;
  },
): Promise<DocumentData> {
  const next: DocumentData = {
    ...doc,
    originalAIImage: opts.flattenPng,
    thumbnail: opts.thumbnail,
    layeredEditorData: JSON.stringify(opts.editorState),
    lastEdited: Date.now(),
    schemaVersion: CURRENT_SCHEMA,
  };
  return saveDocument(
    next,
    opts.snapshotChanges
      ? {
          changes: opts.snapshotChanges,
          thumbnail: opts.thumbnail,
          editorState: opts.editorState ? JSON.stringify(opts.editorState) : undefined,
        }
      : undefined,
  );
}

/* --- Folder CRUD --- */

export async function createFolder(name: string, parentId: string | null = null): Promise<Folder> {
  const f: Folder = { id: uuidv4(), name, parentId, createdAt: Date.now() };
  const d = await db();
  if (d) await d.put("folders", f);
  return f;
}

export async function listFolders(): Promise<Folder[]> {
  const d = await db();
  if (!d) return [];
  return d.getAll("folders");
}

export async function deleteFolder(id: string): Promise<void> {
  const d = await db();
  if (!d) return;
  // Re-parent contents to root.
  const docs = await d.getAllFromIndex("documents", "by-folder", id);
  const folders = await d.getAllFromIndex("folders", "by-parent", id);
  const tx = d.transaction(["documents", "folders"], "readwrite");
  for (const doc of docs) await tx.objectStore("documents").put({ ...doc, folderId: null });
  for (const f of folders) await tx.objectStore("folders").put({ ...f, parentId: null });
  await tx.objectStore("folders").delete(id);
  await tx.done;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const d = await db();
  if (!d) return;
  const f = await d.get("folders", id);
  if (!f) return;
  await d.put("folders", { ...f, name });
}

export async function moveDocumentToFolder(docId: string, folderId: string | null): Promise<void> {
  const d = await db();
  if (!d) return;
  const doc = await d.get("documents", docId);
  if (!doc) return;
  await d.put("documents", { ...doc, folderId, lastEdited: Date.now() });
}

/* --- Backup / Restore --- */

export type BackupBundle = {
  format: "stencilmagic-library-backup";
  schemaVersion: number;
  exportedAt: number;
  documents: DocumentData[];
  folders: Folder[];
};

export async function exportBackup(): Promise<BackupBundle> {
  return {
    format: "stencilmagic-library-backup",
    schemaVersion: CURRENT_SCHEMA,
    exportedAt: Date.now(),
    documents: await listDocuments(),
    folders: await listFolders(),
  };
}

export async function importBackup(
  bundle: BackupBundle,
  opts: { merge?: boolean } = {},
): Promise<{ documents: number; folders: number }> {
  const looksLikeBackup =
    bundle && typeof bundle === "object" && Array.isArray((bundle as any).documents);
  if (!looksLikeBackup) throw new Error("Invalid backup file");
  const d = await db();
  if (!d) return { documents: 0, folders: 0 };
  const tx = d.transaction(["documents", "folders"], "readwrite");
  if (!opts.merge) {
    await tx.objectStore("documents").clear();
    await tx.objectStore("folders").clear();
  }
  for (const f of bundle.folders) await tx.objectStore("folders").put(f);
  for (const doc of bundle.documents) {
    await tx.objectStore("documents").put({ ...doc, schemaVersion: CURRENT_SCHEMA });
  }
  await tx.done;
  return { documents: bundle.documents.length, folders: bundle.folders.length };
}
