import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Upload, Loader2, Download, ChevronsLeftRight, Settings, KeyRound, Sliders, Sparkles, Wand2, Map as MapIcon } from "lucide-react";
import logo from "@/assets/stencil-logo.png";

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

  // Advanced knobs
  const [advOpen, setAdvOpen] = useState(false);
  const [tierDensity, setTierDensity] = useState([90, 75, 55, 30, 0]); // shadows, dark-mid, mid, light, highlight
  const [thresholdOffset, setThresholdOffset] = useState(0); // -30..+30 shifts all 4 Otsu cutoffs
  const [hatchAngle, setHatchAngle] = useState(45); // primary hatch angle (deg)
  const [hatchSpacing, setHatchSpacing] = useState(3); // px
  const [meshStrength, setMeshStrength] = useState(60); // % face-mesh curvature follow

  // Post-generation edit knobs (client-side only, no re-generation)
  const [editOpen, setEditOpen] = useState(false);
  const [editAdvOpen, setEditAdvOpen] = useState(false);
  const [stencilDensity, setStencilDensity] = useState(50); // 0..100
  const [advThreshold, setAdvThreshold] = useState(50); // 0..100
  const [shadingStyle, setShadingStyle] = useState<"none" | "smooth" | "whip" | "pendulum">("none");
  const [portraitMap, setPortraitMap] = useState(false);
  const [viewMode, setViewMode] = useState<"stencil" | "map">("stencil");
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);

  useEffect(() => {
    const k = typeof window !== "undefined" ? localStorage.getItem(KEY_STORAGE) : null;
    if (k) setApiKey(k);
    const p = typeof window !== "undefined" ? (localStorage.getItem(PROVIDER_STORAGE) as Provider | null) : null;
    if (p === "lovable" || p === "gemini") setProvider(p);
  }, []);

  // Re-run client-side post-processing whenever the stencil or edit knobs change.
  useEffect(() => {
    let cancelled = false;
    if (!stencil) {
      setProcessedUrl(null);
      setMapUrl(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const out = await postProcessStencil(stencil, {
          density: stencilDensity,
          threshold: advThreshold,
          shadingStyle,
        });
        if (cancelled) return;
        setProcessedUrl(out);
        if (portraitMap) {
          const m = await buildShadingMap(stencil, photo, advThreshold);
          if (!cancelled) setMapUrl(m);
        } else {
          setMapUrl(null);
        }
      } catch {
        /* keep last frame */
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [stencil, photo, stencilDensity, advThreshold, shadingStyle, portraitMap]);

  // Reset edit panel when a new stencil arrives.
  useEffect(() => {
    setViewMode("stencil");
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
      const prompt = buildPrompt({
        style,
        intensity,
        tierDensity,
        thresholdOffset,
        hatchAngle,
        hatchSpacing,
        meshStrength,
      });
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
    const source = viewMode === "map" && mapUrl ? mapUrl : processedUrl ?? stencil;
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
          <button
            onClick={() => setKeyOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label="API key settings"
          >
            <KeyRound size={16} />
            <span className={provider === "lovable" ? "text-primary" : apiKey ? "text-primary" : "text-destructive"}>
              {provider === "lovable" ? "Lovable AI" : apiKey ? "My key" : "Set key"}
            </span>
          </button>
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

          <button
            onClick={() => setAdvOpen((v) => !v)}
            className="mt-5 w-full flex items-center justify-between p-3 rounded-2xl border border-border bg-card hover:border-primary/50 transition text-sm"
          >
            <span className="flex items-center gap-2 font-semibold">
              <Sliders size={16} /> Advanced tonal controls
            </span>
            <span className="text-muted-foreground">{advOpen ? "Hide" : "Show"}</span>
          </button>

          {advOpen ? (
            <div className="mt-3 p-4 rounded-2xl border border-border bg-card space-y-5">
              <div>
                <div className="text-sm font-semibold mb-3">Per-tier density</div>
                {["Shadows", "Dark mids", "Mids", "Light mids", "Highlights"].map((label, i) => (
                  <div key={label} className="mb-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="gradient-text font-bold">{tierDensity[i]}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={tierDensity[i]}
                      onChange={(e) => {
                        const next = [...tierDensity];
                        next[i] = Number(e.target.value);
                        setTierDensity(next);
                      }}
                      className="w-full mt-1 accent-[oklch(0.64_0.26_303)]"
                    />
                  </div>
                ))}
              </div>

              <Knob label="Otsu threshold offset" value={thresholdOffset} min={-30} max={30} suffix="" onChange={setThresholdOffset} hint="Shifts the 4 luminance cutoffs separating the 5 tiers." />
              <Knob label="Hatch angle" value={hatchAngle} min={0} max={180} suffix="°" onChange={setHatchAngle} hint="Primary hatch direction (secondary +90°, tertiary +45°)." />
              <Knob label="Hatch spacing" value={hatchSpacing} min={1} max={10} suffix="px" onChange={setHatchSpacing} hint="Distance between parallel hatch lines." />
              <Knob label="Face-mesh curvature" value={meshStrength} min={0} max={100} suffix="%" onChange={setMeshStrength} hint="How strongly hatching follows facial 3D surface curvature." />
            </div>
          ) : null}
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
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-extrabold">Your stencil</h2>
              {portraitMap && mapUrl ? (
                <div className="inline-flex rounded-full border border-border bg-card p-1 text-xs">
                  <button
                    onClick={() => setViewMode("stencil")}
                    className={`px-3 py-1 rounded-full transition ${viewMode === "stencil" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >Stencil</button>
                  <button
                    onClick={() => setViewMode("map")}
                    className={`px-3 py-1 rounded-full transition ${viewMode === "map" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >Shading map</button>
                </div>
              ) : null}
            </div>
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
                src={viewMode === "map" && mapUrl ? mapUrl : processedUrl ?? stencil}
                alt="Stencil"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
              />
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
              <div className="p-4 rounded-2xl border border-border bg-card space-y-5">
                <Knob label="Stencil density" value={stencilDensity} min={0} max={100} suffix="%" onChange={setStencilDensity} hint="Line weight & detail threshold of the rendered stencil." />

                <button
                  onClick={() => setEditAdvOpen((v) => !v)}
                  className="w-full flex items-center justify-between p-2 rounded-xl border border-border hover:border-primary/50 transition text-xs"
                >
                  <span className="flex items-center gap-2 font-semibold"><Sliders size={14} /> Advanced settings</span>
                  <span className="text-muted-foreground">{editAdvOpen ? "Hide" : "Show"}</span>
                </button>

                {editAdvOpen ? (
                  <div className="space-y-5 pt-1">
                    <Knob label="Advanced threshold" value={advThreshold} min={0} max={100} suffix="%" onChange={setAdvThreshold} hint="Fine-tunes high/low-contrast separation limits." />

                    <div>
                      <div className="text-xs font-semibold mb-2">Tattoo shading style</div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: "none", label: "Original", sub: "No shading filter" },
                          { id: "smooth", label: "Smooth", sub: "Soft gradients" },
                          { id: "whip", label: "Whip", sub: "Spaced directional dots" },
                          { id: "pendulum", label: "Pendulum", sub: "Tapered swing texture" },
                        ] as const).map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setShadingStyle(s.id)}
                            className={`text-left p-2 rounded-xl border transition ${shadingStyle === s.id ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
                          >
                            <div className="font-bold text-xs">{s.label}</div>
                            <div className={`text-[10px] ${shadingStyle === s.id ? "opacity-90" : "text-muted-foreground"}`}>{s.sub}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center justify-between p-3 rounded-xl border border-border cursor-pointer">
                      <span className="flex items-center gap-2 text-xs font-semibold"><MapIcon size={14} /> Portrait shading map</span>
                      <span
                        className={`relative inline-block w-10 h-6 rounded-full transition ${portraitMap ? "bg-gradient-primary" : "bg-muted"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${portraitMap ? "left-[18px]" : "left-0.5"}`} />
                      </span>
                      <input type="checkbox" className="hidden" checked={portraitMap} onChange={(e) => setPortraitMap(e.target.checked)} />
                    </label>
                    {portraitMap ? (
                      <p className="text-[10px] text-muted-foreground -mt-3">Broken contour lines close around dark/mid/light transitions, with a translucent tonal underlay. Toggle the view above the preview.</p>
                    ) : null}
                  </div>
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