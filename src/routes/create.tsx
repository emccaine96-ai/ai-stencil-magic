import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Upload, Loader2, Download, ChevronsLeftRight, Settings, KeyRound, Sparkles, Wand2, Map as MapIcon, Archive, Zap } from "lucide-react";
import logo from "@/assets/stencil-logo.png";
import { composeStencil, DEFAULT_KNOBS, type Knobs } from "@/lib/edit-pipeline";
import { buildTonalMap } from "@/lib/tonal-map";
import { applyShadingFilter, type ShadingKind } from "@/lib/shading-filters";
import { saveStencil } from "@/lib/vault";
import { MasterSuite } from "@/components/master-suite/MasterSuite";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create Stencil — PrimalPrint AI" },
      { name: "description", content: "Upload a photo and generate a professional tattoo stencil with 5-tier tonal layering." },
    ],
  }),
  component: CreatePage,
});

type Style = "hatching" | "solid" | "dotwork" | "hybrid";
const STYLES: { id: Style; label: string; sub: string }[] = [
  { id: "hatching", label: "Hatching", sub: "Crosshatch shading" },
  { id: "solid", label: "Solid", sub: "Clean outlines only" },
  { id: "dotwork", label: "Dotwork", sub: "Stippling shading" },
  { id: "hybrid", label: "Hybrid", sub: "Hatch + dots + lines" },
];

