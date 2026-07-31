import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Play, Trash2, Code2 } from "lucide-react";
import {
  loadPlugins,
  saveUserPlugins,
  runPlugin,
  BUILTIN_PLUGINS,
  type Plugin,
} from "@/lib/plugins";

export const Route = createFileRoute("/plugins")({
  head: () => ({
    meta: [
      { title: "Plugins — PrimalCanvas" },
      {
        name: "description",
        content: "Write and run sandboxed JavaScript filters and generators inside the Studio.",
      },
    ],
  }),
  component: PluginsPage,
});

function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [editing, setEditing] = useState<Plugin | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlugins(loadPlugins());
  }, []);

  function persist(next: Plugin[]) {
    setPlugins(next);
    saveUserPlugins(next);
  }

  function startNew() {
    setEditing({
      id: "user." + Math.random().toString(36).slice(2, 8),
      name: "My Filter",
      version: "0.1",
      kind: "filter",
      description: "",
      code: "// ctx = { width, height, data: Uint8ClampedArray, params }\nfor (var i = 0; i < ctx.data.length; i += 4) {\n  ctx.data[i+3] = 255 - ctx.data[i+3];\n}\n",
      params: [],
    });
  }

  function save() {
    if (!editing) return;
    const next = plugins.some((p) => p.id === editing.id)
      ? plugins.map((p) => (p.id === editing.id ? editing : p))
      : [...plugins, editing];
    persist(next);
    setEditing(null);
  }

  function remove(id: string) {
    persist(plugins.filter((p) => p.id !== id));
  }

  async function tryRun() {
    if (!editing) return;
    setError(null);
    try {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const cx = c.getContext("2d")!;
      const grad = cx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, "#222");
      grad.addColorStop(1, "#ddd");
      cx.fillStyle = grad;
      cx.fillRect(0, 0, 256, 256);
      cx.fillStyle = "#e94560";
      cx.beginPath();
      cx.arc(128, 128, 60, 0, Math.PI * 2);
      cx.fill();
      const img = cx.getImageData(0, 0, 256, 256);
      const params: Record<string, any> = {};
      editing.params?.forEach((p) => {
        params[p.key] = p.default;
      });
      const out = await runPlugin(editing, img, params);
      cx.putImageData(out, 0, 0);
      setPreview(c.toDataURL("image/png"));
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }

  const builtins = useMemo(
    () => plugins.filter((p) => BUILTIN_PLUGINS.some((b) => b.id === p.id)),
    [plugins],
  );
  const user = useMemo(
    () => plugins.filter((p) => !BUILTIN_PLUGINS.some((b) => b.id === p.id)),
    [plugins],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" /> Home
          </Link>
          <h1 className="text-base font-semibold tracking-tight">Plugin SDK</h1>
          <button
            onClick={startNew}
            className="inline-flex items-center gap-1.5 text-sm bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Built-in
          </h2>
          <ul className="space-y-2">
            {builtins.map((p) => (
              <li
                key={p.id}
                className="border border-border rounded-lg p-3 flex items-start justify-between"
              >
                <div>
                  <div className="text-sm font-semibold">
                    {p.name} <span className="text-xs text-muted-foreground">v{p.version}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                  <div className="text-[10px] uppercase mt-1 text-muted-foreground">{p.kind}</div>
                </div>
                <button
                  onClick={() =>
                    setEditing({
                      ...p,
                      id: "user." + Math.random().toString(36).slice(2, 8),
                      name: p.name + " (copy)",
                    })
                  }
                  className="text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Fork
                </button>
              </li>
            ))}
          </ul>

          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-8 mb-3">
            Your plugins
          </h2>
          {user.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet. Click <strong>New</strong> to write one.
            </p>
          ) : (
            <ul className="space-y-2">
              {user.map((p) => (
                <li
                  key={p.id}
                  className="border border-border rounded-lg p-3 flex items-start justify-between"
                >
                  <button className="text-left" onClick={() => setEditing(p)}>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.description || "—"}</div>
                  </button>
                  <button onClick={() => remove(p.id)} className="text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          {editing ? (
            <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-muted-foreground" />
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="flex-1 bg-transparent border-b border-border focus:outline-none focus:border-foreground text-sm py-1"
                />
                <select
                  value={editing.kind}
                  onChange={(e) => setEditing({ ...editing, kind: e.target.value as any })}
                  className="bg-background border border-border rounded px-2 py-1 text-xs"
                >
                  <option value="filter">filter</option>
                  <option value="generator">generator</option>
                </select>
              </div>
              <textarea
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Short description"
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs resize-none"
                rows={2}
              />
              <textarea
                value={editing.code}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                className="w-full bg-black/60 text-emerald-200 font-mono text-xs p-3 rounded border border-border resize-y"
                rows={14}
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                <strong>ctx</strong> = {"{ width, height, data: Uint8ClampedArray, params }"}. Runs
                in a sandboxed iframe with no network or DOM access. 5s timeout.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={tryRun}
                  className="inline-flex items-center gap-1.5 text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md"
                >
                  <Play className="w-4 h-4" /> Test
                </button>
                <button
                  onClick={save}
                  className="text-sm bg-foreground text-background px-3 py-1.5 rounded-md"
                >
                  Save
                </button>
                <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground">
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {preview && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Preview
                  </p>
                  <img src={preview} alt="" className="rounded border border-border max-w-full" />
                </div>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
              Select a plugin to edit, fork a built-in, or create a new one.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
