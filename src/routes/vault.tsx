import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, Download, Trash2, Inbox, Wand2, Search, LayoutGrid, List as ListIcon,
  Folder as FolderIcon, FolderPlus, ChevronRight, ChevronDown, Upload, Tag, X, Pencil,
} from "lucide-react";
import logo from "@/assets/stencil-logo.png";
import {
  listDocuments, listFolders, deleteDocument, deleteFolder, createFolder,
  moveDocumentToFolder, exportBackup, importBackup, saveDocument, createDocument,
  type DocumentData, type Folder, type BackupBundle,
} from "@/lib/localDB";
import { VaultProcreateEditor } from "@/components/vault/VaultProcreateEditor";

export const Route = createFileRoute("/vault")({
  head: () => ({
    meta: [
      { title: "Storage Vault — PrimalPrint AI" },
      { name: "description", content: "Local document management for every stencil. Folders, tags, search, versions, backup/restore — all stored in your browser." },
    ],
  }),
  component: VaultPage,
});

type SortKey = "newest" | "oldest" | "name";
type ViewMode = "grid" | "list";

function VaultPage() {
  const [docs, setDocs] = useState<DocumentData[] | null>(null);
  const [editing, setEditing] = useState<DocumentData | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortKey>("newest");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [d, f] = await Promise.all([listDocuments(), listFolders()]);
    setDocs(d); setFolders(f);
  }
  useEffect(() => { refresh(); }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    docs?.forEach(d => d.tags.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [docs]);

  const visible = useMemo(() => {
    if (!docs) return [];
    const q = search.trim().toLowerCase();
    let out = docs.filter(d => {
      if (activeFolder !== null && d.folderId !== activeFolder) return false;
      if (activeTags.length && !activeTags.every(t => d.tags.includes(t))) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q) || d.tags.some(t => t.toLowerCase().includes(q));
    });
    if (sort === "newest") out = [...out].sort((a, b) => b.lastEdited - a.lastEdited);
    if (sort === "oldest") out = [...out].sort((a, b) => a.lastEdited - b.lastEdited);
    if (sort === "name") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [docs, search, sort, activeFolder, activeTags]);

  const folderTree = useMemo(() => {
    const byParent = new Map<string | null, Folder[]>();
    folders.forEach(f => {
      const arr = byParent.get(f.parentId) ?? [];
      arr.push(f); byParent.set(f.parentId, arr);
    });
    return byParent;
  }, [folders]);

  function toggleTag(t: string) {
    setActiveTags(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);
  }

  async function onNewFolder() {
    const name = prompt("Folder name");
    if (!name) return;
    await createFolder(name.trim(), activeFolder);
    refresh();
  }

  async function onDeleteFolder(id: string) {
    if (!confirm("Delete folder? Documents inside move to root.")) return;
    await deleteFolder(id);
    if (activeFolder === id) setActiveFolder(null);
    refresh();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this document permanently?")) return;
    await deleteDocument(id);
    refresh();
  }

  function download(d: DocumentData) {
    const a = document.createElement("a");
    a.href = d.originalAIImage ?? d.thumbnail;
    a.download = `${d.name.replace(/\s+/g, "-")}.png`;
    a.click();
  }

  function openInStudio(d: DocumentData) {
    setEditing(d);
  }

  async function onDropDoc(docId: string, folderId: string | null) {
    await moveDocumentToFolder(docId, folderId);
    refresh();
  }

  async function onExport() {
    const bundle = await exportBackup();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `primalprint-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const bundle = JSON.parse(await f.text()) as BackupBundle;
      const merge = confirm("OK = merge into existing vault.\nCancel = replace everything.");
      const res = await importBackup(bundle, { merge });
      alert(`Imported ${res.documents} documents and ${res.folders} folders.`);
      refresh();
    } catch (err) {
      alert("Could not import: " + (err as Error).message);
    }
    e.target.value = "";
  }

  async function onRename(d: DocumentData) {
    const name = prompt("Rename document", d.name);
    if (!name) return;
    await saveDocument({ ...d, name: name.trim() });
    refresh();
  }

  async function onEditTags(d: DocumentData) {
    const raw = prompt("Tags (comma separated)", d.tags.join(", "));
    if (raw === null) return;
    const tags = raw.split(",").map(t => t.trim()).filter(Boolean);
    await saveDocument({ ...d, tags });
    refresh();
  }

  /** Create a blank document and open the editor in free-draw mode. */
  async function onNewPractice() {
    const W = 1024, H = 1024;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const blank = c.toDataURL("image/png");
    const doc = await createDocument({
      name: `Practice Sketch ${new Date().toLocaleDateString()}`,
      tags: ["practice"],
      thumbnail: blank,
      originalAIImage: blank,
      style: "freehand",
      folderId: activeFolder,
    });
    setEditing(doc);
    refresh();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 text-sm shrink-0">
            <ChevronLeft size={18} /> <span className="hidden sm:inline">Home</span>
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-script text-lg sm:text-xl">PrimalPrint AI</span>
          </Link>
          <Link to="/create" className="text-xs text-primary font-semibold shrink-0">+ New</Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 sm:px-4 py-5">
        <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">Storage Vault</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Local document management. Folders, tags, search, version history & backups. Nothing leaves this device.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onNewPractice} className="rounded-full bg-gradient-to-r from-[#00F5D4] to-[#00B8A9] text-black px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-[#00F5D4]/20 hover:brightness-110">
              <Pencil size={14} /> Free Draw
            </button>
            <button onClick={onExport} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 hover:border-primary">
              <Download size={14} /> Export
            </button>
            <button onClick={() => fileInput.current?.click()} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 hover:border-primary">
              <Upload size={14} /> Import
            </button>
            <input ref={fileInput} type="file" accept="application/json" onChange={onImport} className="hidden" />
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-2xl border border-border bg-card p-3 mb-4 flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or tag…"
              className="w-full bg-background border border-border rounded-full pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="bg-background border border-border rounded-full px-3 py-2 text-xs">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">A → Z</option>
          </select>
          <div className="flex border border-border rounded-full overflow-hidden">
            <button onClick={() => setView("grid")} className={`px-3 py-2 ${view === "grid" ? "bg-primary text-primary-foreground" : ""}`} aria-label="Grid view"><LayoutGrid size={14} /></button>
            <button onClick={() => setView("list")} className={`px-3 py-2 ${view === "list" ? "bg-primary text-primary-foreground" : ""}`} aria-label="List view"><ListIcon size={14} /></button>
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-4">
            {allTags.map(t => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`text-[11px] rounded-full px-2.5 py-1 border ${activeTags.includes(t) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"}`}
              >
                <Tag size={10} className="inline mr-1" />{t}
              </button>
            ))}
            {activeTags.length > 0 && (
              <button onClick={() => setActiveTags([])} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"><X size={10} /> clear</button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
          {/* Folder sidebar */}
          <aside className="rounded-2xl border border-border bg-card p-2 text-sm h-fit">
            <div className="flex items-center justify-between p-2">
              <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Folders</span>
              <button onClick={onNewFolder} className="p-1 rounded hover:bg-muted" aria-label="New folder"><FolderPlus size={14} /></button>
            </div>
            <button
              onClick={() => setActiveFolder(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onDropDoc(id, null); }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left ${activeFolder === null ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              <Inbox size={14} /> All documents
              <span className="ml-auto text-[10px] text-muted-foreground">{docs?.length ?? 0}</span>
            </button>
            <FolderBranch
              parentId={null}
              tree={folderTree}
              docs={docs ?? []}
              activeFolder={activeFolder}
              expanded={expanded}
              setExpanded={setExpanded}
              setActiveFolder={setActiveFolder}
              onDropDoc={onDropDoc}
              onDelete={onDeleteFolder}
              depth={0}
            />
          </aside>

          {/* Document area */}
          <section>
            {docs === null ? (
              <div className="text-sm text-muted-foreground p-8">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
                <Inbox className="mx-auto text-muted-foreground" size={32} />
                <div className="mt-3 font-bold">{search || activeTags.length ? "No matches" : "No stencils yet"}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || activeTags.length ? "Try a different search or clear filters." : "Generate one and it lands here automatically."}
                </p>
                <Link to="/create" className="inline-block mt-4 rounded-full bg-gradient-primary text-primary-foreground px-5 py-2 text-sm font-semibold shadow-glow">Create Stencil</Link>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {visible.map(d => (
                  <DocCard key={d.id} doc={d} onOpen={() => openInStudio(d)} onDownload={() => download(d)} onDelete={() => onDelete(d.id)} onRename={() => onRename(d)} onTags={() => onEditTags(d)} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
                {visible.map(d => (
                  <DocRow key={d.id} doc={d} onOpen={() => openInStudio(d)} onDownload={() => download(d)} onDelete={() => onDelete(d.id)} onRename={() => onRename(d)} onTags={() => onEditTags(d)} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
      {editing && (
        <VaultProcreateEditor
          doc={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function FolderBranch(props: {
  parentId: string | null;
  tree: Map<string | null, Folder[]>;
  docs: DocumentData[];
  activeFolder: string | null;
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  setActiveFolder: (id: string | null) => void;
  onDropDoc: (docId: string, folderId: string | null) => void;
  onDelete: (id: string) => void;
  depth: number;
}) {
  const kids = props.tree.get(props.parentId) ?? [];
  if (!kids.length) return null;
  return (
    <div>
      {kids.map(f => {
        const hasChildren = (props.tree.get(f.id) ?? []).length > 0;
        const open = props.expanded.has(f.id);
        const count = props.docs.filter(d => d.folderId === f.id).length;
        return (
          <div key={f.id}>
            <div
              className={`group flex items-center gap-1 px-2 py-1.5 rounded ${props.activeFolder === f.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
              style={{ paddingLeft: 8 + props.depth * 12 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) props.onDropDoc(id, f.id); }}
            >
              <button
                onClick={() => {
                  const n = new Set(props.expanded);
                  open ? n.delete(f.id) : n.add(f.id);
                  props.setExpanded(n);
                }}
                className="p-0.5"
                aria-label={open ? "Collapse" : "Expand"}
              >
                {hasChildren ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="inline-block w-3" />}
              </button>
              <button onClick={() => props.setActiveFolder(f.id)} className="flex-1 flex items-center gap-1.5 text-left text-sm truncate">
                <FolderIcon size={14} /> <span className="truncate">{f.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
              </button>
              <button onClick={() => props.onDelete(f.id)} className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive" aria-label="Delete folder"><Trash2 size={11} /></button>
            </div>
            {open && hasChildren && (
              <FolderBranch {...props} parentId={f.id} depth={props.depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

type CardProps = {
  doc: DocumentData;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRename: () => void;
  onTags: () => void;
};

function DocCard({ doc, onOpen, onDownload, onDelete, onRename, onTags }: CardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", doc.id)}
      className="rounded-2xl border border-border bg-card overflow-hidden group hover:border-primary transition flex flex-col"
    >
      <button onClick={onOpen} className="block w-full aspect-square bg-white overflow-hidden relative" aria-label="Open in studio">
        <img src={doc.thumbnail} alt={`${doc.name} thumbnail`} loading="lazy" className="w-full h-full object-contain" />
        <span className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 text-white text-xs font-bold">
          <Wand2 size={14} /> Edit in Studio
        </span>
      </button>
      <div className="p-2.5 text-xs flex-1 flex flex-col">
        <button onClick={onRename} className="font-semibold truncate text-left hover:text-primary">{doc.name}</button>
        <div className="text-[10px] text-muted-foreground">{new Date(doc.lastEdited).toLocaleDateString()}</div>
        {doc.tags.length > 0 && (
          <button onClick={onTags} className="flex flex-wrap gap-1 mt-1 text-left">
            {doc.tags.slice(0, 3).map(t => <span key={t} className="bg-muted rounded px-1.5 py-0.5 text-[9px]">{t}</span>)}
          </button>
        )}
        <div className="flex gap-1 mt-2">
          <button onClick={onOpen} className="flex-1 rounded-lg bg-gradient-primary text-primary-foreground py-1 font-semibold flex items-center justify-center gap-1"><Wand2 size={10} /> Edit</button>
          <button onClick={onDownload} className="rounded-lg border border-border px-2 py-1 hover:border-primary"><Download size={10} /></button>
          <button onClick={onDelete} className="rounded-lg border border-destructive/40 text-destructive px-2 py-1 hover:bg-destructive/10"><Trash2 size={10} /></button>
        </div>
      </div>
    </div>
  );
}

function DocRow({ doc, onOpen, onDownload, onDelete, onRename, onTags }: CardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", doc.id)}
      className="flex items-center gap-3 p-2.5 hover:bg-muted/50"
    >
      <button onClick={onOpen} className="shrink-0 h-14 w-14 rounded-lg overflow-hidden bg-white">
        <img src={doc.thumbnail} alt="" className="w-full h-full object-contain" />
      </button>
      <div className="flex-1 min-w-0">
        <button onClick={onRename} className="font-semibold text-sm truncate block text-left hover:text-primary">{doc.name}</button>
        <div className="text-[11px] text-muted-foreground">
          {new Date(doc.lastEdited).toLocaleString()} · v{doc.versionHistory.length + 1}
        </div>
        {doc.tags.length > 0 && (
          <button onClick={onTags} className="flex flex-wrap gap-1 mt-0.5">
            {doc.tags.map(t => <span key={t} className="bg-muted rounded px-1.5 py-0.5 text-[9px]">{t}</span>)}
          </button>
        )}
      </div>
      <button onClick={onOpen} className="rounded-lg bg-gradient-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold flex items-center gap-1"><Wand2 size={11} /> Edit</button>
      <button onClick={onDownload} className="rounded-lg border border-border p-1.5 hover:border-primary"><Download size={12} /></button>
      <button onClick={onDelete} className="rounded-lg border border-destructive/40 text-destructive p-1.5 hover:bg-destructive/10"><Trash2 size={12} /></button>
    </div>
  );
}