import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { runPlugin, BUILTIN_PLUGINS } from "@/lib/plugins";
import { processClassicalPro, type ClassicalProResult } from "@/lib/classical-pro-integration";
import { computeStencilMetrics, computeTattooability, type TattooabilityResult } from "@/lib/classical-engine/inspector";
// @ts-ignore — optional vectorization (imagetracerjs)
import { vectorizeLineLayer } from "@/lib/classical-engine/vectorize";
// @ts-ignore — ink style panel (optional add-on, collapsed by default)
import { InkStylePanel } from "@/components/InkStylePanel";
// @ts-ignore — font system (self-hosted Font Squirrel fonts)
import { injectSelfHostedFontFaces, preloadAllSelfHostedFonts } from "@/fonts/load-font";
import { renderLetteringToImageData } from "@/fonts/text-to-stencil";
import { toast } from "sonner";
import { CustomPromptPanel } from "@/components/CustomPromptPanel";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create Stencil — AI Stencil Magic" },
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

const KEY_STORAGE = "stencilmagic.gemini.key";
const OR_KEY_STORAGE = "stencilmagic.openrouter.key";
const PROVIDER_STORAGE = "stencilmagic.provider"; // 'openrouter' | 'gemini'
const OR_MODEL_STORAGE = "stencilmagic.openrouter.model";
type Provider = "openrouter" | "gemini" | "classical" | "hybrid";
const STYLE_PROMPT_BLOCKS: Record<Style, string> = {
  hatching: `STYLE: HATCHING
Pure pen-and-ink crosshatching — visible straight line strokes only, NEVER dots, NEVER solid fills.
- For portraits: apply 3D face-mesh aware crosshatching that follows facial surface curvature (cheek, jawline, brow ridge, nose bridge). Eyes, lips and teeth crisply defined.
- For flowers / objects: delicate parallel hatching radiating along petal curvature, soft pencil-like graduations from saturated purple in shadow folds to faint outline on outer petals.

TONAL LAYERING (5 tiers, hatch density/direction only):
1. Deep shadows — densest mark-making, 3 overlaid hatch directions.
2. Dark mid-tones — heavy mark-making, 2 hatch directions.
3. Mid-tones — medium single-direction hatching.
4. Light mid-tones — sparse parallel strokes.
5. Highlights — pure white paper, no marks.

HATCH GEOMETRY: primary 45°, secondary 135°, tertiary 90°. ~3px line spacing. Lines must be crisp, straight and clearly readable. Absolutely no dots or stipple marks anywhere.`,

  solid: `STYLE: SOLID
Clean bold solid line work only. NO shading fills, NO cross-hatching, NO parallel hatching, NO dots or stippling of any kind, anywhere in the image. Depth is expressed ONLY through line-weight variation on closed, clean contours.
- For portraits: bold varying-weight contour lines define every facial feature and structural edge — heavier or doubled lines at deep-shadow boundaries (jawline undercut, brow ridge, nostril, ear canal), lighter single lines for subtle contours. No interior mark-making inside any contour.
- For flowers / objects: bold single-weight outline per petal/leaf/edge boundary; heavier line weight only where forms overlap or a deep fold occurs.

LINE-WEIGHT LAYERING (5 tiers, weight only — no interior marks of any kind):
1. Deep shadows — thickest line, doubled/tripled where contours overlap.
2. Dark mid-tones — thick single contour line.
3. Mid-tones — medium-weight contour line.
4. Light areas — thin, delicate contour line.
5. Highlights — no line at all, pure white paper.`,

  dotwork: `STYLE: DOTWORK
Clean solid CONTOUR LINES define every shape. ALL interior shading is stippling DOTS only — NEVER hatch lines or parallel strokes anywhere in the image.
- For portraits: crisp solid contour lines outline every facial feature and boundary; all tonal depth inside those contours comes entirely from dot density, never from line strokes.
- For flowers / objects: bold contour per shape; interior shading is dot density only.

DOT DENSITY LAYERING (5 tiers, density only — no hatch lines):
1. Deep shadows — dots nearly touching, maximum density.
2. Dark mid-tones — medium-dense dots with visible white space between each dot.
3. Mid-tones — evenly spaced sparse dots.
4. Light mid-tones — very few, widely scattered dots.
5. Highlights — pure white, zero dots.

DOT GEOMETRY: dots ~1-2px diameter, circular, cleanly separated — never smudged together into a line or hatch mark. Contour lines are present and crisp; this is NOT pure dots, it is line work + dot shading, but the shading itself is 100% dots.`,

  hybrid: `STYLE: HYBRID
Combine bold solid CONTOUR LINES on every shape boundary with CROSSHATCHING confined to the darkest shadow areas and STIPPLING dots carrying the mid-to-light tones — all three techniques visible together, each confined to its own tonal range so they don't blend into mud.
- For portraits: bold contour lines on every feature edge; crosshatching only in the deepest shadow pockets (eye sockets, under-jaw, nostril shadow); dot shading carries the mid-tones and light transitions.
- For flowers / objects: bold outline per petal/leaf; hatching only in the deepest fold shadows; dots for the mid-tone gradation toward the highlight.

TONAL LAYERING (5 tiers — technique changes by tier, this is the point of Hybrid):
1. Deep shadows — 2-3 overlaid hatch directions (45°/135°/90°).
2. Dark mid-tones — single-direction hatching, transitioning to dense dots at the tier's edge.
3. Mid-tones — dense-to-medium dot stippling, no hatch lines.
4. Light mid-tones — sparse, widely-spaced dots.
5. Highlights — pure white paper, no marks.

Contour line weight follows the same logic as Solid: heavier at deep-shadow boundaries, thin at light edges.`,
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

async function normalizeToPurpleInk(dataUrl: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataUrl;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const alpha = d[i + 3];
    if (alpha > 10 && lum < 200) {
      d[i] = 168;
      d[i + 1] = 85;
      d[i + 2] = 247;
      d[i + 3] = 255;
    } else {
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL("image/png");
}

async function scoreStencil(dataUrl: string): Promise<TattooabilityResult> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataUrl;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const ink = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    ink[p] = data[i + 3] > 10 ? 255 : 0;
  }
  const metrics = computeStencilMetrics(ink, width, height);
  return computeTattooability(metrics);
}

