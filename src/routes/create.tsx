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
  Paintbrush,
  Coins,
} from "lucide-react";
import logo from "@/assets/stencil-logo.png";
import { saveStencil } from "@/lib/vault";
import { MasterSuite } from "@/components/master-suite/MasterSuite";
import { runPlugin, BUILTIN_PLUGINS } from "@/lib/plugins";
import { processClassicalPro, type ClassicalProResult } from "@/lib/classical-pro-integration";
import { useHectographEngineV3, STENCIL_V3_PRESETS, type StencilPresetId } from "@/lib/classical-v3/useHectographEngineV3";
import { type HectographV3Config } from "@/lib/classical-v3/engine-api";
import { photoToImageData, imageDataToPngUrl } from "@/lib/classical-v3/prepare-input";
import { stencilToInkLayer } from "@/lib/classical-v3/to-ink-layer";
import { HectographV3Controls } from "@/components/stencil/HectographV3Controls";
import type { TattooabilityResult } from "@/lib/classical-engine/inspector";
// @ts-ignore — ink style panel (optional add-on, collapsed by default)
import { InkStylePanel } from "@/components/InkStylePanel";
// @ts-ignore — font system (self-hosted Font Squirrel fonts)
import { injectSelfHostedFontFaces, preloadAllSelfHostedFonts } from "@/fonts/load-font";
import { renderLetteringToImageData } from "@/fonts/text-to-stencil";
import { toast } from "sonner";
import { CustomPromptPanel } from "@/components/CustomPromptPanel";
import { analyzePhoto, suggestTuning, type TuningSuggestion } from "@/lib/photo-analysis";
import { PhotoAnalysisBanner } from "@/components/PhotoAnalysisBanner";
import {
  type TouchUpGenConfig,
} from "@/lib/touch-up/session";
import { writeHandoff } from "@/lib/touch-up/handoff";
import { supabase } from "@/integrations/supabase/client";
import { useCloudGenerate } from "@/hooks/use-cloud-generate";