const KEY_STORAGE = "primalprint.gemini.key";
const PROVIDER_STORAGE = "primalprint.provider"; // 'lovable' | 'gemini'
type Provider = "lovable" | "gemini";
const STYLE_PROMPTS: Record<Style, string> = {
  hatching:
    "Pure pen-and-ink crosshatching. Deep shadows use 3 overlaid hatch directions; dark mids 2 directions; mids single-direction parallel hatching; lights very sparse parallel strokes; highlights pure white.",
  solid:
    "Clean bold solid line work, no shading fills. Use varying line weights only. Closed clean contours. Highlights pure white.",
  dotwork:
    "Stippling / dotwork only. Shadows = very dense small dots; dark mids = medium density; mids = sparse; lights = very few; highlights = pure white.",
  hybrid:
    "Combine bold solid contour lines with crosshatching in dark areas and stippling in mid-to-light areas.",
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function dataUrlToInline(dataUrl: string): { mimeType: string; data: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid image data");
  return { mimeType: m[1], data: m[2] };
}

function CreatePage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>("hatching");
  const [intensity, setIntensity] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stencil, setStencil] = useState<string | null>(null);
  const [pos, setPos] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);

  // API key
  const [apiKey, setApiKey] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [provider, setProvider] = useState<Provider>("lovable");
  const [exportSize, setExportSize] = useState<1024 | 2048 | 4096 | 7680>(2048);
  const [exporting, setExporting] = useState(false);

  // Post-generation edit knobs (client-side only, no re-generation)
  const [editOpen, setEditOpen] = useState(false);
  const [knobs, setKnobs] = useState<Knobs>(DEFAULT_KNOBS);
  const [portraitMap, setPortraitMap] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  // Pre-generation shading filter applied as a post-pass on the returned stencil.
  const [preFilter, setPreFilter] = useState<ShadingKind>("none");
  const [filteredStencil, setFilteredStencil] = useState<string | null>(null);

  useEffect(() => {
    const k = typeof window !== "undefined" ? localStorage.getItem(KEY_STORAGE) : null;
    if (k) setApiKey(k);
    const p = typeof window !== "undefined" ? (localStorage.getItem(PROVIDER_STORAGE) as Provider | null) : null;
    if (p === "lovable" || p === "gemini") setProvider(p);
    // Hand-off from Vault: open a saved entry directly in the editor.
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem("primalprint.editor.load") : null;
      if (raw) {
        sessionStorage.removeItem("primalprint.editor.load");
        const parsed = JSON.parse(raw) as { stencil?: string; photo?: string | null; style?: Style };
        if (parsed.photo) setPhoto(parsed.photo);
        if (parsed.style) setStyle(parsed.style);
        if (parsed.stencil) setStencil(parsed.stencil);
      }
    } catch { /* ignore */ }
  }, []);

  // When the raw stencil OR pre-generation filter changes, recompute the
  // filtered base image once. The 10-knob editor then derives from this.
  useEffect(() => {
    let cancelled = false;
    if (!stencil) { setFilteredStencil(null); return; }
    (async () => {
      try {
        const out = await applyShadingFilter(stencil, preFilter, photo);
        if (!cancelled) setFilteredStencil(out);
      } catch { /* keep previous */ }
    })();
    return () => { cancelled = true; };
  }, [stencil, preFilter, photo]);

  // Real-time 10-knob editor: rerun the canvas pipeline whenever any knob changes.
  useEffect(() => {
    const base = filteredStencil ?? stencil;
    if (!base) { setProcessedUrl(null); return; }
    const signal = { cancelled: false };
    const handle = setTimeout(async () => {
      try {
        const out = await composeStencil(base, knobs, signal);
        if (!signal.cancelled) setProcessedUrl(out);
      } catch { /* slider was bumped again; skip */ }
    }, 60);
    return () => { signal.cancelled = true; clearTimeout(handle); };
  }, [filteredStencil, stencil, knobs]);

  // Tonal map overlay derives from the ORIGINAL photo, not the stencil,
  // so the underlying stencil line work stays untouched.
  useEffect(() => {
    let cancelled = false;
    if (!portraitMap || !photo) { setMapUrl(null); return; }
    (async () => {
      try {
        const m = await buildTonalMap(photo);
        if (!cancelled) setMapUrl(m);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [portraitMap, photo]);

  // Auto-save every new stencil to the local Storage Vault (IndexedDB).
  useEffect(() => {
    if (!stencil) return;
    saveStencil({ stencil, photo, style, meta: { preFilter, intensity, knobs } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stencil]);

  function selectProvider(p: Provider) {
    setProvider(p);
    localStorage.setItem(PROVIDER_STORAGE, p);
    if (p === "gemini" && !apiKey) setKeyOpen(true);
  }

  function saveKey() {
    const k = keyDraft.trim();
    if (!k) return;
    localStorage.setItem(KEY_STORAGE, k);
    setApiKey(k);
    setKeyDraft("");
    setKeyOpen(false);
  }

  function clearKey() {
    localStorage.removeItem(KEY_STORAGE);
    setApiKey("");
    setKeyDraft("");
  }

  async function onPick(file?: File | null) {
    if (!file) return;
    setStencil(null);
    setError(null);
    setPhoto(await fileToDataUrl(file));
  }

  async function generate() {
    if (!photo) return;
    if (provider === "gemini" && !apiKey) {
      setKeyOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    setStencil(null);
    try {
      const { mimeType, data: imgB64 } = dataUrlToInline(photo);
      const prompt = buildPrompt({ style, intensity });
      if (provider === "lovable") {
        const r = await fetch("/api/generate-stencil", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, image: { mimeType, data: imgB64 } }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `Lovable AI error ${r.status}`);
        setStencil(data.dataUrl);
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: imgB64 } }] },
            ],
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error?.message || `Gemini error ${r.status}`);
        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find((p: any) => p?.inlineData?.data);
        if (!imgPart) throw new Error("No image returned by Gemini");
        const outMime = imgPart.inlineData.mimeType || "image/png";
        setStencil(`data:${outMime};base64,${imgPart.inlineData.data}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  async function downloadUpscaled() {
    const source = processedUrl ?? stencil;
    if (!source) return;
    setExporting(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = source;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const size = exportSize;
      const canvas = document.createElement("canvas");
      const ratio = img.width / img.height || 1;
      canvas.width = size;
      canvas.height = Math.round(size / ratio);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/png"));
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `stencil-${size}px.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm">
            <ChevronLeft size={18} /> Back
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-script text-xl">PrimalPrint AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/vault"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Saved Generations / Storage Vault"
            >
              <Archive size={14} />
              <span className="hidden sm:inline">Vault</span>
            </Link>
            <MasterSuite photo={photo} stencilUrl={processedUrl ?? stencil} onReplacePhoto={(d) => { setStencil(null); setPhoto(d); }} />
            <button
              onClick={() => setKeyOpen(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="API key settings"
            >
              <KeyRound size={14} />
              <span className={`hidden sm:inline ${provider === "lovable" ? "text-primary" : apiKey ? "text-primary" : "text-destructive"}`}>
                {provider === "lovable" ? "Lovable AI" : apiKey ? "My key" : "Set key"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">AI provider</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => selectProvider("lovable")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "lovable" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm"><Sparkles size={14} /> Lovable AI</div>
              <div className={`text-[11px] mt-1 ${provider === "lovable" ? "opacity-90" : "text-muted-foreground"}`}>Uses workspace credits. No key required.</div>
            </button>
            <button
              onClick={() => selectProvider("gemini")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "gemini" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm"><KeyRound size={14} /> My Gemini key</div>
              <div className={`text-[11px] mt-1 ${provider === "gemini" ? "opacity-90" : "text-muted-foreground"}`}>Free tier from Google AI Studio.</div>
            </button>
          </div>
        </section>

        <section>
          <h1 className="text-2xl font-extrabold">1. Upload your reference</h1>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 w-full aspect-square sm:aspect-[4/3] rounded-3xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center gap-3 hover:border-primary transition overflow-hidden"
          >
            {photo ? (
              <img src={photo} alt="Uploaded" className="w-full h-full object-contain" />
            ) : (
              <>
                <div className="h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                  <Upload className="text-primary-foreground" />
                </div>
                <div className="text-sm text-muted-foreground">Tap to upload a photo</div>
              </>
            )}
          </button>
          {photo ? (
            <div className="mt-2 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
              <Zap size={11} className="text-primary" />
              <span>Need more detail? Open the <span className="font-semibold text-foreground">Studio Suite → Upscale</span> tab to Lanczos-3 up to 4K.</span>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="text-2xl font-extrabold">2. Choose your style</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                className={`text-left p-4 rounded-2xl border transition ${
                  style === s.id
                    ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="font-bold">{s.label}</div>
                <div className={`text-xs mt-1 ${style === s.id ? "opacity-90" : "text-muted-foreground"}`}>
                  {s.sub}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shading density</span>
              <span className="gradient-text font-bold">{Math.round(intensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity * 100}
              onChange={(e) => setIntensity(Number(e.target.value) / 100)}
              className="w-full mt-2 accent-[oklch(0.64_0.26_303)]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Controls the 5-tier tonal layering: shadows → dark mids → mids → light mids → highlights.
              Higher density = denser hatching/dots in darker tones.
            </p>
          </div>

        </section>

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Pre-generation shading filter</h2>
          <div className="grid grid-cols-4 gap-2">
            {([
              { id: "none", label: "None", sub: "Default ink" },
              { id: "whip", label: "Whip", sub: "Directional flick" },
              { id: "pendulum", label: "Pendulum", sub: "Rocking swing" },
              { id: "stipple", label: "Stipple", sub: "Pure dotwork" },
            ] as const).map((f) => (
              <button
                key={f.id}
                onClick={() => setPreFilter(f.id as ShadingKind)}
                className={`text-left p-2 rounded-xl border transition ${preFilter === f.id ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
              >
                <div className="font-bold text-xs">{f.label}</div>
                <div className={`text-[10px] ${preFilter === f.id ? "opacity-90" : "text-muted-foreground"}`}>{f.sub}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Applied to the generated stencil as a fully client-side pixel-math pass. Stack with the live editor knobs below.</p>
        </section>

        <button
          onClick={generate}
          disabled={!photo || loading}
          className="w-full rounded-full bg-gradient-primary text-primary-foreground py-4 font-bold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} /> Generating stencil…
            </>
          ) : (
            <>Generate Stencil</>
          )}
        </button>

        {error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm">
            {error}
          </div>
        ) : null}

        {stencil ? (
          <section className="space-y-4">
            <h2 className="text-2xl font-extrabold">Your stencil</h2>
            <div className="relative aspect-square bg-white rounded-3xl overflow-hidden border border-border">
              {photo ? (
                <img
                  src={photo}
                  alt="Original"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                />
              ) : null}
              <img
                src={processedUrl ?? stencil}
                alt="Stencil"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
              />
              {portraitMap && mapUrl ? (
                <img
                  src={mapUrl}
                  alt="Tonal map overlay"
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                  style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
                />
              ) : null}
              <input
                type="range"
                min={0}
                max={100}
                value={pos}
                onChange={(e) => setPos(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
              />
              <div className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none" style={{ left: `${pos}%` }} />
              <div
                className="absolute h-10 w-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center pointer-events-none shadow-glow"
                style={{ left: `calc(${pos}% - 20px)`, top: "calc(50% - 20px)" }}
              >
                <ChevronsLeftRight size={18} />
              </div>
            </div>

            <button
              onClick={() => setEditOpen((v) => !v)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-border bg-card hover:border-primary/50 transition text-sm"
            >
              <span className="flex items-center gap-2 font-semibold">
                <Wand2 size={16} /> Edit stencil (live, no re-generate)
              </span>
              <span className="text-muted-foreground">{editOpen ? "Hide" : "Show"}</span>
            </button>

            {editOpen ? (
              <div className="p-4 rounded-2xl border border-border bg-card space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Real-time canvas knobs</div>
                  <button
                    onClick={() => setKnobs(DEFAULT_KNOBS)}
                    className="text-[10px] text-primary hover:underline"
                  >Reset all</button>
                </div>
                {KNOB_DEFS.map((d) => (
                  <Knob
                    key={d.key}
                    label={d.label}
                    value={knobs[d.key]}
                    min={0}
                    max={100}
                    suffix="%"
                    onChange={(v) => setKnobs((k) => ({ ...k, [d.key]: v }))}
                    hint={d.hint}
                  />
                ))}

                <label className="flex items-center justify-between p-3 rounded-xl border border-border cursor-pointer mt-2">
                  <span className="flex items-center gap-2 text-xs font-semibold"><MapIcon size={14} /> 3D Tonal Map Guide</span>
                  <span
                    className={`relative inline-block w-10 h-6 rounded-full transition ${portraitMap ? "bg-gradient-primary" : "bg-muted"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${portraitMap ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                  <input type="checkbox" className="hidden" checked={portraitMap} onChange={(e) => setPortraitMap(e.target.checked)} />
                </label>
                {portraitMap ? (
                  <p className="text-[10px] text-muted-foreground">Dashed contours mark dark/mid/light tonal zone boundaries: <span className="text-[#B91C1C]">dark→mid</span>, <span className="text-[#F97316]">mid transitions</span>, <span className="text-[#FACC15]">light→highlight</span>. Stencil underneath stays untouched.</p>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="text-sm font-semibold">Export resolution</div>
              <div className="grid grid-cols-4 gap-2">
                {([1024, 2048, 4096, 7680] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setExportSize(s)}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${exportSize === s ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
                  >
                    {s === 7680 ? "8K" : s === 4096 ? "4K" : s === 2048 ? "2K" : "1K"}
                    <div className="text-[9px] opacity-70 font-normal">{s}px</div>
                  </button>
                ))}
              </div>
              <button
                onClick={downloadUpscaled}
                disabled={exporting}
                className="w-full rounded-full bg-gradient-primary text-primary-foreground py-3 font-bold shadow-glow disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {exporting ? <><Loader2 className="animate-spin" size={16} /> Preparing…</> : <><Download size={16} /> Download {exportSize === 7680 ? "8K" : exportSize === 4096 ? "4K" : exportSize === 2048 ? "2K" : "1K"} PNG</>}
              </button>
              <p className="text-[10px] text-muted-foreground text-center">Upscaled in your browser via high-quality bicubic interpolation.</p>
            </div>
          </section>
        ) : null}
      </main>

      {keyOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Settings size={18} className="text-primary" />
              <h3 className="font-extrabold text-lg">Gemini API Key</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Your key is stored only in your browser (localStorage) and sent directly to Google. It never touches our servers.
              Get one at{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary underline">
                aistudio.google.com/apikey
              </a>.
            </p>
            <input
              type="password"
              autoFocus
              placeholder={apiKey ? "•••• change key" : "Paste your Gemini API key"}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={saveKey}
                disabled={!keyDraft.trim()}
                className="flex-1 rounded-full bg-gradient-primary text-primary-foreground py-3 font-bold shadow-glow disabled:opacity-50"
              >
                Save
              </button>
              {apiKey ? (
                <button
                  onClick={clearKey}
                  className="rounded-full border border-destructive/40 text-destructive px-4 py-3 font-semibold hover:bg-destructive/10"
                >
                  Clear
                </button>
              ) : null}
              <button
                onClick={() => setKeyOpen(false)}
                className="rounded-full border border-border px-4 py-3 font-semibold hover:border-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Knob({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="gradient-text font-bold">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-[oklch(0.64_0.26_303)]"
      />
      {hint ? <p className="text-[10px] text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}

const KNOB_DEFS: { key: keyof Knobs; label: string; hint: string }[] = [
  { key: "contrast",    label: "1. Contrast / threshold",  hint: "Luminance cutoff between ink and paper." },
  { key: "thickness",   label: "2. Line thickness",        hint: "Morphological dilate (>50) thickens; erode (<50) thins." },
  { key: "detail",      label: "3. Detail density",        hint: "Sobel sensitivity for fine edges and texture." },
  { key: "smoothing",   label: "4. Noise reduction",       hint: "Gaussian pre-blur to kill speckle (radius 0–8px)." },
  { key: "shadowDepth", label: "5. Shadow depth",          hint: "Gamma boost on dark luminance band only." },
  { key: "midtone",     label: "6. Midtone boost",         hint: "Bezier squeeze on the 33–66% luminance band." },
  { key: "highlights",  label: "7. Highlights suppression", hint: "Compresses values above 80% luminance." },
  { key: "sharpness",   label: "8. Fine line sharpness",   hint: "Unsharp mask blend for micro-detail accent." },
  { key: "grain",       label: "9. Paper grain",           hint: "Carbon-transfer texture overlay opacity." },
  { key: "intensity",   label: "10. Thermal intensity",    hint: "Lerps ink tint from faded violet to deep thermal purple." },
];

function buildPrompt(o: {
  style: Style;
  intensity: number;
  tierDensity: number[];
  thresholdOffset: number;
  hatchAngle: number;
  hatchSpacing: number;
  meshStrength: number;
}) {
  const [shadow, darkMid, mid, light, highlight] = o.tierDensity;
  const angle2 = (o.hatchAngle + 90) % 180;
  const angle3 = (o.hatchAngle + 45) % 180;
  return `Convert this photo into a professional tattoo STENCIL line drawing, ready to transfer to skin.

HARD RULES:
- Output a single image on PURE WHITE background.
- All ink is the EXACT color #A855F7 (neon purple). No gray, no black, no other colors.
- Crystal-clear closed contour line work, tattoo-stencil ready.
- Preserve the subject's identity, proportions, facial features, hair flow, jewelry, and clothing details.
- Apply 3D FACE-MESH aware hatching at ${o.meshStrength}% strength: hatch direction follows facial surface curvature (cheek, jawline, brow ridge, nose bridge) like a sculptural sketch.

TONAL LAYERING (5 tiers derived from luminance via Otsu multi-level thresholding, offset by ${o.thresholdOffset > 0 ? "+" : ""}${o.thresholdOffset}):
1. Deep shadows — density ${shadow}% — densest mark-making.
2. Dark mid-tones — density ${darkMid}% — heavy mark-making.
3. Mid-tones — density ${mid}% — medium mark-making.
4. Light mid-tones — density ${light}% — light mark-making.
5. Highlights — density ${highlight}% — pure white when 0%.

HATCH GEOMETRY:
- Primary angle ${o.hatchAngle}°, secondary ${angle2}°, tertiary ${angle3}°.
- Line spacing ~${o.hatchSpacing}px.
- Shadows: 3 overlaid hatch directions. Dark mids: 2 directions. Mids: single direction. Lights: sparse. Highlights: blank.

STYLE: ${o.style.toUpperCase()}
${STYLE_PROMPTS[o.style]}

Overall shading density: ${Math.round(o.intensity * 100)}%.
No text, no watermarks, no signatures, no frame, no background scenery.`;
}

// ---------- Client-side post-processing ----------

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Re-renders the stencil with adjustable density / threshold / shading style,
 * all client-side. The original generated stencil is never lost — this only
 * derives a new display image from it.
 */
async function postProcessStencil(
  src: string,
  opts: { density: number; threshold: number; shadingStyle: "none" | "smooth" | "whip" | "pendulum" },
): Promise<string> {
  const img = await loadImage(src);
  const W = Math.min(img.width, 1024);
  const H = Math.round((W / img.width) * img.height);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;

  // Distance-from-white threshold. The generated stencil is purple ink on white,
  // so "ink" pixels have a large distance from white and background pixels are
  // near-white. Slider 50 = preserve everything that's visibly not-white.
  // Higher threshold keeps only the darkest marks; lower keeps faint marks too.
  // Density biases the cutoff further: >50 thickens (keeps more ink), <50 thins.
  const baseCut = 30 - (opts.threshold - 50) * 0.5; // ~55..5
  const densityBias = (opts.density - 50) / 50; // -1..+1
  const cut = Math.max(4, baseCut - densityBias * 15);

  const inkR = 0xa8, inkG = 0x55, inkB = 0xf7;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    // Manhattan distance from white — fast and robust for purple-on-white.
    const dist = (255 - r) + (255 - g) + (255 - b);
    if (dist > cut) {
      px[i] = inkR; px[i + 1] = inkG; px[i + 2] = inkB; px[i + 3] = 255;
    } else {
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);

  // Shading style overlays (operate only on already-inked regions via masking).
  if (opts.shadingStyle === "smooth") {
    // soft gradient: blur a copy then darken-blend
    const tmp = makeCanvas(W, H);
    const tctx = tmp.getContext("2d")!;
    tctx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.55;
    (ctx as any).filter = "blur(1.6px)";
    ctx.drawImage(tmp, 0, 0);
    (ctx as any).filter = "none";
    ctx.restore();
  } else if (opts.shadingStyle === "whip" || opts.shadingStyle === "pendulum") {
    overlayShadingTexture(ctx, W, H, opts.shadingStyle, inkR, inkG, inkB);
  }

  return canvas.toDataURL("image/png");
}

function overlayShadingTexture(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  kind: "whip" | "pendulum",
  r: number, g: number, b: number,
) {
  // Mask = currently inked pixels.
  const base = ctx.getImageData(0, 0, W, H);
  const mask = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < base.data.length; i += 4, j++) {
    mask[j] = base.data[i] < 250 ? 1 : 0;
  }

  const tex = makeCanvas(W, H);
  const tctx = tex.getContext("2d")!;
  tctx.fillStyle = `rgb(${r},${g},${b})`;

  if (kind === "whip") {
    // Spaced directional dot-work: dots along 30° lines, fading along the line.
    const angle = (Math.PI / 180) * 30;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const spacing = 7;
    for (let y = 0; y < H; y += spacing) {
      for (let t = 0; t < W * 1.4; t += 3) {
        const x = Math.round(t * dx + y);
        const yy = Math.round(t * dy + y);
        if (x < 0 || x >= W || yy < 0 || yy >= H) continue;
        if (!mask[yy * W + x]) continue;
        const fade = 1 - (t % 60) / 60;
        tctx.globalAlpha = 0.35 + fade * 0.5;
        tctx.beginPath();
        tctx.arc(x, yy, 0.9 + fade * 0.8, 0, Math.PI * 2);
        tctx.fill();
      }
    }
  } else {
    // Pendulum: tapered back-and-forth swing strokes.
    const rowH = 10;
    for (let y = 0; y < H; y += rowH) {
      const phase = (y / rowH) % 2 === 0 ? 1 : -1;
      tctx.beginPath();
      let started = false;
      for (let x = 0; x < W; x += 2) {
        const yy = Math.round(y + Math.sin((x / W) * Math.PI * 6) * 2.2 * phase);
        if (yy < 0 || yy >= H) continue;
        if (!mask[yy * W + x]) { started = false; continue; }
        if (!started) { tctx.moveTo(x, yy); started = true; } else { tctx.lineTo(x, yy); }
      }
      const taper = 0.6 + Math.random() * 0.8;
      tctx.lineWidth = taper;
      tctx.globalAlpha = 0.7;
      tctx.strokeStyle = `rgb(${r},${g},${b})`;
      tctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(tex, 0, 0);
}

/**
 * Builds the Portrait Shading Map: broken topographic-style contour lines that
 * close around the dark / mid / light boundaries of the original photo, with a
 * semi-transparent tonal underlay inside the boundaries.
 */
async function buildShadingMap(
  stencilSrc: string,
  photoSrc: string | null,
  threshold: number,
): Promise<string> {
  const ref = await loadImage(photoSrc ?? stencilSrc);
  const W = Math.min(ref.width, 800);
  const H = Math.round((W / ref.width) * ref.height);
  const src = makeCanvas(W, H);
  const sctx = src.getContext("2d")!;
  sctx.drawImage(ref, 0, 0, W, H);
  const srcData = sctx.getImageData(0, 0, W, H).data;

  // 3-tier tonal segmentation
  const lum = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < srcData.length; i += 4, j++) {
    lum[j] = (0.299 * srcData[i] + 0.587 * srcData[i + 1] + 0.114 * srcData[i + 2]) | 0;
  }
  const lo = 85 + (threshold - 50) * 0.8;
  const hi = 170 + (threshold - 50) * 0.8;
  const tier = new Uint8Array(W * H);
  for (let i = 0; i < lum.length; i++) {
    tier[i] = lum[i] < lo ? 0 : lum[i] < hi ? 1 : 2;
  }

  const out = makeCanvas(W, H);
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, W, H);

  // Translucent tonal underlay inside the boundaries.
  const underlay = octx.createImageData(W, H);
  for (let j = 0, i = 0; j < tier.length; j++, i += 4) {
    // Map tier -> ink alpha (dark=more, mid=some, light=none)
    const a = tier[j] === 0 ? 90 : tier[j] === 1 ? 45 : 0;
    underlay.data[i] = 0xa8;
    underlay.data[i + 1] = 0x55;
    underlay.data[i + 2] = 0xf7;
    underlay.data[i + 3] = a;
  }
  octx.putImageData(underlay, 0, 0);

  // Broken contour lines on tier boundaries (4-neighbour edge detect on tier map).
  octx.fillStyle = "#A855F7";
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      const t = tier[k];
      const edge =
        tier[k - 1] !== t ||
        tier[k + 1] !== t ||
        tier[k - W] !== t ||
        tier[k + W] !== t;
      if (!edge) continue;
      // "Broken" lines: probabilistic skip creates dashed contour look.
      if (((x * 73856093) ^ (y * 19349663)) % 5 === 0) continue;
      octx.fillRect(x, y, 1, 1);
    }
  }

  return out.toDataURL("image/png");
}