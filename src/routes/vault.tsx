import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Download, Trash2, Inbox, Wand2 } from "lucide-react";
import logo from "@/assets/stencil-logo.png";
import { listStencils, deleteStencil, type VaultEntry } from "@/lib/vault";

export const Route = createFileRoute("/vault")({
  head: () => ({
    meta: [
      { title: "Saved Generations — PrimalPrint AI" },
      { name: "description", content: "Every stencil you generate is auto-saved here, stored locally in your browser." },
    ],
  }),
  component: VaultPage,
});

function VaultPage() {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const navigate = useNavigate();

  async function refresh() {
    const e = await listStencils();
    setEntries(e);
  }
  useEffect(() => { refresh(); }, []);

  async function onDelete(id: string) {
    await deleteStencil(id);
    refresh();
  }

  function download(e: VaultEntry) {
    const a = document.createElement("a");
    a.href = e.stencil;
    a.download = `stencil-${e.id}.png`;
    a.click();
  }

  function openInEditor(e: VaultEntry) {
    try {
      sessionStorage.setItem("primalprint.editor.load", JSON.stringify({
        stencil: e.stencil,
        photo: e.photo,
        style: e.style,
      }));
    } catch { /* quota */ }
    navigate({ to: "/create" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm">
            <ChevronLeft size={18} /> Home
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-script text-xl">PrimalPrint AI</span>
          </Link>
          <Link to="/create" className="text-xs text-primary font-semibold">+ New</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold">Saved Generations / Storage Vault</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every stencil is auto-saved here. Stored locally in your browser (IndexedDB). Survives reboots; never leaves this device.
          </p>
        </div>
        {entries === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
            <Inbox className="mx-auto text-muted-foreground" size={32} />
            <div className="mt-3 font-bold">No stencils yet</div>
            <p className="text-sm text-muted-foreground mt-1">Generate your first stencil and it will appear here automatically.</p>
            <Link to="/create" className="inline-block mt-4 rounded-full bg-gradient-primary text-primary-foreground px-5 py-2 text-sm font-semibold shadow-glow">Create Stencil</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {entries.map((e) => (
              <div key={e.id} className="rounded-2xl border border-border bg-card overflow-hidden group hover:border-primary transition">
                <button
                  onClick={() => openInEditor(e)}
                  className="block w-full aspect-square bg-white overflow-hidden relative"
                  aria-label="Open in editor"
                >
                  <img src={e.thumb} alt="Stencil thumbnail" className="w-full h-full object-contain" />
                  <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                    <Wand2 size={14} /> Open in editor
                  </span>
                </button>
                <div className="p-2.5 text-xs">
                  <div className="font-semibold capitalize">{e.style}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => openInEditor(e)} className="flex-1 rounded-lg bg-gradient-primary text-primary-foreground py-1 font-semibold flex items-center justify-center gap-1"><Wand2 size={10} /> Edit</button>
                    <button onClick={() => download(e)} className="rounded-lg border border-border px-2 py-1 hover:border-primary flex items-center justify-center gap-1"><Download size={10} /></button>
                    <button onClick={() => onDelete(e.id)} className="rounded-lg border border-destructive/40 text-destructive px-2 py-1 hover:bg-destructive/10"><Trash2 size={10} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}