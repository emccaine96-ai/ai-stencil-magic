import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Play, Trash2, Code2, ShieldCheck, ShieldAlert, ShieldX, KeyRound } from "lucide-react";
import {
  loadPlugins,
  saveUserPlugins,
  runPlugin,
  isBuiltinPlugin,
  BUILTIN_PLUGINS,
  type Plugin,
} from "@/lib/plugins";
import {
  verifyPlugin,
  trustPublisherKey,
  saveTrustedKeyToStorage,
  type PluginVerificationResult,
  type VerificationStatus,
} from "@/lib/plugin-signing";

export const Route = createFileRoute("/plugins")({
  head: () => ({
    meta: [
      { title: "Plugins — AI Stencil Magic" },
      {
        name: "description",
        content: "Write and run ECDSA-verified, sandboxed Web Worker JavaScript filters and generators inside the Studio.",
      },
    ],
  }),
  component: PluginsPage,
});

function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [statuses, setStatuses] = useState<Record<string, PluginVerificationResult>>({});
  const [editing, setEditing] = useState<Plugin | null>(null);
  const [editingStatus, setEditingStatus] = useState<PluginVerificationResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTrustModal, setShowTrustModal] = useState(false);
  const [pubKeyId, setPubKeyId] = useState("");
  const [pubKeyJwk, setPubKeyJwk] = useState("");
  const [trustMsg, setTrustMsg] = useState<string | null>(null);

  const refreshStatuses = async (list: Plugin[]) => {
    const next: Record<string, PluginVerificationResult> = {};
    for (const p of list) {
      next[p.id] = isBuiltinPlugin(p)
        ? { valid: true, status: "verified" }
        : await verifyPlugin(p);
    }
    setStatuses(next);
  };

  useEffect(() => {
    const loaded = loadPlugins();
    setPlugins(loaded);
    refreshStatuses(loaded);
  }, []);

  useEffect(() => {
    if (editing) {
      if (isBuiltinPlugin(editing)) {
        setEditingStatus({ valid: true, status: "verified" });
      } else {
        verifyPlugin(editing).then(setEditingStatus);
      }
    } else {
      setEditingStatus(null);
    }
  }, [editing]);

  function persist(next: Plugin[]) {
    setPlugins(next);
    saveUserPlugins(next);
    refreshStatuses(next);
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

  async function handleAddTrustedKey() {
    setTrustMsg(null);
    try {
      if (!pubKeyId.trim()) throw new Error("Publisher ID required");
      await trustPublisherKey(pubKeyId.trim(), pubKeyJwk.trim());
      saveTrustedKeyToStorage(pubKeyId.trim(), pubKeyJwk.trim());
      setTrustMsg(`Publisher '${pubKeyId.trim()}' added to trusted keys successfully!`);
      setShowTrustModal(false);
      setPubKeyId("");
      setPubKeyJwk("");
      refreshStatuses(plugins);
    } catch (e: any) {
      setTrustMsg(`Key import failed: ${e.message || String(e)}`);
    }
  }

  async function tryRun() {
    if (!editing) return;
    setError(null);

    const isBuiltin = isBuiltinPlugin(editing);
    if (!isBuiltin) {
      const v = await verifyPlugin(editing);
      if (!v.valid) {
        setError(`Cannot run unverified plugin: ${v.reason || v.status}`);
        return;
      }
    }

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
    () => plugins.filter((p) => isBuiltinPlugin(p)),
    [plugins],
  );
  const user = useMemo(
    () => plugins.filter((p) => !isBuiltinPlugin(p)),
    [plugins],
  );

  function renderStatusBadge(statusRes?: PluginVerificationResult) {
    if (!statusRes) return null;
    const { valid, status, reason } = statusRes;
    if (valid || status === "verified") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Verified built-in or ECDSA signed plugin">
          <ShieldCheck className="w-3 h-3" /> Verified
        </span>
      );
    }
    if (status === "unsigned") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20" title={reason}>
          <ShieldAlert className="w-3 h-3" /> Unsigned
        </span>
      );
    }
    if (status === "untrusted_publisher") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20" title={reason}>
          <ShieldAlert className="w-3 h-3" /> Untrusted Publisher
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20" title={reason}>
        <ShieldX className="w-3 h-3" /> {status.replace("_", " ")}
      </span>
    );
  }

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
          <h1 className="text-base font-semibold tracking-tight">Plugin SDK (ECDSA Verified)</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTrustModal(true)}
              className="inline-flex items-center gap-1.5 text-xs bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md border border-border"
            >
              <KeyRound className="w-3.5 h-3.5" /> Trust Key
            </button>
            <button
              onClick={startNew}
              className="inline-flex items-center gap-1.5 text-sm bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> New
            </button>
          </div>
        </div>
      </header>

      {trustMsg && (
        <div className="max-w-6xl mx-auto px-4 mt-3">
          <div className="p-2.5 bg-card border border-border rounded text-xs text-foreground flex justify-between">
            <span>{trustMsg}</span>
            <button onClick={() => setTrustMsg(null)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
        </div>
      )}

      {showTrustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-card border border-border rounded-xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" /> Add Trusted Publisher Key
            </h3>
            <p className="text-xs text-muted-foreground">
              Import an ECDSA P-256 public key (JWK JSON or SPKI Base64) to verify third-party plugins.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase text-muted-foreground mb-1">Publisher Key ID</label>
                <input
                  value={pubKeyId}
                  onChange={(e) => setPubKeyId(e.target.value)}
                  placeholder="e.g. acme-publisher"
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-muted-foreground mb-1">Public Key (JWK or SPKI Base64)</label>
                <textarea
                  value={pubKeyJwk}
                  onChange={(e) => setPubKeyJwk(e.target.value)}
                  placeholder='{"kty":"EC","crv":"P-256","x":"...","y":"..."}'
                  rows={4}
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-[11px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTrustModal(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTrustedKey}
                className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded font-medium"
              >
                Trust Publisher
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Built-in (Bundled)
          </h2>
          <ul className="space-y-2">
            {builtins.map((p) => (
              <li
                key={p.id}
                className="border border-border rounded-lg p-3 flex items-start justify-between bg-card/40"
              >
                <div>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {p.name} <span className="text-xs text-muted-foreground">v{p.version}</span>
                    {renderStatusBadge({ valid: true, status: "verified" })}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
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
            Installed / User Plugins
          </h2>
          {user.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet. Click <strong>New</strong> to write one or import a signed plugin.
            </p>
          ) : (
            <ul className="space-y-2">
              {user.map((p) => {
                const st = statuses[p.id];
                return (
                  <li
                    key={p.id}
                    className="border border-border rounded-lg p-3 flex items-start justify-between hover:bg-card/60 transition"
                  >
                    <button className="text-left flex-1 mr-2" onClick={() => setEditing(p)}>
                      <div className="text-sm font-semibold flex items-center gap-2">
                        {p.name}
                        {renderStatusBadge(st)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{p.description || "—"}</div>
                    </button>
                    <button onClick={() => remove(p.id)} className="text-destructive p-1 hover:bg-destructive/10 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
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
                  className="flex-1 bg-transparent border-b border-border focus:outline-none focus:border-foreground text-sm py-1 font-semibold"
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

              <div className="flex items-center justify-between text-xs py-1 border-y border-border/50">
                <span className="text-muted-foreground">Signature Status:</span>
                {renderStatusBadge(editingStatus || undefined)}
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
                <strong>ctx</strong> = {"{ width, height, data: Uint8ClampedArray, params }"}. Runs inside an isolated Web Worker (Blob URL) with no DOM or localStorage access. 10s execution timeout.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={tryRun}
                  disabled={!isBuiltinPlugin(editing) && !!editingStatus && !editingStatus.valid}
                  className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md ${
                    !isBuiltinPlugin(editing) && editingStatus && !editingStatus.valid
                      ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                  title={!isBuiltinPlugin(editing) && editingStatus && !editingStatus.valid ? `Cannot run unverified plugin: ${editingStatus.reason}` : "Run plugin in Web Worker"}
                >
                  <Play className="w-4 h-4" /> Test
                </button>
                <button
                  onClick={save}
                  className="text-sm bg-foreground text-background px-3 py-1.5 rounded-md hover:opacity-90"
                >
                  Save
                </button>
                <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
              {error && <p className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">{error}</p>}
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