function CreatePage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>("hatching");
  const [intensity, setIntensity] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stencil, setStencil] = useState<string | null>(null);
  const [tattooability, setTattooability] = useState<TattooabilityResult | null>(null);
  const [pos, setPos] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // API keys
  const [apiKey, setApiKey] = useState("");
  const [orKey, setOrKey] = useState("");
  const [orModel, setOrModel] = useState("google/gemini-2.5-flash-image");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [orKeyDraft, setOrKeyDraft] = useState("");
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [originalStencil, setOriginalStencil] = useState<string | null>(null);
  const [pluginProcessing, setPluginProcessing] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState<1024 | 2048 | 4096 | 7680>(2048);
  const [exporting, setExporting] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  // Ink style panel intermediate data (from classical engine)
  const [inkStyleData, setInkStyleData] = useState<{
    primaryLines: Uint8ClampedArray;
    toneIdx: Uint8Array;
    toneGray: Float32Array;
    width: number;
    height: number;
  } | null>(null);
  // SVG export state
  const [svgExporting, setSvgExporting] = useState(false);
  const [useAdvancedPipeline, setUseAdvancedPipeline] = useState(false);
  // Multi-Scale Retinex illumination normalization -- off by default (opt-in
  // for harshly-lit/backlit reference photos), per VISION.md's "optional,
  // not default" rule and the classical-engine-audit.md recommendation.
  const [useRetinex, setUseRetinex] = useState(false);
  // Background separation -- 'keep' by default (fully inert), same
  // optional/off-by-default treatment as Retinex above.
  const [backgroundMode, setBackgroundMode] = useState<"keep" | "remove" | "fade">("keep");


  // Load self-hosted fonts on mount (Font Squirrel system)
  useEffect(() => {
    injectSelfHostedFontFaces();
    preloadAllSelfHostedFonts().catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const k = localStorage.getItem(KEY_STORAGE);
    if (k) setApiKey(k);
    const ork = localStorage.getItem(OR_KEY_STORAGE);
    if (ork) setOrKey(ork);
    const orm = localStorage.getItem(OR_MODEL_STORAGE);
    if (orm) setOrModel(orm);
    const p = localStorage.getItem(PROVIDER_STORAGE) as Provider | null;
    if (p === "openrouter" || p === "gemini" || p === "classical" || p === "hybrid") setProvider(p);
    // Hand-off from Vault: open a saved entry directly in the editor.
    try {
      const raw = sessionStorage.getItem("primalprint.editor.load");
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
  }, [stencil]);

  function selectProvider(p: Provider) {
    setProvider(p);
    localStorage.setItem(PROVIDER_STORAGE, p);
    // Prompt for the relevant key when switching to a key-based engine
    if (p === "gemini" && !apiKey) setKeyOpen(true);
    if (p === "openrouter" && !orKey) setKeyOpen(true);
  }

  function saveKeys() {
    const g = keyDraft.trim();
    const o = orKeyDraft.trim();
    if (g) {
      localStorage.setItem(KEY_STORAGE, g);
      setApiKey(g);
    }
    if (o) {
      localStorage.setItem(OR_KEY_STORAGE, o);
      setOrKey(o);
    }
    setKeyDraft("");
    setOrKeyDraft("");
    setKeyOpen(false);
    if (g || o) toast.success("API key(s) saved");
  }

  function clearGeminiKey() {
    localStorage.removeItem(KEY_STORAGE);
    setApiKey("");
    setKeyDraft("");
  }

  function clearOrKey() {
    localStorage.removeItem(OR_KEY_STORAGE);
    setOrKey("");
    setOrKeyDraft("");
  }

  async function applyPlugin(pluginId: string) {
    if (!stencil) return;
    const plugin = BUILTIN_PLUGINS.find((p) => p.id === pluginId);
    if (!plugin) return;

    // Save original if this is the first plugin application
    if (!originalStencil) setOriginalStencil(stencil);

    setPluginProcessing(pluginId);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = stencil;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const params: Record<string, any> = {};
      plugin.params?.forEach((p) => { params[p.key] = p.default; });

      const result = await runPlugin(plugin, imageData, params);
      ctx.putImageData(result, 0, 0);
      setStencil(canvas.toDataURL("image/png"));
      toast.success(`${plugin.name} applied`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Plugin failed");
    } finally {
      setPluginProcessing(null);
    }
  }

  function revertPlugins() {
    if (originalStencil) {
      setStencil(originalStencil);
      setOriginalStencil(null);
      toast.success("Reverted to original");
    }
  }

  async function onPick(file?: File | null) {
    if (!file) return;
    setStencil(null);
    setTattooability(null);
    setInkStyleData(null);
    setError(null);
    setPhoto(await fileToDataUrl(file));
  }

  async function generate() {
    if (!photo) return;
    if (provider === "gemini" && !apiKey) {
      setKeyOpen(true);
      return;
    }
    if (provider === "openrouter" && !orKey) {
      // Still allow generate — server may have OPENROUTER_API_KEY env fallback
      // but surface the modal so user can supply their own key.
      setKeyOpen(true);
    }
    setLoading(true);
    setError(null);
    setStencil(null);
    setInkStyleData(null);
    try {
      if (provider === "classical") {
        const result = await processClassicalPro(photo, {
          style,
          intensity,
          purpleTint: true,
          useAdvancedPipeline,
          useRetinex,
        });
        const purpleResult = await normalizeToPurpleInk(result.dataUrl);
        setStencil(purpleResult);
        scoreStencil(purpleResult).then(setTattooability).catch(() => setTattooability(null));
        // Store intermediate data for InkStylePanel (if available from the engine)
        setInkStyleData(result.intermediate ?? null);
        toast.success(`Classical Pro: ${style} (${result.processingTime}ms)`);
        setLoading(false);
        return;
      }
      if (provider === "hybrid") {
        // Step 1: Classical Pro pre-processing
        const classicalResult = await processClassicalPro(photo, {
          style,
          intensity,
          purpleTint: false,
          useRetinex,
        });
        // Step 2: Send classical result to AI for refinement — WITH the
        // original photo included for identity/likeness grounding, since the
        // AI was previously only shown the abstracted line art and had
        // nothing to stay faithful to.
        const { mimeType: cm, data: cB64 } = dataUrlToInline(classicalResult.dataUrl);
        const { mimeType: om, data: oB64 } = dataUrlToInline(photo);
        const hybridPrompt = `Reference image 1 is the ORIGINAL PHOTO — preserve this subject's identity, proportions, facial features, hair flow, jewelry and clothing details exactly. Reference image 2 is a pre-processed structural line-art guide for the "${style}" style at ${Math.round(intensity * 100)}% shading density — use it as a structural guide for line placement, but the final result's likeness must match reference image 1, not deviate into generic features. Output a single clean tattoo stencil line drawing on pure white background, improving line quality and adding artistic detail while staying faithful to the original photo's actual identity. ${customPrompt || ""}`;
        let hybridDataUrl: string | null = null;
        // Try server-side first (OpenRouter). NOTE: passes both images via an
        // `images` array — generate-stencil.ts needs to read body.images
        // (falling back to the single `image` field) and forward both to the
        // OpenRouter vision call for this to actually use the original photo.
        // Check that server route's current body-parsing before relying on this.
        try {
          const r = await fetch("/api/generate-stencil", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: hybridPrompt,
              image: { mimeType: om, data: oB64 },
              images: [
                { mimeType: om, data: oB64 },
                { mimeType: cm, data: cB64 },
              ],
              provider: "openrouter",
              openrouterKey: orKey || undefined,
              model: orModel,
            }),
          });
          const data = await r.json();
          if (r.ok && data.dataUrl) hybridDataUrl = data.dataUrl;
        } catch (err) {
          console.error("[create] hybrid OpenRouter step failed", err);
        }
        // Fallback: Gemini direct with user key — sends BOTH images
        if (!hybridDataUrl && apiKey) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(apiKey)}`;
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [
                { text: hybridPrompt },
                { inlineData: { mimeType: om, data: oB64 } },
                { inlineData: { mimeType: cm, data: cB64 } },
              ]}],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
            }),
          });
          const data = await r.json();
          if (r.ok) {
            const parts = data?.candidates?.[0]?.content?.parts ?? [];
            const imgPart = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
            const inline = imgPart?.inlineData ?? imgPart?.inline_data;
            if (inline?.data) {
              const outMime = inline.mimeType || inline.mime_type || "image/png";
              hybridDataUrl = `data:${outMime};base64,${inline.data}`;
            }
          }
        }
        if (!hybridDataUrl) {
          hybridDataUrl = classicalResult.dataUrl;
          toast.info("No API key set — showing Classical Pro result. Add a Gemini or OpenRouter key for AI refinement.");
        }
        const purpleResult = await normalizeToPurpleInk(hybridDataUrl);
        setStencil(purpleResult);
        scoreStencil(purpleResult).then(setTattooability).catch(() => setTattooability(null));
        // Hybrid genuinely has fresh Classical Pro intermediate data from its own
        // pre-processing step above — surface it to the Ink Style Panel like the
        // classical branch does, instead of leaving the panel hidden despite the
        // data being available.
        setInkStyleData(classicalResult.intermediate ?? null);
        setLoading(false);
        return;
      }
      const { mimeType, data: imgB64 } = dataUrlToInline(photo);
      const prompt = buildPrompt({ style, intensity, customPrompt });
      if (provider === "openrouter") {
        const r = await fetch("/api/generate-stencil", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            image: { mimeType, data: imgB64 },
            provider: "openrouter",
            openrouterKey: orKey || undefined,
            model: orModel,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `OpenRouter AI error ${r.status}`);
        {
          const purpleResult = await normalizeToPurpleInk(data.dataUrl);
          setStencil(purpleResult);
          scoreStencil(purpleResult).then(setTattooability).catch(() => setTattooability(null));
        }
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
        {
          const purpleResult = await normalizeToPurpleInk(`data:${outMime};base64,${imgPart.inlineData.data}`);
          setStencil(purpleResult);
          scoreStencil(purpleResult).then(setTattooability).catch(() => setTattooability(null));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  async function downloadSVG() {
    if (!stencil) return;
    setSvgExporting(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = stencil;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const svg = await vectorizeLineLayer(canvas);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "stencil-vector.svg";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      toast.success("SVG exported");
    } catch (e) {
      // imagetracerjs not installed — graceful fallback
      toast.error("SVG export requires imagetracerjs (not installed)");
    } finally {
      setSvgExporting(false);
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

  const keyStatusLabel =
    provider === "openrouter"
      ? orKey
        ? "OpenRouter ✓"
        : "OpenRouter key"
      : provider === "classical"
        ? "Classical Pro"
        : provider === "hybrid"
          ? orKey || apiKey
            ? "Hybrid ✓"
            : "Hybrid key"
          : apiKey
            ? "Gemini key"
            : "Set key";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm">
            <ChevronLeft size={18} /> Back
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-script text-xl">AI Stencil Magic</span>
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
              onClick={() => {
                if (provider === "openrouter" || provider === "hybrid") {
                  navigate({ to: "/settings" });
                } else {
                  setKeyOpen(true);
                }
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="API key settings"
            >
              <KeyRound size={14} />
              <span
                className={`hidden sm:inline ${
                  (provider === "openrouter" && orKey) ||
                  (provider === "gemini" && apiKey) ||
                  (provider === "hybrid" && (orKey || apiKey))
                    ? "text-primary"
                    : provider === "classical"
                      ? "text-muted-foreground"
                      : "text-destructive"
                }`}
              >
                {keyStatusLabel}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Engine
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => selectProvider("openrouter")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "openrouter" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Sparkles size={14} /> OpenRouter
              </div>
              <div
                className={`text-[10px] mt-1 ${provider === "openrouter" ? "opacity-90" : "text-muted-foreground"}`}
              >
                AI generation via OpenRouter
              </div>
            </button>
            <button
              onClick={() => selectProvider("gemini")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "gemini" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <KeyRound size={14} /> Gemini
              </div>
              <div
                className={`text-[10px] mt-1 ${provider === "gemini" ? "opacity-90" : "text-muted-foreground"}`}
              >
                Free tier from Google AI
              </div>
            </button>
            <button
              onClick={() => selectProvider("classical")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "classical" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Zap size={14} /> Classical Pro
              </div>
              <div
                className={`text-[10px] mt-1 ${provider === "classical" ? "opacity-90" : "text-muted-foreground"}`}
              >
                No API key — runs locally
              </div>
            </button>
            <button
              onClick={() => selectProvider("hybrid")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "hybrid" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <ChevronsLeftRight size={14} /> Hybrid
              </div>
              <div
                className={`text-[10px] mt-1 ${provider === "hybrid" ? "opacity-90" : "text-muted-foreground"}`}
              >
                Classical then AI refine
              </div>
            </button>
          </div>
          {provider === "classical" ? (
            <div className="mt-3 p-4 rounded-2xl border border-border bg-card space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Classical Pro uses the same style + shading density as above. Runs locally — no API key, no credits.
              </p>
              <label
                className={`flex items-center gap-2 text-xs cursor-pointer ${style === "dotwork" ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground"}`}
              >
                <input
                  type="checkbox"
                  checked={useAdvancedPipeline && style !== "dotwork"}
                  disabled={style === "dotwork"}
                  onChange={(e) => setUseAdvancedPipeline(e.target.checked)}
                  className="accent-primary"
                />
                <span>Advanced multi-scale pipeline (experimental)</span>
              </label>
              {style === "dotwork" && useAdvancedPipeline ? (
                <p className="text-[10px] text-muted-foreground/70">
                  Advanced doesn't support Dotwork yet — using the standard engine for this style.
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useRetinex}
                  onChange={(e) => setUseRetinex(e.target.checked)}
                  className="accent-primary"
                />
                <span>Fix harsh lighting (illumination normalization)</span>
              </label>
            </div>
          ) : null}
          {provider === "hybrid" ? (
            <div className="mt-3 p-4 rounded-2xl border border-border bg-card space-y-2">
              <p className="text-[11px] text-muted-foreground">
                <strong className="text-foreground">Hybrid:</strong> Classical Pro processes the image first (CLAHE, edge detection, line work), then sends it to AI for refinement. Clean structure plus artistic detail.
              </p>
              <p className="text-[10px] text-muted-foreground">
                Uses 1 API call. Falls back to Classical Pro only if no key is set.
              </p>
              <label className="flex items-center gap-2 text-xs cursor-pointer text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useRetinex}
                  onChange={(e) => setUseRetinex(e.target.checked)}
                  className="accent-primary"
                />
                <span>Fix harsh lighting (illumination normalization)</span>
              </label>
            </div>
          ) : null}
          {provider === "openrouter" && !orKey ? (
            <div className="mt-3 p-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200">
              No OpenRouter key set. Tap the key icon in the header to add your key (or the server env key will be used if configured).
            </div>
          ) : null}
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
          <p className="text-xs text-muted-foreground mt-1">Applies to all engines — AI and Classical Pro</p>
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
              className="w-full mt-2 accent-primary"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Controls the 5-tier tonal layering: shadows → dark mids → mids → light mids →
              highlights. Higher density = denser hatching/dots in darker tones.
            </p>
          </div>
        </section>

        <CustomPromptPanel
          value={customPrompt}
          onChange={setCustomPrompt}
          openrouterKey={orKey}
          geminiKey={apiKey}
        />

        <button
          onClick={generate}
          disabled={!photo || loading}
          className="w-full rounded-full bg-gradient-primary text-primary-foreground py-4 font-bold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} /> Processing stencil…
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
            {tattooability ? (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Tattooability
                  </span>
                  <span
                    className={`text-lg font-extrabold ${
                      tattooability.score >= 75
                        ? "text-primary"
                        : tattooability.score >= 50
                          ? "text-amber-400"
                          : "text-destructive"
                    }`}
                  >
                    {tattooability.score}/100
                  </span>
                </div>
                {tattooability.reasons.length > 0 ? (
                  <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                    {tattooability.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Clean, tattoo-ready line work.</p>
                )}
              </div>
            ) : null}
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
              <button
                onClick={downloadSVG}
                disabled={svgExporting}
                className="w-full rounded-full border border-border hover:border-primary/50 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2"
              >
                {svgExporting ? (
                  <>
                    <Loader2 className="animate-spin" size={14} /> Converting…
                  </>
                ) : (
                  <>Export as SVG (vector)</>
                )}
              </button>
            </div>

            {/* Ink Style Panel — optional add-on, collapsed by default */}
            {inkStyleData ? (
              <InkStylePanel
                primaryLines={inkStyleData.primaryLines}
                toneIdx={inkStyleData.toneIdx}
                toneGray={inkStyleData.toneGray}
                width={inkStyleData.width}
                height={inkStyleData.height}
                onResult={(imageData) => {
                  const canvas = document.createElement("canvas");
                  canvas.width = imageData.width;
                  canvas.height = imageData.height;
                  canvas.getContext("2d")!.putImageData(imageData, 0, 0);
                  setStencil(canvas.toDataURL("image/png"));
                }}
              />
            ) : null}

            {/* Plugin Enhancement Panel */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-primary" />
                  <span className="text-sm font-semibold">Quick Enhance</span>
                </div>
                {originalStencil ? (
                  <button
                    onClick={revertPlugins}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Revert all
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                One-tap filters to fine-tune your stencil. Stack multiple — each applies on top of the last.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "builtin.stencil-sharpen", label: "Sharpen", icon: "✨" },
                  { id: "builtin.smart-contrast", label: "Contrast", icon: "◐" },
                  { id: "builtin.otsu-threshold", label: "Auto B/W", icon: "⬛" },
                  { id: "builtin.edge-connector", label: "Fix Gaps", icon: "🔗" },
                  { id: "builtin.line-thinning", label: "Thin Lines", icon: "✏️" },
                  { id: "builtin.bilateral-smooth", label: "Smooth", icon: "🌊" },
                  { id: "builtin.halftone-stipple", label: "Stipple", icon: "⚫" },
                  { id: "builtin.mirror-symmetry", label: "Mirror", icon: "🪞" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPlugin(p.id)}
                    disabled={pluginProcessing !== null}
                    className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:border-primary/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pluginProcessing === p.id ? (
                      <Loader2 size={18} className="animate-spin text-primary" />
                    ) : (
                      <span className="text-lg">{p.icon}</span>
                    )}
                    <span className="text-[10px] font-medium">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {keyOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Settings size={18} className="text-primary" />
              <h3 className="font-extrabold text-lg">API Keys</h3>
            </div>

            {/* OpenRouter key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles size={14} className="text-primary" /> OpenRouter
                </label>
                {orKey ? (
                  <button
                    onClick={clearOrKey}
                    className="text-[11px] text-destructive hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Used for the OpenRouter and Hybrid engines. Stored only in your browser. Get a key at{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  openrouter.ai/keys
                </a>
                .
              </p>
              <input
                type="password"
                placeholder={orKey ? "•••• key saved — paste to replace" : "Paste your OpenRouter API key"}
                value={orKeyDraft}
                onChange={(e) => setOrKeyDraft(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* Gemini key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <KeyRound size={14} className="text-primary" /> Gemini
                </label>
                {apiKey ? (
                  <button
                    onClick={clearGeminiKey}
                    className="text-[11px] text-destructive hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Used for the Gemini engine (and Hybrid fallback). Stored only in your browser. Get one at{" "}
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
                placeholder={apiKey ? "•••• key saved — paste to replace" : "Paste your Gemini API key"}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={saveKeys}
                disabled={!keyDraft.trim() && !orKeyDraft.trim()}
                className="flex-1 rounded-full bg-gradient-primary text-primary-foreground py-3 font-bold shadow-glow disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setKeyDraft("");
                  setOrKeyDraft("");
                  setKeyOpen(false);
                }}
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

function buildPrompt(o: { style: Style; intensity: number; customPrompt?: string }) {
  // Bake the proven "May 27" defaults into the prompt so first-shot output is
  // gallery-grade without the user needing to touch sliders.
  //
  // FIXED 2026-09-03: this used to share ONE hatch-specific base (crosshatching,
  // hatch-direction tonal tiers, hatch geometry) across ALL 4 styles, with only a
  // one-line style-specific addendum appended at the end. For Solid ("no shading
  // fills") and Dotwork ("NOT pure dots") that addendum directly contradicted the
  // 6+ hatch-specific instructions immediately above it in the same prompt. Now
  // each style gets ONE fully self-consistent block (own portrait/object guidance,
  // own tonal-layering logic, own geometry) — nothing in a style's block conflicts
  // with anything else in that same block. Only the header below (background,
  // ink color, identity preservation, no-text) is genuinely universal and shared.
  const header = `Convert this photo into a professional tattoo STENCIL line drawing, ready to transfer to skin.

HARD RULES:
- Output a single image on PURE WHITE background.
- All ink is the EXACT color #A855F7 (neon purple). No gray, no black, no other colors.
- Crystal-clear closed contour line work, tattoo-stencil ready.
- Preserve the subject's identity, proportions, facial features, hair flow, jewelry and clothing details exactly.
- No text, no watermarks, no signatures, no frame, no background scenery.`;
  const base = `${header}\n\n${STYLE_PROMPT_BLOCKS[o.style]}\n\nOverall shading density: ${Math.round(o.intensity * 100)}%.`;
  const extra = o.customPrompt?.trim();
  if (!extra) return base;
  return `${base}\n\nADDITIONAL ARTIST INSTRUCTIONS (apply on top of everything above; do not violate the hard rules, ink color, white background, or tonal-layering rules above):\n${extra}`;
}