/** JSON headers plus the signed-in user's access token, when there is one. */
async function apiHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (t) h.Authorization = `Bearer ${t}`;
  } catch {
    /* signed out — send without a token */
  }
  return h;
}

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create Stencil — AI Stencil Magic" },
      {
        name: "description",
        content:
          "Upload a photo and generate a professional tattoo stencil with 5-tier tonal layering.",
      },
      { property: "og:title", content: "Create Stencil — AI Stencil Magic" },
      { property: "og:description", content: "Generate photo-faithful tattoo stencils in hatching, solid contour, dotwork, or hybrid styles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
type Provider = "openrouter" | "gemini" | "classical" | "hybrid" | "hectograph";
const STYLE_PROMPTS: Record<Style, string> = {
  hatching: [
    "PEN-AND-INK HATCHING / CROSSHATCHING in the manner of a master engraver. Visible line strokes only: NEVER dots, stipple, scribble, wash or solid fill.",
    "CONTOURS: a clean, confident, continuous outline for the silhouette and key interior edges (eyes, lids, lips, nostrils, hair or fur clumps, folds). Line weight swells on the shadow side and thins to nothing on the lit side.",
    "HATCH FIELDS: shade each surface plane with its own set of parallel strokes that FOLLOW THE FORM, wrapping across cheeks, along the jaw and brow, around the muzzle or trunk, along muscle, fabric folds and petal curvature. Inside one plane keep one direction with a gentle curve; change direction between planes. Strokes are hand-drawn: varied in length, tapered at both ends, evenly spaced but never ruler-perfect.",
    "TONE BY SPACING: highlights = no marks at all (white paper). Light tones = single sparse strokes about 6-8 line-widths apart. Midtones = one direction, about 3-4 line-widths apart. Shadows = add a second crossing direction (30-60 degrees from the first), about 2-3 line-widths apart. Only the deepest cores get a third direction or tightly packed strokes, and paper must still show between strokes.",
    "NO MECHANICAL LATTICE: never use a fixed 45/135 degree grid, never repeat one pattern across unrelated areas, avoid moire.",
    "TRANSITIONS: tone melts into white gradually. Strokes widen their spacing, get shorter and thinner, and end in a taper, like a soft gradient. Never draw a line, outline or hard edge where light and shadow meet, and never add lines that are not real edges or form in the photo. Strokes stop just short of the contour on the lit rim so edges stay bright.",
  ].join("\n"),
  solid: [
    "BOLD CLEAN LINE WORK ONLY: no hatching, no stipple, no tonal shading, no fills (except tiny accents: pupils, nostril holes, lash roots, deepest creases).",
    "Closed, continuous, confident contours around every shape, plus interior form lines for the key structure (eye, lids, lips, nose planes, hair or fur clumps, folds, wrinkles, petal veins).",
    "Express depth ONLY with VARIABLE LINE WEIGHT like a brush-pen tattoo outline: heaviest where a form turns into shadow or overlaps another, medium on the silhouette, thin for fine detail, tapering at line ends. Highlights = no line at all (lost edges are welcome on the lit side so the form breathes).",
    "Simplify tiny texture into a few meaningful lines. Lines are smooth: no jitter, no sketchy double lines, no gaps at joins. Hair, fur, beard and fabric = flowing strand or clump outlines, never scribbles. At a lower detail level draw fewer interior lines; at a higher level add more interior form lines, still with no shading.",
  ].join("\n"),
  dotwork: [
    "REAL HAND-STIPPLED DOTWORK (pointillism), the way a tattooer builds tone with single needle taps: tone is made by DOT SPACING, never by lines.",
    "DOTS: every dot is a small, perfectly ROUND, solid, crisp-edged circle of nearly identical size, about 0.4-0.6% of the image width (shadows may use dots up to 1.5x larger). NEVER dust, grain, noise, pixel specks, dithering or halftone screens, hairy fragments or smudged blobs.",
    "PLACEMENT: random yet evenly distributed, like natural blue noise. No rows, diagonals, grid patterns, clumps, holes, chains of dots or moire. Dots do not touch each other except in the very darkest accents, where they may crowd to near-solid but still show specks of paper.",
    "TONE BY DENSITY: highlights = no dots (pure white). Light = widely scattered, about 6-8 dot-diameters apart. Mid-light = 4-5. Midtones = 2.5-3. Dark mids = 1.5-2. Shadows = dots almost touching (about 1.1-1.3 apart). Density follows the 3D form: densest in the turning shadow of cheeks, jaw, eye sockets, under brows, nose and lips, under folds, and thinning smoothly toward the light with a feathered, scattered fall-off, never an abrupt band or hard edge. Skin and fur texture = a few randomly scattered dots.",
    "CONTOURS: thin, clean, continuous lines (about 0.25-0.35% of the width) only on sharp edges and key features (silhouette, eyes, lids, lips, nostrils). Soft form edges are left to dot density alone. No hatching, no crosshatching, no lines used for shading: this is contour line plus dot shading, never pure dots.",
  ].join("\n"),
  hybrid: [
    "HYBRID tattoo stencil: three techniques, each in its own tonal zone, handing over seamlessly. All three must be clearly visible in the same image.",
    "1) CONTOUR LINES everywhere: clean, confident, continuous lines for the silhouette and key features (eyes, lids, lips, nostrils, hair or fur clumps, folds), using the line-weight hierarchy above.",
    "2) FORM-FOLLOWING HATCHING in the dark mids and shadows only: tapered pen strokes that follow the surface curvature; sparse parallel strokes at the edge of a shadow, a second crossing direction only in the deep core; hand-drawn, never a ruler-perfect or fixed 45/135 degree grid.",
    "3) REAL STIPPLE in the light mids and soft transitions: small, round, crisp, equal-size dots (about 0.4-0.6% of the image width), random yet evenly spaced like blue noise (no rows, grids or clumps; never dust or pixel noise), their density falling smoothly from the edge of the hatching to pure white paper.",
    "HAND-OVER: deepest cores = crossing hatching. Shadow edge = hatch strokes shortening, thinning and tapering, then dissolving into stipple that thins to nothing. Light areas = sparse stipple or nothing. Highlights = pure white. No hard line or edge where tone steps from hatching to dots or from shadow to light, and dots never overlap hatch strokes.",
  ].join("\n"),
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Formats /api/generate-stencil accepts. Keep in sync with ALLOWED_MIME on the server.
const SERVER_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Return a data URL the server will accept. PNG, JPEG, and WebP pass through unchanged;
 * any other format the browser can decode (GIF, AVIF, BMP, ...) is re-encoded to PNG.
 * @throws If the file cannot be decoded as an image.
 */
async function fileToServerSafeDataUrl(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  if (SERVER_IMAGE_TYPES.has(file.type)) return dataUrl;
  const img = new Image();
  img.src = dataUrl;
  try {
    await img.decode();
  } catch {
    throw new Error("That image format isn't supported. Please use a PNG, JPEG, or WebP photo.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    throw new Error("That image format isn't supported. Please use a PNG, JPEG, or WebP photo.");
  }
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function dataUrlToInline(dataUrl: string): { mimeType: string; data: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid image data");
  return { mimeType: m[1], data: m[2] };
}

async function normalizeToPurpleInk(dataUrl: string, mode: "binary" | "coverage" = "binary"): Promise<string> {
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
    if (mode === "coverage") {
      const LIGHT = 235, DARK = 140;
      let t = (LIGHT - lum) / (LIGHT - DARK);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const a = Math.round(t * t * (3 - 2 * t) * alpha);
      if (a === 0) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 0; }
      else { d[i] = 168; d[i + 1] = 85; d[i + 2] = 247; d[i + 3] = a; }
    } else if (alpha > 10 && lum < 200) {
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
  const { computeStencilMetrics, computeTattooability } = await import("@/lib/classical-engine/inspector");
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
  const { cloudGenerate, dialog: cloudConsentDialog } = useCloudGenerate();
  const lastGenRef = useRef<TouchUpGenConfig | null>(null);

  // API keys
  const [apiKey, setApiKey] = useState("");
  const [orKey, setOrKey] = useState("");
  const [orModel, setOrModel] = useState("google/gemini-2.5-flash-image");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [orKeyDraft, setOrKeyDraft] = useState("");
  const [provider, setProvider] = useState<Provider>("openrouter");
  // Hectograph V3 (opt-in local worker engine). Independent state: nothing here touches the Classical Pro path.
  const hecto = useHectographEngineV3();
  const [v3PresetId, setV3PresetId] = useState<StencilPresetId | null>("tattoo-clean");
  const [v3Config, setV3Config] = useState<HectographV3Config>(STENCIL_V3_PRESETS["tattoo-clean"].config);
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
  // Opt-in Tonal 3D shading (beta) -- off by default; disabled for Dotwork.
  const [useTonalShading, setUseTonalShading] = useState(false);
  const [tonalStrength, setTonalStrength] = useState(1.0);
  const tonalControls = (
    <>
      <label
        className={`flex items-center gap-2 text-xs cursor-pointer ${style === "dotwork" ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground"}`}
      >
        <input
          type="checkbox"
          checked={useTonalShading && style !== "dotwork"}
          disabled={style === "dotwork"}
          onChange={(e) => setUseTonalShading(e.target.checked)}
          className="accent-primary"
        />
        <span>Tonal 3D shading (beta): hatching that follows the form and matches the photo's tone</span>
      </label>
      {useTonalShading && style !== "dotwork" ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Shading strength</span>
          <input
            type="range"
            min={0.6}
            max={1.4}
            step={0.05}
            value={tonalStrength}
            onChange={(e) => setTonalStrength(Number(e.target.value))}
            className="accent-primary flex-1"
          />
          <span className="tabular-nums w-8 text-right">{tonalStrength.toFixed(2)}</span>
        </label>
      ) : null}
    </>
  );
  // Background separation -- 'keep' by default (fully inert), same
  // optional/off-by-default treatment as Retinex above.
  const [backgroundMode, setBackgroundMode] = useState<"keep" | "remove" | "fade">("keep");
  // Local pre-tuning model: on-device suggestion for Detail/Retinex based on
  // what's actually in the selected photo. Suggestion-only, always
  // dismissible, never auto-applies. Smart Suggestions toggle (default on)
  // lets the user skip this entirely -- when off, analyzePhoto() is never
  // called, so the face-detector model never downloads either.
  const [smartSuggestionsEnabled, setSmartSuggestionsEnabled] = useState(true);
  const [photoSuggestion, setPhotoSuggestion] = useState<TuningSuggestion | null>(null);
  // Guards against a race: if the user picks a second photo while the first
  // photo's analysis is still running, a late-arriving result for the first
  // photo must not get applied to the second.
  const latestPhotoRef = useRef<string | null>(null);


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
    if (p === "openrouter" || p === "gemini" || p === "classical" || p === "hybrid" || p === "hectograph") setProvider(p);
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
    setPhotoSuggestion(null);
    let dataUrl: string;
    try {
      dataUrl = await fileToServerSafeDataUrl(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that image.");
      return;
    }
    setPhoto(dataUrl);
    latestPhotoRef.current = dataUrl;

    if (smartSuggestionsEnabled) {
      const img = new Image();
      img.onload = async () => {
        try {
          const analysis = await analyzePhoto(img);
          // Only apply if this is still the photo currently selected -- the
          // user may have picked a different photo while this ran.
          if (latestPhotoRef.current === dataUrl) {
            setPhotoSuggestion(suggestTuning(analysis));
          }
        } catch (e) {
          console.warn("Photo analysis failed:", e);
        }
      };
      img.onerror = () => console.warn("Photo analysis: image failed to load for analysis");
      img.src = dataUrl;
    }
  }

  async function generate() {
    if (!photo) return;
    if (provider === "gemini" && !apiKey) {
      setKeyOpen(true);
      return;
    }
    // With no OpenRouter key of their own, the user generates with server credits (see cloudGenerate below),
    // so the key modal is no longer forced open here. Their own key, when set, still takes the original path.
    setLoading(true);
    setError(null);
    setStencil(null);
    setInkStyleData(null);
    lastGenRef.current = {
      // Touch-up's engine type predates V3 and nothing branches on it; V3 runs are recorded as local-engine runs.
      engine: provider === "hectograph" ? "classical" : provider,
      style,
      intensity,
      useRetinex,
      backgroundMode,
      useAdvancedPipeline,
    };
    try {
      if (provider === "hectograph") {
        const t0 = performance.now();
        const input = await photoToImageData(photo);
        const rendered = await hecto.renderStencilV3(input, { config: v3Config });
        // The app stores a stencil as ink-in-alpha on transparent. Convert V3's paper-white render to that
        // WITHOUT flattening the tones, so the multi-tone look survives and the tattooability scorer works.
        const inkResult = imageDataToPngUrl(stencilToInkLayer(rendered));
        setStencil(inkResult);
        scoreStencil(inkResult).then(setTattooability).catch(() => setTattooability(null));
        setInkStyleData(null);
        toast.success(`Hectograph V3 (${Math.round(performance.now() - t0)}ms)`);
        setLoading(false);
        return;
      }
      if (provider === "classical") {
        const result = await processClassicalPro(photo, {
          style,
          intensity,
          purpleTint: true,
          useAdvancedPipeline,
          useRetinex,
          useTonalShading: useTonalShading && style !== "dotwork",
          tonalStrength,
          backgroundMode,
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
          useTonalShading: useTonalShading && style !== "dotwork",
          tonalStrength,
          backgroundMode,
        });
        // Step 2: Send classical result to AI for refinement — WITH the
        // original photo included for identity/likeness grounding, since the
        // AI was previously only shown the abstracted line art and had
        // nothing to stay faithful to.
        const { mimeType: cm, data: cB64 } = dataUrlToInline(classicalResult.dataUrl);
        const { mimeType: om, data: oB64 } = dataUrlToInline(photo);
        const hybridPrompt = `${buildPrompt({ style, intensity, customPrompt })}\n\nINPUT IMAGES: Reference image 1 is the ORIGINAL PHOTO and is the only authority for pose, framing, likeness and the position of every feature. Reference image 2 is a pre-processed line-art guide from a classical algorithm: use it only as a hint for where edges and shadows are. Where it disagrees with the photo, the photo wins. Do not copy its noise, speckles, broken lines or mechanical hatching; redraw everything as clean, natural, hand-made marks in the ${style} technique described above.`;
        let hybridDataUrl: string | null = null;
        // Try server-side first (OpenRouter). NOTE: passes both images via an
        // `images` array — generate-stencil.ts needs to read body.images
        // (falling back to the single `image` field) and forward both to the
        // OpenRouter vision call for this to actually use the original photo.
        // Check that server route's current body-parsing before relying on this.
        try {
          const r = await fetch("/api/generate-stencil", {
            method: "POST",
            headers: await apiHeaders(),
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
      if (provider === "openrouter" && !orKey) {
        // No key of their own: generate on the server with credits. null means nothing was produced and the user was told why.
        const cloudUrl = await cloudGenerate({ photo, style, intensity, customPrompt });
        if (!cloudUrl) {
          setLoading(false);
          return;
        }
        const purpleResult = await normalizeToPurpleInk(cloudUrl);
        setStencil(purpleResult);
        scoreStencil(purpleResult).then(setTattooability).catch(() => setTattooability(null));
      } else if (provider === "openrouter") {
        const r = await fetch("/api/generate-stencil", {
          method: "POST",
          headers: await apiHeaders(),
          body: JSON.stringify({
            prompt,
            image: { mimeType, data: imgB64 },
            provider: "openrouter",
            openrouterKey: orKey || undefined,
            model: orModel,
          }),
        });
        const data = await r.json();
        if (r.status === 401 && data?.code === "auth_required") {
          toast.info("Please sign in to use the server AI, or add your own OpenRouter key.");
          navigate({ to: "/auth" });
          setLoading(false);
          return;
        }
        if (r.status === 403 && data?.code === "server_ai_disabled") {
          throw new Error("Server AI is not enabled yet. Add your own OpenRouter or Gemini key to generate.");
        }
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
      const { vectorizeLineLayer } = await import("@/lib/classical-engine/vectorize");
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
      // FIXED 2026-09-05: imagetracerjs IS installed (confirmed via direct
      // import test) and this catch block can fire for other reasons (image
      // load failure, canvas errors) -- the old message claimed a specific,
      // now-incorrect cause. Generic message instead of a wrong diagnosis.
      console.error('[create] SVG export failed', e);
      toast.error("SVG export failed — please try again");
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
      : provider === "hectograph"
        ? "Hectograph V3"
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
      {cloudConsentDialog}
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
            <Link
              to="/touch-up"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Touch-Up Studio"
            >
              <Paintbrush size={14} />
              <span className="hidden sm:inline">Touch-Up</span>
            </Link>
            <Link
              to="/credits"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Credits"
            >
              <Coins size={14} />
              <span className="hidden sm:inline">Credits</span>
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
                    : provider === "classical" || provider === "hectograph"
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
            <button
              onClick={() => selectProvider("hectograph")}
              className={`p-3 rounded-2xl border text-left transition ${provider === "hectograph" ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/50"}`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Sparkles size={14} /> Hectograph V3
              </div>
              <div
                className={`text-[10px] mt-1 ${provider === "hectograph" ? "opacity-90" : "text-muted-foreground"}`}
              >
                Flow engraving, runs locally
              </div>
            </button>
          </div>
          {provider === "hectograph" ? (
            <HectographV3Controls
              config={v3Config}
              onConfigChange={(next) => { setV3Config(next); setV3PresetId(null); }}
              presetId={v3PresetId}
              onPresetChange={(id) => { setV3PresetId(id); setV3Config(STENCIL_V3_PRESETS[id].config); }}
              lastDurationMs={hecto.lastDurationMs}
              disabled={loading}
            />
          ) : null}
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
                  onChange={(e) => { setUseRetinex(e.target.checked); setPhotoSuggestion(null); }}
                  className="accent-primary"
                />
                <span>Fix harsh lighting (illumination normalization)</span>
              </label>
              {tonalControls}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Background:</span>
                <select
                  value={backgroundMode}
                  onChange={(e) => setBackgroundMode(e.target.value as "keep" | "remove" | "fade")}
                  className="bg-background border border-border rounded-lg px-2 py-1 text-xs"
                >
                  <option value="keep">Keep</option>
                  <option value="remove">Remove</option>
                  <option value="fade">Fade</option>
                </select>
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
                  onChange={(e) => { setUseRetinex(e.target.checked); setPhotoSuggestion(null); }}
                  className="accent-primary"
                />
                <span>Fix harsh lighting (illumination normalization)</span>
              </label>
              {tonalControls}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Background:</span>
                <select
                  value={backgroundMode}
                  onChange={(e) => setBackgroundMode(e.target.value as "keep" | "remove" | "fade")}
                  className="bg-background border border-border rounded-lg px-2 py-1 text-xs"
                >
                  <option value="keep">Keep</option>
                  <option value="remove">Remove</option>
                  <option value="fade">Fade</option>
                </select>
              </label>
            </div>
          ) : null}
          {provider === "openrouter" && !orKey ? (
            <div className="mt-3 p-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200">
              No OpenRouter key set. Tap the key icon in the header to add your own key (free to you), or sign in to use cloud credits.
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
          <label className="mt-2 flex items-center gap-2 text-[11px] cursor-pointer text-muted-foreground">
            <input
              type="checkbox"
              checked={smartSuggestionsEnabled}
              onChange={(e) => {
                setSmartSuggestionsEnabled(e.target.checked);
                if (!e.target.checked) setPhotoSuggestion(null);
              }}
              className="accent-primary"
            />
            <span>Smart Suggestions (on-device photo analysis for Detail/lighting tips)</span>
          </label>
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
              onChange={(e) => { setIntensity(Number(e.target.value) / 100); setPhotoSuggestion(null); }}
              className="w-full mt-2 accent-primary"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Controls the 5-tier tonal layering: shadows → dark mids → mids → light mids →
              highlights. Higher density = denser hatching/dots in darker tones.
            </p>
            {photoSuggestion ? (
              <div className="mt-3">
                <PhotoAnalysisBanner
                  suggestion={photoSuggestion}
                  onApply={() => {
                    setIntensity(photoSuggestion.intensity);
                    setUseRetinex(photoSuggestion.useRetinex);
                    setPhotoSuggestion(null);
                  }}
                  onDismiss={() => setPhotoSuggestion(null)}
                />
              </div>
            ) : null}
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
              <button
                onClick={async () => {
                  if (!stencil) return;
                  try {
                    await writeHandoff({
                      stencil,
                      photo,
                      config: lastGenRef.current ?? undefined,
                    });
                    navigate({ to: "/touch-up" });
                  } catch (e) {
                    console.error("[create] touch-up handoff failed", e);
                    toast.error("Couldn't open Touch-Up Studio — please try again");
                  }
                }}
                className="w-full rounded-full border border-border hover:border-primary/50 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2"
              >
                <Paintbrush size={14} /> Open in Touch-Up Studio
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
                Used for the OpenRouter and Hybrid engines. Saved only in your browser; when you generate it is sent through our server to OpenRouter and is never stored on our server. Get a key at{" "}
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
  // v2 (Nov 2026): this base is style-neutral (fidelity, ink, line weight, print rules). ALL technique wording lives in
  // STYLE_PROMPTS so a style can never be contradicted by another style's rules (the old base forced hatch geometry on every style).
  const pct = Math.round(o.intensity * 100);
  const level =
    o.intensity < 0.34
      ? "LIGHT: only the clear shadows and key edges are marked; most of the subject stays white paper."
      : o.intensity < 0.67
        ? "MEDIUM: shadows and midtones are marked; lights and highlights stay white."
        : "RICH: full tonal range with deep, dense shadows, while every highlight stays white and every mark stays separate.";
  const base = [
    "TASK: Trace the supplied photo into a professional tattoo STENCIL (transfer line art). This is TRACING, not redrawing: treat the photo as a light-table underlay and put every mark exactly on top of what the photo shows.",
    "",
    "FIDELITY - NON-NEGOTIABLE (the result will be checked by overlaying it on the photo):",
    "- Same subject, pose, camera angle, head tilt, gaze direction and expression. Never re-pose, rotate, mirror, flip, straighten, smile, frown, beautify, age or idealise anything.",
    "- Same framing and crop: keep the subject at the same size and position, let it run off the canvas edges wherever the photo does, and do not zoom out, shrink, re-centre or complete cut-off parts. Keep the photo's aspect ratio and orientation.",
    "- Every feature stays exactly where the photo has it (eyes, brows, nose, mouth, teeth, ears, wrinkles, scars, freckles, moles, hair parting and strand flow, jewelry, clothing folds, petals, feathers, scales, tusks, paws). Same count, proportions and asymmetries. Do not invent, remove, add or 'fix' anything, and keep the light coming from the same direction so shadows fall on the same side.",
    "- Where the photo is unclear, copy what is visible; never substitute a generic face, animal or object. Likeness to THIS photo outranks style and prettiness. If the photo is itself a drawing, painting or render, trace that artwork faithfully instead of reinterpreting it.",
    "- Draw the subject only. Background = pure white: no scenery, backdrop, ground shadow, frame or border.",
    "",
    "INK: ONE flat color only, exactly #A855F7 (neon purple), 100% opaque, on pure white #FFFFFF. No black, gray, lighter tints, gradients, transparency, glow, blur, grain or paper texture. Tone is made ONLY by the density, spacing and weight of marks, never by lighter color. Every mark must be razor sharp with clean edges, because the result is thresholded and thermal-printed and faint or soft marks are lost.",
    "",
    "LINE-WEIGHT HIERARCHY (judge by the image size, not by pixels):",
    "- Primary contour (silhouette, eyelids, lips, nostrils, main form edges): confident medium weight, about 0.35-0.5% of the image width, tapering at the ends.",
    "- Interior detail (wrinkles, hair strands, fold lines): fine, about 0.2-0.3% of the width.",
    "- Shading marks: finest, about 0.15-0.25% of the width.",
    "- Accents only (pupils, nostril holes, lash roots, deepest creases): up to about 0.7% of the width.",
    "- Nothing thinner than 0.15% of the width (it will not print). No stray specks, dust or fragments.",
    "",
    "SUBJECT HANDLING:",
    "- Faces: the eyes are the focal point. Draw the iris ring and pupil, leave the catchlight as white paper, make the upper lid line heavier than the lower, lashes as a few tapered flicks. Lips: a parting line plus a few form lines. Nose: its shadow side and nostril, never an outline all the way round. Pores and freckles only as sparse marks.",
    "- Hair, fur, beard: grouped strands that follow the growth direction in flowing, tapered bundles with white gaps between them; never a solid mass.",
    "- Wrinkled skin, scales, bark, petals, fabric: draw the creases as contour lines, then mark the shadow side of each form. Do not outline every highlight.",
    "",
    "PRINT READINESS (hectograph / thermal stencil paper, then transfer to skin): edges are continuous unbroken lines; separate marks keep a clear white gap of at least 1.5x the mark width so neighbours never merge or blot; no tiny closed holes or slivers; no large solid black fills; leave a little white margin around the subject.",
    "",
    `STYLE: ${o.style.toUpperCase()}`,
    STYLE_PROMPTS[o.style],
    "",
    `Detail / shading level: ${pct}% (${level})`,
    "Output exactly ONE image. No text, letters, numbers, watermark, signature, caption, color swatch, border or frame.",
  ].join("\n");
  const extra = o.customPrompt?.trim();
  if (!extra) return base;
  return `${base}\n\nADDITIONAL ARTIST INSTRUCTIONS (apply on top of everything above; never violate the fidelity rules, the ink color, the white background or the style technique above):\n${extra}`;
}
