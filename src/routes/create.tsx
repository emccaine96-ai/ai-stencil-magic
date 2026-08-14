import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Upload,
  Loader2,
  Download,
  ChevronsLeftRight,
  Settings,
  KeyRound,
  Sparkles,
  Archive,
  Zap,
} from "lucide-react";
import logo from "@/assets/stencil-logo.png";
import { saveStencil } from "@/lib/vault";
import { MasterSuite } from "@/components/master-suite/MasterSuite";
import { toast } from "sonner";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create Stencil — PrimalPrint AI" },
      {
        name: "description",
        content:
          "Upload a photo and generate a professional tattoo stencil with 5-tier tonal layering.",
      },
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
    "Pure pen-and-ink CROSSHATCHING — visible straight line strokes only, NEVER dots. Deep shadows use 3 overlaid hatch directions (45°/135°/90°) at ~3px spacing; dark mids 2 directions; mids single-direction parallel hatching; lights very sparse parallel strokes; highlights pure white. Lines must be crisp, straight and clearly readable.",
  solid:
    "Clean bold solid line work, no shading fills. Use varying line weights only. Closed clean contours. Highlights pure white.",
  dotwork:
    "Dotwork stencil: clean solid CONTOUR LINES define every shape, with stippling DOTS filling the interior tones. Shadows = very dense small dots; dark mids = medium density; mids = sparse; lights = very few; highlights = pure white. Contour lines must be present and crisp — this is NOT pure dots, it is line work + dot shading.",
  hybrid:
    "Combine bold solid CONTOUR LINES with CROSSHATCHING in dark areas and STIPPLING dots in mid-to-light areas. All three techniques visible in the same image.",
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
  const [customPrompt, setCustomPrompt] = useState("");
  const [customPromptOpen, setCustomPromptOpen] = useState(false);

  useEffect(() => {
    const k = typeof window !== "undefined" ? localStorage.getItem(KEY_STORAGE) : null;
    if (k) setApiKey(k);
    const p =
      typeof window !== "undefined"
        ? (localStorage.getItem(PROVIDER_STORAGE) as Provider | null)
        : null;
    if (p === "lovable" || p === "gemini") setProvider(p);
    // Hand-off from Vault: open a saved entry directly in the editor.
    try {
      const raw =
        typeof window !== "undefined" ? sessionStorage.getItem("primalprint.editor.load") : null;
      if (raw) {
        sessionStorage.removeItem("primalprint.editor.load");
        const parsed = JSON.parse(raw) as {
          stencil?: string;
          photo?: string | null;
          style?: Style;
        };
        if (parsed.photo) setPhoto(parsed.photo);
        if (parsed.style) setStyle(parsed.style);
        if (parsed.stencil) setStencil(parsed.stencil);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-save every new stencil to the local Storage Vault (IndexedDB).
  useEffect(() => {
    if (!stencil) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await saveStencil({ stencil, photo, style, meta: { intensity } });
        if (!cancelled && saved) toast.success("Saved to Storage Vault");
      } catch (err) {
        if (!cancelled) toast.error("Couldn't save to Vault — try again");
        console.error("[create] auto-save failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
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
              {
                role: "user",
                parts: [{ text: prompt }, { inlineData: { mimeType, data: imgB64 } }],
              },
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
    const source = stencil;
    if (!source) return;
    setExporting(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = source;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
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
            <MasterSuite
              photo={photo}
              stencilUrl={stencil}
              onReplacePhoto={(d) => {
                setStencil(null);
                setPhoto(d);
              }}
            />
            <button
              onClick={() => setKeyOpen(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="API key settings"
            >
              <KeyRound size={14} />
              <span
                className={`hidden sm:inline ${provider === "lovable" ? "text-primary" : apiKey ? "text-primary" : "text-destructive"}`}
              >
                {provider === "lovable" ? "Lovable AI" : apiKey ? "My key" : "Set key"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              AI provider
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => selectProvider("lovable")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "lovable" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Sparkles size={14} /> Lovable AI
              </div>
              <div
                className={`text-[11px] mt-1 ${provider === "lovable" ? "opacity-90" : "text-muted-foreground"}`}
              >
                Uses workspace credits. No key required.
              </div>
            </button>
            <button
              onClick={() => selectProvider("gemini")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "gemini" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <KeyRound size={14} /> My Gemini key
              </div>
              <div
                className={`text-[11px] mt-1 ${provider === "gemini" ? "opacity-90" : "text-muted-foreground"}`}
              >
                Free tier from Google AI Studio.
              </div>
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
              <span>
                Need more detail? Open the{" "}
                <span className="font-semibold text-foreground">Studio Suite → Upscale</span> tab to
                Lanczos-3 up to 4K.
              </span>
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
                <div
                  className={`text-xs mt-1 ${style === s.id ? "opacity-90" : "text-muted-foreground"}`}
                >
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
              Controls the 5-tier tonal layering: shadows → dark mids → mids → light mids →
              highlights. Higher density = denser hatching/dots in darker tones.
            </p>
          </div>
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
                src={stencil}
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
              <div
                className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
                style={{ left: `${pos}%` }}
              />
              <div
                className="absolute h-10 w-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center pointer-events-none shadow-glow"
                style={{ left: `calc(${pos}% - 20px)`, top: "calc(50% - 20px)" }}
              >
                <ChevronsLeftRight size={18} />
              </div>
            </div>

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
                {exporting ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Preparing…
                  </>
                ) : (
                  <>
                    <Download size={16} /> Download{" "}
                    {exportSize === 7680
                      ? "8K"
                      : exportSize === 4096
                        ? "4K"
                        : exportSize === 2048
                          ? "2K"
                          : "1K"}{" "}
                    PNG
                  </>
                )}
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                Upscaled in your browser via high-quality bicubic interpolation.
              </p>
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
              Your key is stored only in your browser (localStorage) and sent directly to Google. It
              never touches our servers. Get one at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                aistudio.google.com/apikey
              </a>
              .
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

function buildPrompt(o: { style: Style; intensity: number }) {
  // Bake the proven "May 27" defaults into the prompt so first-shot output is
  // gallery-grade without the user needing to touch sliders.
  return `Convert this photo into a professional tattoo STENCIL line drawing, ready to transfer to skin.

HARD RULES:
- Output a single image on PURE WHITE background.
- All ink is the EXACT color #A855F7 (neon purple). No gray, no black, no other colors.
- Crystal-clear closed contour line work, tattoo-stencil ready.
- Preserve the subject's identity, proportions, facial features, hair flow, jewelry and clothing details exactly.
- For portraits: apply 3D face-mesh aware crosshatching that follows facial surface curvature (cheek, jawline, brow ridge, nose bridge). Eyes, lips and teeth crisply defined.
- For flowers / objects: delicate parallel hatching radiating along petal curvature, soft pencil-like graduations from saturated purple in shadow folds to faint outline on outer petals.

TONAL LAYERING (5 tiers via Otsu multi-level thresholding):
1. Deep shadows — densest mark-making, 3 overlaid hatch directions.
2. Dark mid-tones — heavy mark-making, 2 hatch directions.
3. Mid-tones — medium single-direction hatching.
4. Light mid-tones — sparse parallel strokes.
5. Highlights — pure white paper.

HATCH GEOMETRY: primary 45°, secondary 135°, tertiary 90°. ~3px line spacing.

STYLE: ${o.style.toUpperCase()}
${STYLE_PROMPTS[o.style]}

Overall shading density: ${Math.round(o.intensity * 100)}%.
No text, no watermarks, no signatures, no frame, no background scenery.`;
}
