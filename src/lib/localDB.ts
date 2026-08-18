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

let _dbPromise: Promise<IDBPDatabase<StencilMagicDB>> | null = null;
function db(): Promise<IDBPDatabase<StencilMagicDB>> | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  if (!_dbPromise) {
    _dbPromise = openDB<StencilMagicDB>(DB_NAME, DB_VERSION, {
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
    });
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
  if (d) await d.put("documents", doc);
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
  await d.put("documents", next);
  return next;
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
  await d.put("documents", {
    ...cur,
    layeredEditorData: JSON.stringify(editorState),
    animationData: animationData ?? cur.animationData,
    thumbnail: thumbnail ?? cur.thumbnail,
    lastEdited: Date.now(),
    schemaVersion: CURRENT_SCHEMA,
  });
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
  if (bundle.format !== "stencilmagic-library-backup") throw new Error("Invalid backup file");
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
