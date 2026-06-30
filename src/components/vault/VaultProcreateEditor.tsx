import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  X, Save, Undo2, Redo2, Eraser, Hand, Pipette, RotateCcw, Maximize2,
  Droplet, Wind, Sparkles, Contrast, Thermometer, Grid3x3, Image as ImageIcon, Eye, EyeOff,
  ChevronRight, ChevronLeft, Settings2, Brush as BrushIcon, Minimize2, Wand2,
  Crop, Rocket, Type as TypeIcon, Stamp, Wand, Sliders, History, Activity,
  Pen, Check,
} from "lucide-react";
import { saveDocument, saveEditorState, type DocumentData, type EditorState, type LayerState } from "@/lib/localDB";
import { runOp } from "@/lib/worker-bridge";
import { lanczosResize } from "@/lib/lanczos-bridge";
import { toast } from "sonner";
import {
  DEFAULTS, BRUSH_LABELS, beginStroke, endStroke, strokeTo,
  type BrushId, type BrushSettings, type StrokeContext,
} from "@/lib/brushes";
import {
  buildCurveLUT, buildLevelsLUT, applyLUT, lumaHistogram,
  CURVES_PRESETS, LEVELS_PRESETS, type LevelsParams, type CurvePoint,
} from "@/lib/curves-levels";
import {
  magicWand, refineMask, invertMask, maskToOverlayCanvas, maskToAlphaCanvas,
  type WandResult,
} from "@/lib/magic-wand";
import { useAutosavePrefs } from "@/hooks/use-autosave-prefs";
import { AutosaveSettings } from "./AutosaveSettings";
import { PicsartDock, type PicsartDockHandlers } from "./PicsartDock";
import * as PF from "@/lib/picsart-filters";
import { useNavigate } from "@tanstack/react-router";

type Props = {
  doc: DocumentData;
  onClose: () => void;
  onSaved: () => void;
};

const BRUSH_ORDER: BrushId[] = [
  "hard-round", "soft-airbrush", "fine-liner", "ink-pen", "wet-ink",
  "calligraphy", "marker", "charcoal", "noise-grain",
  "dotwork", "stipple", "crosshatch", "spray", "eraser",
  // Tranche 1 — tattoo + pro
  "tattoo-liner-3rl", "tattoo-liner-9rl", "tattoo-mag-7", "tattoo-mag-13",
  "tattoo-curved-mag", "whip-shading", "pepper-shading", "smooth-shader",
  "blood-spatter", "watercolor-wash", "halftone-dots", "pencil-2b",
  "gel-pen", "neon-glow", "chalk",
  // Tranche 2 — inking / sketching / painting / FX
  "technical-pen", "brush-pen", "dip-pen", "fountain-pen",
  "hb-pencil", "pencil-6b", "colored-pencil", "conte-crayon",
  "oil-flat", "oil-round", "palette-knife", "gouache",
  "acrylic-dry", "pastel-soft",
  "glitch-stripe", "chromatic-fringe", "bokeh-dots",
  "stars-sparkle", "lightning-bolt", "smoke-puff", "confetti",
];

const PALETTE = [
  "#000000", "#1a1a1a", "#404040", "#737373", "#a3a3a3", "#d4d4d4", "#ffffff",
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a", "#0d9488",
  "#0284c7", "#2563eb", "#7c3aed", "#c026d3", "#db2777", "#9f1239", "#78350f",
];

type Tool = "brush" | "eraser" | "pan" | "eyedrop";
type EliteTool = "smudge" | "liquify-push" | "liquify-inflate" | "liquify-deflate" | "stipple" | "clone" | "wand" | "heal";
type Symmetry = "none" | "mirror-x" | "mirror-y" | "radial-8";

/** Detect coarse pointer / Android to throttle pixel-heavy ops harder. */
const IS_MOBILE = typeof window !== "undefined"
  && (window.matchMedia?.("(pointer: coarse)").matches
    || /Android|iPhone|iPad/i.test(navigator.userAgent || ""));
const ELITE_THROTTLE_MS = IS_MOBILE ? 33 : 16; // ~30 vs ~60 fps cap

/** Dense-brush spacing: smaller spacing for hard-edge brushes to avoid
 *  banding, larger for soft scatter brushes for speed. Returns px between
 *  stamps as a fraction of brush diameter. */
export function getDynamicSpacing(brush: BrushId, size: number): number {
  const dense: BrushId[] = [
    "hard-round", "fine-liner", "ink-pen", "wet-ink", "tattoo-liner-3rl",
    "tattoo-liner-9rl", "technical-pen", "dip-pen", "gel-pen", "marker",
  ];
  const sparse: BrushId[] = ["spray", "stipple", "dotwork", "noise-grain", "halftone-dots"];
  const base = dense.includes(brush) ? 0.08 : sparse.includes(brush) ? 0.45 : 0.18;
  // Big brushes can step further w/o visible banding
  const scale = size > 60 ? 1.35 : size > 28 ? 1.1 : 1.0;
  return Math.max(0.5, size * base * scale);
}

// Canvas size presets (Picsart-style)
const SIZE_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: "stencil",   label: "Tattoo Stencil 1024", w: 1024, h: 1024 },
  { id: "square2k",  label: "Square 2048",         w: 2048, h: 2048 },
  { id: "portrait",  label: "Portrait 1080×1920",  w: 1080, h: 1920 },
  { id: "landscape", label: "Landscape 1920×1080", w: 1920, h: 1080 },
  { id: "a4",        label: "A4 Print 2480×3508",  w: 2480, h: 3508 },
  { id: "max6k",     label: "6K Max 6144×6144",    w: 6144, h: 6144 },
];

// --- 500-brush variant matrix (50 bases × 10 modulations) -------------------
type BrushVariant = {
  vid: string;
  base: BrushId;
  label: string;
  sizeMul: number;
  opacityMul: number;
  scatter: number; // extra radial jitter (px) per stamp
};
const MODIFIERS: { tag: string; sizeMul: number; opacityMul: number; scatter: number }[] = [
  { tag: "Original",    sizeMul: 1.00, opacityMul: 1.00, scatter: 0  },
  { tag: "Fine",        sizeMul: 0.55, opacityMul: 0.95, scatter: 0  },
  { tag: "Heavy",       sizeMul: 1.85, opacityMul: 1.00, scatter: 0  },
  { tag: "Ghost",       sizeMul: 1.00, opacityMul: 0.35, scatter: 0  },
  { tag: "Bold",        sizeMul: 1.30, opacityMul: 1.00, scatter: 0  },
  { tag: "Scatter",     sizeMul: 1.00, opacityMul: 0.85, scatter: 8  },
  { tag: "Wide Spray",  sizeMul: 1.45, opacityMul: 0.70, scatter: 14 },
  { tag: "Whisper",     sizeMul: 0.75, opacityMul: 0.25, scatter: 2  },
  { tag: "XL Heavy",    sizeMul: 2.40, opacityMul: 0.95, scatter: 4  },
  { tag: "Micro Stipple", sizeMul: 0.40, opacityMul: 0.80, scatter: 6  },
];

/** Two-finger pinch + pan, single-pointer draw. Matrix-based transform so
 *  zoom anchors stay locked to the midpoint between the fingers — no drift. */
export function VaultProcreateEditor({ doc, onClose, onSaved }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const refCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const refCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const refFileInput = useRef<HTMLInputElement | null>(null);
  const strokeRefs = useRef<StrokeContext[]>([]);
  const stabPt = useRef<{ x: number; y: number; p: number } | null>(null);
  const lastCanvasPt = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const [brushId, setBrushId] = useState<BrushId>("hard-round");
  const [variantIdx, setVariantIdx] = useState(0); // 0..9
  const [tool, setTool] = useState<Tool>("brush");
  const [eliteTool, setEliteTool] = useState<EliteTool | null>(null);
  const [symmetry, setSymmetry] = useState<Symmetry>("none");
  const [stabilizer, setStabilizer] = useState(0.5); // 0..0.9 EMA weight toward target
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(18);
  const [opacity, setOpacity] = useState(1);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [brushQuery, setBrushQuery] = useState("");
  const viewRef = useRef(view);
  viewRef.current = view;
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [refLoaded, setRefLoaded] = useState(false);
  const [refOpacity, setRefOpacity] = useState(0.4);
  const [refVisible, setRefVisible] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAgo, setSavedAgo] = useState<number | null>(null);
  const autosaveDirty = useRef<boolean>(false);
  const autosave = useAutosavePrefs();
  const lastVelocity = useRef(0);
  const lastMoveTs = useRef(0);
  const cloneSourceRef = useRef<{ x: number; y: number } | null>(null);
  const cloneOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  /** Pending pointer sample for RAF-batched draw flush. */
  const pendingDraw = useRef<Pt | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const lastEliteTs = useRef(0);
  const [curvedText, setCurvedText] = useState(false);
  const [textRadius, setTextRadius] = useState(180);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showProMenu, setShowProMenu] = useState(false);
  const [upscaleBusy, setUpscaleBusy] = useState<number | null>(null);
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [textSize, setTextSize] = useState(72);

  // Curves/Levels modal + selection
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustTab, setAdjustTab] = useState<"curves" | "levels">("curves");
  const [curvePreset, setCurvePreset] = useState<keyof typeof CURVES_PRESETS>("Stencil Clean");
  const [levels, setLevels] = useState<LevelsParams>(LEVELS_PRESETS["Stencil Clean"]);
  const [adjustPreview, setAdjustPreview] = useState(true);
  const previewLUT = useRef<Uint8ClampedArray | null>(null);
  const preAdjustSnapshot = useRef<ImageData | null>(null);

  // Magic wand selection
  const [selection, setSelection] = useState<WandResult | null>(null);
  const selectionRef = useRef<WandResult | null>(null);
  selectionRef.current = selection;
  const selOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const [wandTolerance, setWandTolerance] = useState(32);
  const [wandContiguous, setWandContiguous] = useState(true);
  const [wandExpand, setWandExpand] = useState(0);
  const [wandFeather, setWandFeather] = useState(0);
  const wandBaseRef = useRef<WandResult | null>(null); // pre-refine seed

  // History timeline
  const [showHistory, setShowHistory] = useState(false);
  const historyThumbs = useRef<string[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  // Drawer + HUD state machines (Procreate-style collapsible workspace)
  // Panels start collapsed — they only appear when the user taps an edge tab.
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const lastTapRef = useRef(0);

  /** Picsart-first shell. The Procreate engine columns are gated behind
   *  Draw mode and only mount when the user taps "Draw" in the dock. */
  const [drawMode, setDrawMode] = useState(false);

  /** Interactive crop overlay (in canvas-pixel coordinates). */
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropAspect, setCropAspect] = useState<"free" | "1:1" | "4:5" | "16:9" | "9:16">("free");

  const enterDrawMode = useCallback(() => {
    setDrawMode(true);
    setLeftOpen(true);
    setRightOpen(true);
    setHeaderVisible(true);
    setTool("brush");
    setEliteTool(null);
  }, []);
  const exitDrawMode = useCallback(() => {
    setDrawMode(false);
    setLeftOpen(false);
    setRightOpen(false);
    setEliteTool(null);
  }, []);

  const collapseAll = useCallback(() => {
    const anyOpen = leftOpen || rightOpen || headerVisible;
    setLeftOpen(!anyOpen);
    setRightOpen(!anyOpen);
    setHeaderVisible(!anyOpen);
  }, [leftOpen, rightOpen, headerVisible]);

  // Tab key toggles all chrome
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "Tab") { e.preventDefault(); collapseAll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapseAll]);

  // Whether sidebars should fade out for stylus painting
  const fadeChrome = immersive && isInteracting;

  // ---- Init canvas from doc -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctxRef.current = ctx;
    const refCanvas = refCanvasRef.current!;
    const refCtx = refCanvas.getContext("2d", { willReadFrequently: true })!;
    refCtxRef.current = refCtx;
    // Speed: never resample on draw; brushes should write exact pixels.
    ctx.imageSmoothingEnabled = false;
    refCtx.imageSmoothingEnabled = false;

    // Prefer restoring full layered editor state (autosave); fall back to the
    // original AI image. Layer 0 = Reference, Layer 1 = Stencil/drawing.
    let layers: LayerState[] | null = null;
    if (doc.layeredEditorData) {
      try { layers = (JSON.parse(doc.layeredEditorData) as EditorState).layers; }
      catch { layers = null; }
    }

    const stencilSrc = layers?.find(l => l.name === "Stencil")?.dataUrl
      ?? doc.originalAIImage ?? doc.thumbnail;
    const refSrc = layers?.find(l => l.name === "Reference")?.dataUrl ?? null;

    const loadInto = (target: HTMLCanvasElement, targetCtx: CanvasRenderingContext2D, src: string | null, fillWhite: boolean) =>
      new Promise<void>((resolve) => {
        if (!src) { resolve(); return; }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (fillWhite) {
            target.width = img.naturalWidth || 1024;
            target.height = img.naturalHeight || 1024;
            targetCtx.fillStyle = "#ffffff";
            targetCtx.fillRect(0, 0, target.width, target.height);
          }
          targetCtx.drawImage(img, 0, 0);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });

    (async () => {
      // Stencil layer drives the document size.
      await loadInto(canvas, ctx, stencilSrc, true);
      if (!canvas.width) { canvas.width = 1024; canvas.height = 1024; ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,1024,1024); }
      refCanvas.width = canvas.width;
      refCanvas.height = canvas.height;
      if (refSrc) {
        await loadInto(refCanvas, refCtx, refSrc, false);
        setRefLoaded(true);
      }
      fitToScreen();
      pushUndo();
      if (layers) toast.success("Restored from autosave");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const fitToScreen = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const padding = 24;
    const aw = wrap.clientWidth - padding * 2;
    const ah = wrap.clientHeight - padding * 2;
    const s = Math.min(aw / canvas.width, ah / canvas.height);
    const scale = s > 0 ? s : 1;
    setView({
      scale,
      x: (wrap.clientWidth - canvas.width * scale) / 2,
      y: (wrap.clientHeight - canvas.height * scale) / 2,
    });
  }, []);

  // Re-fit on window resize. Canvas backing buffers are unchanged → drawing is preserved.
  useEffect(() => {
    const onResize = () => fitToScreen();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [fitToScreen]);

  // ---- Reference image (Layer 0) -------------------------------------------
  function onPickRefImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const refCtx = refCtxRef.current!;
      const rc = refCanvasRef.current!;
      refCtx.clearRect(0, 0, rc.width, rc.height);
      // Fit reference image inside the document canvas, centered.
      const s = Math.min(rc.width / img.naturalWidth, rc.height / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      refCtx.drawImage(img, (rc.width - w) / 2, (rc.height - h) / 2, w, h);
      setRefLoaded(true);
      setRefVisible(true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  function clearRefImage() {
    const refCtx = refCtxRef.current; const rc = refCanvasRef.current;
    if (refCtx && rc) refCtx.clearRect(0, 0, rc.width, rc.height);
    setRefLoaded(false);
  }

  // ---- Undo/redo ------------------------------------------------------------
  function pushUndo() {
    const ctx = ctxRef.current; if (!ctx) return;
    const snap = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    undoStack.current.push(snap);
    // 6K safeguard: cap by total bytes (≈384MB) AND step count.
    const MAX_BYTES = 384 * 1024 * 1024;
    const MAX_STEPS = 60;
    let total = 0;
    for (const s of undoStack.current) total += s.data.byteLength;
    while (undoStack.current.length > 1 && (total > MAX_BYTES || undoStack.current.length > MAX_STEPS)) {
      const dropped = undoStack.current.shift()!;
      total -= dropped.data.byteLength;
      historyThumbs.current.shift();
    }
    // Thumbnail for history timeline
    try {
      const tc = document.createElement("canvas");
      const TW = 64;
      const ratio = ctx.canvas.height / ctx.canvas.width;
      tc.width = TW; tc.height = Math.max(24, Math.round(TW * ratio));
      tc.getContext("2d")!.drawImage(ctx.canvas, 0, 0, tc.width, tc.height);
      historyThumbs.current.push(tc.toDataURL("image/jpeg", 0.55));
    } catch { historyThumbs.current.push(""); }
    setHistoryTick(t => t + 1);
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
    scheduleAutosave();
  }

  /** Jump history to a given undo-stack index (non-destructive timeline scrub). */
  function jumpHistory(index: number) {
    const ctx = ctxRef.current; if (!ctx) return;
    const i = Math.max(0, Math.min(undoStack.current.length - 1, index));
    // Move all snapshots after i into redo stack (keeps them reachable)
    while (undoStack.current.length - 1 > i) {
      const s = undoStack.current.pop()!;
      redoStack.current.push(s);
      historyThumbs.current.pop();
    }
    ctx.putImageData(undoStack.current[i], 0, 0);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(redoStack.current.length > 0);
    setHistoryTick(t => t + 1);
  }

  // ---- Autosave (debounced 3s, also on visibilitychange/beforeunload) -------
  const autosaveNow = useCallback(async () => {
    const canvas = canvasRef.current; const refCanvas = refCanvasRef.current;
    if (!canvas) return;
    setSaveState("saving");
    try {
      const stencilUrl = canvas.toDataURL("image/png");
      const refUrl = refLoaded && refCanvas ? refCanvas.toDataURL("image/png") : "";
      const editorState: EditorState = {
        width: canvas.width,
        height: canvas.height,
        activeLayerId: "stencil",
        layers: [
          ...(refUrl ? [{
            id: "reference", name: "Reference" as const,
            visible: refVisible, locked: true, alphaLock: false, clipping: false,
            opacity: refOpacity, blendMode: "normal" as const, dataUrl: refUrl,
          } satisfies LayerState] : []),
          {
            id: "stencil", name: "Stencil",
            visible: true, locked: false, alphaLock: false, clipping: false,
            opacity: 1, blendMode: "normal", dataUrl: stencilUrl,
          },
        ],
      };
      // Lightweight thumbnail (~512px wide).
      const tc = document.createElement("canvas");
      const TW = 384;
      const ratio = canvas.height / canvas.width;
      tc.width = TW; tc.height = Math.round(TW * ratio);
      tc.getContext("2d")!.drawImage(canvas, 0, 0, tc.width, tc.height);
      const thumb = tc.toDataURL("image/jpeg", 0.7);
      await saveEditorState(doc.id, editorState, thumb);
      setSaveState("saved");
      setSavedAgo(Date.now());
    } catch (err) {
      console.error("[editor] autosave failed", err);
      setSaveState("error");
    }
  }, [doc.id, refLoaded, refVisible, refOpacity]);

  /** Mark the canvas dirty; the periodic flusher will pick it up. */
  function scheduleAutosave() { autosaveDirty.current = true; }

  /** Manual save bypasses interval + dirty check. */
  const saveNow = useCallback(async () => {
    autosaveDirty.current = false;
    await autosaveNow();
  }, [autosaveNow]);

  // Interval-based autosave driven by user preferences.
  useEffect(() => {
    if (!autosave.enabled) return;
    const id = window.setInterval(() => {
      if (autosaveDirty.current) {
        autosaveDirty.current = false;
        autosaveNow();
      }
    }, Math.max(60_000, autosave.intervalMs));
    return () => window.clearInterval(id);
  }, [autosave.enabled, autosave.intervalMs, autosaveNow]);

  // Safety-net flush on tab hide / unload — runs regardless of the toggle so
  // the user never loses work just because they switched apps on mobile.
  useEffect(() => {
    const flushIfDirty = () => { if (autosaveDirty.current) { autosaveDirty.current = false; autosaveNow(); } };
    const onVis = () => { if (document.visibilityState === "hidden") flushIfDirty(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", flushIfDirty);
    window.addEventListener("pagehide", flushIfDirty);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", flushIfDirty);
      window.removeEventListener("pagehide", flushIfDirty);
    };
  }, [autosaveNow]);

  // tick the "Saved 12s ago" label
  useEffect(() => {
    const t = window.setInterval(() => { if (savedAgo) setSavedAgo(s => s); }, 5000);
    return () => window.clearInterval(t);
  }, [savedAgo]);
  function doUndo() {
    const ctx = ctxRef.current; if (!ctx) return;
    if (undoStack.current.length < 2) return;
    const cur = undoStack.current.pop()!;
    redoStack.current.push(cur);
    historyThumbs.current.pop();
    ctx.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(true);
    setHistoryTick(t => t + 1);
  }
  function doRedo() {
    const ctx = ctxRef.current; if (!ctx) return;
    const next = redoStack.current.pop();
    if (!next) return;
    ctx.putImageData(next, 0, 0);
    undoStack.current.push(next);
    // rebuild thumb
    try {
      const tc = document.createElement("canvas");
      const TW = 64; const ratio = ctx.canvas.height / ctx.canvas.width;
      tc.width = TW; tc.height = Math.max(24, Math.round(TW * ratio));
      tc.getContext("2d")!.drawImage(ctx.canvas, 0, 0, tc.width, tc.height);
      historyThumbs.current.push(tc.toDataURL("image/jpeg", 0.55));
    } catch { historyThumbs.current.push(""); }
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    setHistoryTick(t => t + 1);
  }

  // ---- Pointer / gesture handling ------------------------------------------
  type Pt = { id: number; cx: number; cy: number; pressure: number; type: string };
  const pointers = useRef<Map<number, Pt>>(new Map());
  const pinchStart = useRef<{
    dist: number; midX: number; midY: number;
    view: { x: number; y: number; scale: number };
  } | null>(null);
  const drawingPointerId = useRef<number | null>(null);

  function screenToCanvas(cx: number, cy: number) {
    const wrap = wrapRef.current!;
    const rect = wrap.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (cx - rect.left - v.x) / v.scale,
      y: (cy - rect.top - v.y) / v.scale,
    };
  }

  function symmetryPoints(x: number, y: number): { x: number; y: number }[] {
    const c = ctxRef.current!.canvas;
    const cx = c.width / 2, cy = c.height / 2;
    if (symmetry === "none") return [{ x, y }];
    if (symmetry === "mirror-x") return [{ x, y }, { x: 2 * cx - x, y }];
    if (symmetry === "mirror-y") return [{ x, y }, { x, y: 2 * cy - y }];
    // radial-8
    const out: { x: number; y: number }[] = [];
    const dx = x - cx, dy = y - cy;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const cos = Math.cos(a), sin = Math.sin(a);
      out.push({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos });
    }
    return out;
  }

  function beginDraw(p: Pt) {
    const ctx = ctxRef.current!;
    const variant = MODIFIERS[variantIdx];
    const settings: BrushSettings = {
      ...DEFAULTS[brushId],
      id: tool === "eraser" ? "eraser" : brushId,
      color,
      size: Math.max(1, size * variant.sizeMul),
      opacity: Math.max(0.02, Math.min(1, opacity * variant.opacityMul)),
    };
    const { x, y } = screenToCanvas(p.cx, p.cy);
    stabPt.current = { x, y, p: p.pressure };
    const pts = symmetryPoints(x, y);
    strokeRefs.current = pts.map(() => beginStroke(ctx, settings));
    pts.forEach((pt, i) => strokeTo(strokeRefs.current[i], pt.x + jitter(variant.scatter), pt.y + jitter(variant.scatter), p.pressure));
  }
  function continueDraw(p: Pt) {
    if (!strokeRefs.current.length) return;
    // RAF batch: only the latest sample is processed per frame. The previous
    // implementation drew on every pointermove (often 120+ Hz on Pixel/iOS),
    // which created jank with dense brushes. We drop intermediate moves; the
    // EMA stabilizer below still smooths the visible stroke.
    pendingDraw.current = p;
    if (drawRafRef.current !== null) return;
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;
      const sample = pendingDraw.current;
      pendingDraw.current = null;
      if (!sample || !strokeRefs.current.length) return;
      flushDraw(sample);
    });
  }
  function flushDraw(p: Pt) {
    const target = screenToCanvas(p.cx, p.cy);
    // EMA stabilizer: move stab point a fraction toward target each event
    const s = stabPt.current ?? { x: target.x, y: target.y, p: p.pressure };
    const w = 1 - stabilizer; // higher slider = slower follow = smoother
    s.x += (target.x - s.x) * w;
    s.y += (target.y - s.y) * w;
    s.p += (p.pressure - s.p) * 0.5;
    stabPt.current = s;
    const variant = MODIFIERS[variantIdx];
    const pts = symmetryPoints(s.x, s.y);
    pts.forEach((pt, i) => {
      const sr = strokeRefs.current[i];
      if (sr) strokeTo(sr, pt.x + jitter(variant.scatter), pt.y + jitter(variant.scatter), s.p);
    });
  }
  function endDraw() {
    if (drawRafRef.current !== null) { cancelAnimationFrame(drawRafRef.current); drawRafRef.current = null; }
    if (pendingDraw.current) { flushDraw(pendingDraw.current); pendingDraw.current = null; }
    if (strokeRefs.current.length) {
      strokeRefs.current.forEach(endStroke);
      strokeRefs.current = [];
      stabPt.current = null;
      pushUndo();
    }
  }
  function jitter(amt: number) { return amt ? (Math.random() - 0.5) * 2 * amt : 0; }

  // ---- Elite engines (B Stippler, C Smudge, D Liquify) ---------------------
  function applyEliteAt(cx: number, cy: number, dx: number, dy: number) {
    if (!eliteTool) return;
    if (eliteTool === "clone") { cloneStampAt(cx, cy); return; }
    if (eliteTool === "heal") { healAt(cx, cy); return; }
    const ctx = ctxRef.current!;
    const { x, y } = screenToCanvas(cx, cy);
    const r = Math.max(6, size * 1.5);
    const ix = Math.floor(x - r), iy = Math.floor(y - r);
    const w = Math.ceil(r * 2), h = Math.ceil(r * 2);
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (ix + w < 0 || iy + h < 0 || ix > W || iy > H) return;
    const sx = Math.max(0, ix), sy = Math.max(0, iy);
    const sw = Math.min(W - sx, w - (sx - ix));
    const sh = Math.min(H - sy, h - (sy - iy));
    if (sw <= 0 || sh <= 0) return;

    if (eliteTool === "stipple") {
      // Engine B: procedural whip stippler with velocity falloff
      const v = Math.min(60, Math.hypot(dx, dy));
      const density = Math.max(4, Math.floor(20 - v * 0.25));
      ctx.save();
      ctx.fillStyle = color;
      for (let i = 0; i < density; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * r * Math.exp(-Math.random() * 1.2);
        const px = x + Math.cos(ang) * rad;
        const py = y + Math.sin(ang) * rad;
        ctx.globalAlpha = opacity * (0.4 + Math.random() * 0.6);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, size * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    const src = ctx.getImageData(sx, sy, sw, sh);
    const out = ctx.createImageData(sw, sh);
    const data = src.data, od = out.data;
    const cxL = x - sx, cyL = y - sy;

    if (eliteTool === "smudge") {
      // Engine C: linear-interpolated color drag
      const blend = Math.min(0.85, opacity);
      for (let py = 0; py < sh; py++) {
        for (let px = 0; px < sw; px++) {
          const ddx = px - cxL, ddy = py - cyL;
          const dist = Math.hypot(ddx, ddy);
          const f = dist < r ? (1 - dist / r) * blend : 0;
          const sxs = Math.round(px - dx * f);
          const sys = Math.round(py - dy * f);
          const idx = (py * sw + px) * 4;
          if (sxs >= 0 && sxs < sw && sys >= 0 && sys < sh) {
            const sIdx = (sys * sw + sxs) * 4;
            od[idx]   = data[idx]   * (1 - f) + data[sIdx]   * f;
            od[idx+1] = data[idx+1] * (1 - f) + data[sIdx+1] * f;
            od[idx+2] = data[idx+2] * (1 - f) + data[sIdx+2] * f;
            od[idx+3] = data[idx+3] * (1 - f) + data[sIdx+3] * f;
          } else {
            od[idx]=data[idx]; od[idx+1]=data[idx+1]; od[idx+2]=data[idx+2]; od[idx+3]=data[idx+3];
          }
        }
      }
    } else {
      // Engine D: liquify mesh lattice (push / inflate / deflate) — quadratic falloff
      const strength = opacity * 0.9;
      for (let py = 0; py < sh; py++) {
        for (let px = 0; px < sw; px++) {
          const ddx = px - cxL, ddy = py - cyL;
          const dist = Math.hypot(ddx, ddy);
          const t = dist < r ? 1 - (dist / r) * (dist / r) : 0;
          let ox = px, oy = py;
          if (t > 0) {
            if (eliteTool === "liquify-push") {
              ox = px - dx * t * strength;
              oy = py - dy * t * strength;
            } else if (eliteTool === "liquify-inflate") {
              const k = 1 + t * strength * 0.6;
              ox = cxL + ddx / k;
              oy = cyL + ddy / k;
            } else { // deflate
              const k = 1 - t * strength * 0.6;
              ox = cxL + ddx / Math.max(0.2, k);
              oy = cyL + ddy / Math.max(0.2, k);
            }
          }
          const sxs = Math.max(0, Math.min(sw - 1, Math.round(ox)));
          const sys = Math.max(0, Math.min(sh - 1, Math.round(oy)));
          const idx = (py * sw + px) * 4;
          const sIdx = (sys * sw + sxs) * 4;
          od[idx]=data[sIdx]; od[idx+1]=data[sIdx+1]; od[idx+2]=data[sIdx+2]; od[idx+3]=data[sIdx+3];
        }
      }
    }
    ctx.putImageData(out, sx, sy);
  }

  // ---- Post-process filters -----------------------------------------------
  // Filters now run in a Web Worker (editor-worker.ts) so the main thread
  // stays at ~60fps even on 4K canvases.
  async function runWorkerOp(op: Parameters<typeof runOp>[0], label: string) {
    const ctx = ctxRef.current; if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    // Clone the bitmap (the worker transfers ownership of the buffer).
    const src = ctx.getImageData(0, 0, w, h);
    const cloned = new ImageData(new Uint8ClampedArray(src.data), w, h);
    const t0 = performance.now();
    try {
      const out = await runOp({ ...op, data: cloned } as Parameters<typeof runOp>[0]);
      ctx.putImageData(out, 0, 0);
      pushUndo();
      const ms = Math.round(performance.now() - t0);
      toast.success(`${label} · ${ms}ms`);
    } catch (err) {
      console.error("[editor] worker op failed", err);
      toast.error(`${label} failed`);
    }
  }
  function applyThreshold(level = 128) { runWorkerOp({ op: "threshold", data: null as never, level }, "Threshold"); }
  function applyThermal()               { runWorkerOp({ op: "thermal-purple", data: null as never }, "Thermal Purple"); }
  function applyThermalBlueCarbon()     { runWorkerOp({ op: "thermal-blue", data: null as never }, "Thermal Blue Carbon"); }

  /** One-click: Otsu auto-threshold + morphological clean (open then close)
   *  to produce a crisp pure-line stencil ready for the thermal printer. */
  async function applyStencilOptimizer() {
    const ctx = ctxRef.current; if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const t0 = performance.now();
    setSaveState("saving");
    try {
      const src = ctx.getImageData(0, 0, w, h);
      const clone = (d: ImageData) => new ImageData(new Uint8ClampedArray(d.data), d.width, d.height);
      let buf = await runOp({ op: "otsu", data: clone(src) });
      buf = await runOp({ op: "morph", data: clone(buf), passes: 1, kind: "open" });
      buf = await runOp({ op: "morph", data: clone(buf), passes: 1, kind: "close" });
      ctx.putImageData(buf, 0, 0);
      pushUndo();
      toast.success(`Stencil optimized · ${Math.round(performance.now() - t0)}ms`);
    } catch (err) {
      console.error("[editor] optimizer failed", err);
      toast.error("Optimizer failed");
    }
  }

  function eyedropAt(cx: number, cy: number) {
    const ctx = ctxRef.current!;
    const { x, y } = screenToCanvas(cx, cy);
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= ctx.canvas.width || iy >= ctx.canvas.height) return;
    const d = ctx.getImageData(ix, iy, 1, 1).data;
    if (d[3] === 0) return;
    setColor("#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join(""));
    setTool("brush");
  }

  // ===== Pro tools: resize, upscale, filters, clone stamp, text =============

  /** Resize the document canvas (both Stencil + Reference). Optionally rescales
   *  existing pixel content with bilinear; otherwise keeps top-left aligned. */
  function resizeCanvas(newW: number, newH: number, scaleContent: boolean) {
    const ctx = ctxRef.current!; const c = ctx.canvas;
    const rctx = refCtxRef.current!; const rc = rctx.canvas;
    const oldStencil = document.createElement("canvas");
    oldStencil.width = c.width; oldStencil.height = c.height;
    oldStencil.getContext("2d")!.drawImage(c, 0, 0);
    const oldRef = document.createElement("canvas");
    oldRef.width = rc.width; oldRef.height = rc.height;
    oldRef.getContext("2d")!.drawImage(rc, 0, 0);

    c.width = newW; c.height = newH;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, newW, newH);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (scaleContent) ctx.drawImage(oldStencil, 0, 0, newW, newH);
    else ctx.drawImage(oldStencil, 0, 0);

    rc.width = newW; rc.height = newH;
    rctx.imageSmoothingEnabled = true; rctx.imageSmoothingQuality = "high";
    if (refLoaded) {
      if (scaleContent) rctx.drawImage(oldRef, 0, 0, newW, newH);
      else rctx.drawImage(oldRef, 0, 0);
    }
    undoStack.current = []; redoStack.current = [];
    pushUndo();
    fitToScreen();
    toast.success(`Canvas ${newW}×${newH}`);
  }

  function applyCanvasPreset(p: typeof SIZE_PRESETS[number]) {
    const ctx = ctxRef.current!;
    const cur = `${ctx.canvas.width}×${ctx.canvas.height}`;
    const scale = window.confirm(
      `Resize ${cur} → ${p.w}×${p.h}\n\nOK = scale content to fit\nCancel = keep pixels at top-left`
    );
    if (p.w * p.h > 16e6) {
      const go = window.confirm(`Large canvas (${(p.w * p.h / 1e6).toFixed(1)}MP). This may use significant memory on mobile. Continue?`);
      if (!go) return;
    }
    resizeCanvas(p.w, p.h, scale);
    setShowSizeMenu(false);
  }

  /** Lanczos-3 upscale to 6K (or any target) via Web Worker. */
  async function upscaleTo(targetW: number, targetH: number) {
    const ctx = ctxRef.current!;
    if (targetW * targetH > 40e6) {
      const ok = window.confirm(`${(targetW * targetH / 1e6).toFixed(1)}MP target — heavy on mobile. Continue?`);
      if (!ok) return;
    }
    setUpscaleBusy(0);
    try {
      const src = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      const t0 = performance.now();
      const out = await lanczosResize(src, targetW, targetH, (p) => setUpscaleBusy(Math.round(p * 100)));
      ctx.canvas.width = targetW; ctx.canvas.height = targetH;
      ctx.putImageData(out, 0, 0);
      // also resize ref canvas to match (preserve aspect by scaling existing content)
      if (refCtxRef.current) {
        const rctx = refCtxRef.current; const rc = rctx.canvas;
        const old = document.createElement("canvas");
        old.width = rc.width; old.height = rc.height;
        old.getContext("2d")!.drawImage(rc, 0, 0);
        rc.width = targetW; rc.height = targetH;
        if (refLoaded) { rctx.imageSmoothingQuality = "high"; rctx.drawImage(old, 0, 0, targetW, targetH); }
      }
      undoStack.current = []; redoStack.current = [];
      pushUndo(); fitToScreen();
      toast.success(`Upscaled to ${targetW}×${targetH} · ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      console.error("[editor] upscale failed", e);
      toast.error("Upscale failed");
    } finally {
      setUpscaleBusy(null);
    }
  }

  /** One-tap pro filters (chained worker ops). */
  async function applyStencilClean() {
    const ctx = ctxRef.current!; if (!ctx) return;
    const t0 = performance.now();
    try {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      const src = ctx.getImageData(0, 0, w, h);
      const clone = (d: ImageData) => new ImageData(new Uint8ClampedArray(d.data), d.width, d.height);
      let buf = await runOp({ op: "otsu", data: clone(src) });
      buf = await runOp({ op: "morph", data: clone(buf), passes: 2, kind: "open" });
      ctx.putImageData(buf, 0, 0); pushUndo();
      toast.success(`Stencil Clean · ${Math.round(performance.now() - t0)}ms`);
    } catch { toast.error("Stencil Clean failed"); }
  }
  async function applyLineSharpen() {
    // unsharp mask: blur via downscale/upscale, subtract.
    const ctx = ctxRef.current!; if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const src = ctx.getImageData(0, 0, w, h);
    const dw = Math.max(2, Math.round(w / 2)), dh = Math.max(2, Math.round(h / 2));
    const small = await lanczosResize(new ImageData(new Uint8ClampedArray(src.data), w, h), dw, dh);
    const blurred = await lanczosResize(small, w, h);
    const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
    const a = 1.6; // amount
    const sd = src.data, bd = blurred.data, od = out.data;
    for (let i = 0; i < od.length; i += 4) {
      od[i]   = Math.max(0, Math.min(255, sd[i]   + a * (sd[i]   - bd[i])));
      od[i+1] = Math.max(0, Math.min(255, sd[i+1] + a * (sd[i+1] - bd[i+1])));
      od[i+2] = Math.max(0, Math.min(255, sd[i+2] + a * (sd[i+2] - bd[i+2])));
    }
    ctx.putImageData(out, 0, 0); pushUndo();
    toast.success("Line Sharpen");
  }
  async function applyTattooReady() {
    // Sharpen → Otsu → close. Final print-ready pass.
    await applyLineSharpen();
    const ctx = ctxRef.current!;
    try {
      const w = ctx.canvas.width, h = ctx.canvas.height;
      const src = ctx.getImageData(0, 0, w, h);
      const clone = (d: ImageData) => new ImageData(new Uint8ClampedArray(d.data), d.width, d.height);
      let buf = await runOp({ op: "otsu", data: clone(src) });
      buf = await runOp({ op: "morph", data: clone(buf), passes: 1, kind: "close" });
      ctx.putImageData(buf, 0, 0); pushUndo();
      toast.success("Tattoo Ready ✓");
    } catch { toast.error("Tattoo Ready failed"); }
  }

  /** Clone stamp: alt-click (or first tap while tool=clone) sets source. */
  function cloneStampAt(cx: number, cy: number) {
    const ctx = ctxRef.current!;
    const { x, y } = screenToCanvas(cx, cy);
    if (!cloneSourceRef.current) {
      cloneSourceRef.current = { x, y };
      toast.success("Clone source set — paint to stamp");
      return;
    }
    if (!cloneOffsetRef.current) {
      cloneOffsetRef.current = { dx: x - cloneSourceRef.current.x, dy: y - cloneSourceRef.current.y };
    }
    const off = cloneOffsetRef.current;
    const sx = x - off.dx, sy = y - off.dy;
    const r = Math.max(4, size * 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = opacity;
    ctx.drawImage(ctx.canvas, sx - r, sy - r, r * 2, r * 2, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  /** Heal/Patch: Gaussian-style average of a soft disc, painted back over
   *  the target. Removes blemishes & cleans up scanned stencil noise. */
  function healAt(cx: number, cy: number) {
    const ctx = ctxRef.current!;
    const { x, y } = screenToCanvas(cx, cy);
    const r = Math.max(6, size * 0.8);
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const ix = Math.max(0, Math.floor(x - r));
    const iy = Math.max(0, Math.floor(y - r));
    const w = Math.min(W - ix, Math.ceil(r * 2));
    const h = Math.min(H - iy, Math.ceil(r * 2));
    if (w <= 0 || h <= 0) return;
    const patch = ctx.getImageData(ix, iy, w, h);
    const d = patch.data;
    // Compute weighted mean RGB inside the disc.
    let sr = 0, sg = 0, sb = 0, sw = 0;
    const cxL = x - ix, cyL = y - iy;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dd = Math.hypot(px - cxL, py - cyL);
        if (dd > r) continue;
        const wgt = 1 - dd / r;
        const i = (py * w + px) * 4;
        sr += d[i] * wgt; sg += d[i+1] * wgt; sb += d[i+2] * wgt; sw += wgt;
      }
    }
    if (sw <= 0) return;
    const mr = sr / sw, mg = sg / sw, mb = sb / sw;
    // Blend mean back with soft falloff (alpha based on disc distance).
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dd = Math.hypot(px - cxL, py - cyL);
        if (dd > r) continue;
        const a = (1 - dd / r) * Math.min(1, opacity);
        const i = (py * w + px) * 4;
        d[i]   = d[i]   * (1 - a) + mr * a;
        d[i+1] = d[i+1] * (1 - a) + mg * a;
        d[i+2] = d[i+2] * (1 - a) + mb * a;
      }
    }
    ctx.putImageData(patch, ix, iy);
  }

  /** Place text — optionally along a circular arc (curved text). */
  function commitTextAdvanced(curved: boolean, radius: number) {
    if (!textPrompt || !textValue.trim()) { setTextPrompt(null); setTextValue(""); return; }
    const ctx = ctxRef.current!;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `bold ${textSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    if (!curved) {
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(textValue, textPrompt.x, textPrompt.y);
    } else {
      // Render each char around an arc centered at textPrompt.
      const cxA = textPrompt.x, cyA = textPrompt.y;
      const chars = [...textValue];
      const angleStep = (textSize * 0.85) / radius; // rad per char
      const totalA = angleStep * (chars.length - 1);
      let a = -totalA / 2 - Math.PI / 2; // start at top
      for (const ch of chars) {
        ctx.save();
        ctx.translate(cxA + Math.cos(a) * radius, cyA + Math.sin(a) * radius);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        a += angleStep;
      }
    }
    ctx.restore();
    pushUndo();
    setTextPrompt(null); setTextValue("");
    toast.success(curved ? "Curved text added" : "Text added");
  }

  /** Place text onto stencil layer. */
  function commitText() {
    if (!textPrompt || !textValue.trim()) { setTextPrompt(null); setTextValue(""); return; }
    const ctx = ctxRef.current!;
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `bold ${textSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(textValue, textPrompt.x, textPrompt.y);
    ctx.restore();
    pushUndo();
    setTextPrompt(null); setTextValue("");
    toast.success("Text added");
  }

  // ===== Curves & Levels ====================================================

  function currentLUT(): Uint8ClampedArray {
    return adjustTab === "curves"
      ? buildCurveLUT(CURVES_PRESETS[curvePreset])
      : buildLevelsLUT(levels);
  }

  function openAdjust() {
    const ctx = ctxRef.current; if (!ctx) return;
    preAdjustSnapshot.current = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    setShowAdjust(true);
    setAdjustPreview(true);
  }

  /** Live, non-destructive preview using the cached pre-edit snapshot. */
  function renderAdjustPreview() {
    const ctx = ctxRef.current; const snap = preAdjustSnapshot.current;
    if (!ctx || !snap) return;
    if (!adjustPreview) { ctx.putImageData(snap, 0, 0); return; }
    const lut = currentLUT();
    previewLUT.current = lut;
    const mask = selectionRef.current?.mask;
    const out = applyLUT(snap, lut, mask);
    ctx.putImageData(out, 0, 0);
  }

  // Re-render whenever adjust knobs change while modal is open
  useEffect(() => {
    if (showAdjust) renderAdjustPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdjust, adjustTab, curvePreset, levels, adjustPreview]);

  function applyAdjust() {
    renderAdjustPreview();
    preAdjustSnapshot.current = null;
    setShowAdjust(false);
    pushUndo();
    toast.success(`${adjustTab === "curves" ? "Curves" : "Levels"} applied${selectionRef.current ? " (selection)" : ""}`);
  }

  function cancelAdjust() {
    const ctx = ctxRef.current; const snap = preAdjustSnapshot.current;
    if (ctx && snap) ctx.putImageData(snap, 0, 0);
    preAdjustSnapshot.current = null;
    setShowAdjust(false);
  }

  // ===== Magic Wand =========================================================

  function pickWandAt(cx: number, cy: number) {
    const ctx = ctxRef.current!;
    const { x, y } = screenToCanvas(cx, cy);
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const t0 = performance.now();
    const img = ctx.getImageData(0, 0, W, H);
    const r = magicWand(img, Math.floor(x), Math.floor(y), wandTolerance, wandContiguous);
    wandBaseRef.current = r;
    const refined = (wandExpand || wandFeather) ? refineMask(r, wandExpand, wandFeather) : r;
    setSelection(refined);
    selOverlayRef.current = maskToOverlayCanvas(refined.mask, refined.w, refined.h);
    toast.success(`Selection · ${Math.round(performance.now() - t0)}ms`);
  }

  // Re-refine when sliders change
  useEffect(() => {
    const base = wandBaseRef.current; if (!base) return;
    const r = (wandExpand || wandFeather) ? refineMask(base, wandExpand, wandFeather) : base;
    setSelection(r);
    selOverlayRef.current = maskToOverlayCanvas(r.mask, r.w, r.h);
  }, [wandExpand, wandFeather]);

  function clearSelection() {
    setSelection(null);
    selOverlayRef.current = null;
    wandBaseRef.current = null;
    setWandExpand(0); setWandFeather(0);
  }

  function selectionInvert() {
    const s = selectionRef.current; if (!s) return;
    const inv = invertMask(s);
    setSelection(inv);
    wandBaseRef.current = inv;
    selOverlayRef.current = maskToOverlayCanvas(inv.mask, inv.w, inv.h);
  }

  function selectionFill(hex: string) {
    const ctx = ctxRef.current; const s = selectionRef.current; if (!ctx || !s) return;
    const alpha = maskToAlphaCanvas(s.mask, s.w, s.h);
    const tmp = document.createElement("canvas");
    tmp.width = s.w; tmp.height = s.h;
    const t = tmp.getContext("2d")!;
    t.fillStyle = hex; t.fillRect(0, 0, s.w, s.h);
    t.globalCompositeOperation = "destination-in";
    t.drawImage(alpha, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    pushUndo();
  }

  function selectionDelete() {
    // erase to white (stencil substrate)
    selectionFill("#ffffff");
  }

  function selectionApplyThreshold() {
    const ctx = ctxRef.current; const s = selectionRef.current; if (!ctx || !s) return;
    const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const d = img.data;
    for (let i = 0, m = 0; i < d.length; i += 4, m++) {
      const w = s.mask[m] / 255; if (w <= 0) continue;
      const y = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      const v = y < 128 ? 0 : 255;
      d[i]   = d[i]   * (1 - w) + v * w;
      d[i+1] = d[i+1] * (1 - w) + v * w;
      d[i+2] = d[i+2] * (1 - w) + v * w;
    }
    ctx.putImageData(img, 0, 0);
    pushUndo();
  }

  // (eyedropAt defined above)

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p: Pt = {
      id: e.pointerId, cx: e.clientX, cy: e.clientY,
      pressure: e.pressure > 0 ? e.pressure : (e.pointerType === "pen" ? 0.5 : 1),
      type: e.pointerType,
    };
    pointers.current.set(e.pointerId, p);
    lastMoveTs.current = performance.now();
    lastVelocity.current = 0;

    // Two fingers = pinch/pan, kill any active draw
    if (pointers.current.size === 2) {
      if (drawingPointerId.current !== null) {
        endDraw();
        drawingPointerId.current = null;
      }
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1,
        midX: (a.cx + b.cx) / 2,
        midY: (a.cy + b.cy) / 2,
        view: { ...viewRef.current },
      };
      return;
    }
    if (pointers.current.size > 2) return;

    // Single pointer
    if (tool === "eyedrop") { eyedropAt(e.clientX, e.clientY); return; }
    if (tool === "pan") { setIsInteracting(true); return; }
    if (eliteTool) {
      if (eliteTool === "wand") { pickWandAt(e.clientX, e.clientY); return; }
      drawingPointerId.current = e.pointerId;
      lastCanvasPt.current = { x: e.clientX, y: e.clientY };
      applyEliteAt(e.clientX, e.clientY, 0, 0);
      setIsInteracting(true);
      return;
    }
    drawingPointerId.current = e.pointerId;
    beginDraw(p);
    setIsInteracting(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = pointers.current.get(e.pointerId)!;
    // Mouse pressure simulation: faster strokes → lower pressure, smooths over time.
    if (e.pointerType === "mouse" && e.pointerId === drawingPointerId.current) {
      const now = performance.now();
      const dt = Math.max(1, now - lastMoveTs.current);
      const v = Math.hypot(e.clientX - p.cx, e.clientY - p.cy) / dt;
      lastVelocity.current = lastVelocity.current * 0.7 + v * 0.3;
      lastMoveTs.current = now;
      // map 0..1.5 px/ms → pressure 1..0.25
      const sim = Math.max(0.25, Math.min(1, 1 - lastVelocity.current / 1.5));
      p.pressure = sim;
    } else {
      p.pressure = e.pressure > 0 ? e.pressure : p.pressure;
    }
    p.cx = e.clientX; p.cy = e.clientY;

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
      const midX = (a.cx + b.cx) / 2;
      const midY = (a.cy + b.cy) / 2;
      const start = pinchStart.current;
      const scaleFactor = dist / start.dist;
      let newScale = Math.max(0.1, Math.min(20, start.view.scale * scaleFactor));
      // Anchor zoom: keep canvas point under start midpoint locked to current midpoint
      const wrap = wrapRef.current!;
      const rect = wrap.getBoundingClientRect();
      // Canvas point under the original pinch midpoint:
      const anchorCanvasX = (start.midX - rect.left - start.view.x) / start.view.scale;
      const anchorCanvasY = (start.midY - rect.top - start.view.y) / start.view.scale;
      const newX = midX - rect.left - anchorCanvasX * newScale;
      const newY = midY - rect.top - anchorCanvasY * newScale;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setView({ scale: newScale, x: newX, y: newY });
      });
      return;
    }

    if (e.pointerId === drawingPointerId.current) {
      if (eliteTool) {
        // Throttle pixel-heavy elite tools (smudge/liquify/heal) to ~30fps on mobile.
        const now = performance.now();
        if (now - lastEliteTs.current < ELITE_THROTTLE_MS) return;
        lastEliteTs.current = now;
        const last = lastCanvasPt.current ?? { x: e.clientX, y: e.clientY };
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        applyEliteAt(e.clientX, e.clientY, dx, dy);
        lastCanvasPt.current = { x: e.clientX, y: e.clientY };
      } else {
        continueDraw(p);
      }
    } else if (tool === "pan" && pointers.current.size === 1) {
      // single-finger pan when in pan mode
      const v = viewRef.current;
      setView({ ...v, x: v.x + e.movementX, y: v.y + e.movementY });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (e.pointerId === drawingPointerId.current) {
      if (eliteTool) {
        lastCanvasPt.current = null;
        pushUndo();
      } else {
        endDraw();
      }
      drawingPointerId.current = null;
    }
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      setIsInteracting(false);
    }
  }

  // Wheel zoom
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const wrap = wrapRef.current!;
    const rect = wrap.getBoundingClientRect();
    const v = viewRef.current;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const newScale = Math.max(0.1, Math.min(20, v.scale * factor));
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const ax = (cx - v.x) / v.scale;
    const ay = (cy - v.y) / v.scale;
    setView({ scale: newScale, x: cx - ax * newScale, y: cy - ay * newScale });
  }

  // ---- Save ----------------------------------------------------------------
  async function onSave() {
    const canvas = canvasRef.current!;
    const png = canvas.toDataURL("image/png");
    // build thumbnail
    const tc = document.createElement("canvas");
    const TW = 512;
    const ratio = canvas.height / canvas.width;
    tc.width = TW; tc.height = Math.round(TW * ratio);
    tc.getContext("2d")!.drawImage(canvas, 0, 0, tc.width, tc.height);
    const thumb = tc.toDataURL("image/png");
    await saveDocument({
      ...doc,
      thumbnail: thumb,
      originalAIImage: png,
      lastEdited: Date.now(),
    });
    onSaved();
  }

  // ---- 500-variant matrix --------------------------------------------------
  const allVariants = useMemo<BrushVariant[]>(() => {
    const out: BrushVariant[] = [];
    for (const base of BRUSH_ORDER) {
      MODIFIERS.forEach((m, i) => {
        out.push({
          vid: `${base}::${i}`,
          base,
          label: `${BRUSH_LABELS[base]} — ${m.tag}`,
          sizeMul: m.sizeMul, opacityMul: m.opacityMul, scatter: m.scatter,
        });
      });
    }
    return out;
  }, []);
  const filteredVariants = useMemo(() => {
    if (!brushQuery.trim()) return allVariants;
    const q = brushQuery.toLowerCase();
    return allVariants.filter(v => v.label.toLowerCase().includes(q));
  }, [allVariants, brushQuery]);

  // ---- Picsart-style dock handlers ----------------------------------------
  const navigate = useNavigate();
  function runFilter(fn: (ctx: CanvasRenderingContext2D) => void, label: string) {
    const ctx = ctxRef.current; if (!ctx) return;
    try {
      const t0 = performance.now();
      fn(ctx);
      pushUndo();
      toast.success(`${label} · ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      console.error("[picsart-filter]", label, e);
      toast.error(`${label} failed`);
    }
  }
  const dockHandlers: PicsartDockHandlers = {
    openCrop:      () => { setTool("pan"); toast.info("Pinch-zoom to frame, then use Resize"); },
    setSelectionMode: () => { setEliteTool("wand"); toast.info("Magic Wand: tap an area to select"); },
    openAdjust:    openAdjust,
    enhance:       applyStencilOptimizer,
    resizeMenu:    () => { setShowSizeMenu(true); setHeaderVisible(true); },
    flipH:         () => runFilter(PF.flipHorizontal, "Flip H"),
    flipV:         () => runFilter(PF.flipVertical, "Flip V"),
    rotate90:      () => runFilter(PF.rotate90, "Rotate 90°"),
    perspective:   () => toast.info("Perspective: drag corners (coming soon)"),
    tiltShift:     () => runFilter((c) => PF.tiltShift(c, 0.35, 12), "Tilt Shift"),
    aiExpand:      () => toast.info("AI Expand uses outpainting — coming soon"),
    aiReplace:     () => toast.info("AI Replace — coming soon"),
    dispersion:    () => runFilter((c) => PF.dispersion(c, 1500, 0.3), "Dispersion"),
    stretch:       () => runFilter((c) => PF.pixelate(c, 6), "Stretch (pixel)"),
    motion:        () => runFilter((c) => PF.gaussianBlur(c, 10), "Motion Blur"),
    shapeCrop:     () => toast.info("Shape Crop: use Magic Wand → Invert → Delete"),
    freeCrop:      () => toast.info("Free Crop: use Magic Wand selection"),
    cloneStamp:    () => { setEliteTool("clone"); cloneSourceRef.current = null; cloneOffsetRef.current = null; toast.info("Clone: tap source, then paint"); },
    curves:        openAdjust,
    upscale6k:     () => upscaleTo(6144, 6144),
    stencilClean:  applyStencilClean,
    threshold:     () => applyThreshold(128),
    thermalBlue:   applyThermalBlueCarbon,
    thermalPurple: applyThermal,
    sharpen:       () => runFilter((c) => PF.sharpen(c, 1.4), "Sharpen"),
    blur:          () => runFilter((c) => PF.gaussianBlur(c, 6), "Blur"),
    vignette:      () => runFilter((c) => PF.vignette(c, 0.75), "Vignette"),
    halftone:      () => runFilter((c) => PF.halftone(c, 8), "Halftone"),
    pixelate:      () => runFilter((c) => PF.pixelate(c, 14), "Pixelate"),
    posterize:     () => runFilter((c) => PF.posterize(c, 4), "Posterize"),
    edge:          () => runFilter(PF.edgeDetect, "Edge Detect"),
    grain:         () => runFilter((c) => PF.grain(c, 20), "Grain"),
    sepia:         () => runFilter(PF.sepia, "Sepia"),
    lensFlare:     () => runFilter((c) => PF.lensFlare(c), "Lens Flare"),
    smudge:        () => { setEliteTool("smudge"); toast.info("Smudge: drag to blend"); },
    heal:          () => { setEliteTool("heal"); toast.info("Heal: tap blemishes to remove"); },
    liquifyPush:   () => { setEliteTool("liquify-push"); toast.info("Liquify Push"); },
    liquifyInflate:() => { setEliteTool("liquify-inflate"); toast.info("Liquify Inflate"); },
    liquifyDeflate:() => { setEliteTool("liquify-deflate"); toast.info("Liquify Deflate"); },
    removeBg:      () => runFilter((c) => PF.removeBackground(c, 240), "Remove BG"),
    cutout:        () => { setEliteTool("wand"); toast.info("Cutout: tap area, then Delete"); },
    text:          () => { const ctx = ctxRef.current!; setTextPrompt({ x: ctx.canvas.width / 2 - 100, y: ctx.canvas.height / 2 - 40 }); },
    addPhoto:      () => refFileInput.current?.click(),
    openBrushes:   () => setRightOpen(true),
    shapeMask:     () => toast.info("Shape Mask: use Selection → Shape"),
    frame:         () => runFilter((c) => PF.borderFrame(c, 32, "#0d0d0f"), "Frame"),
    callout:       () => { const ctx = ctxRef.current!; setTextPrompt({ x: ctx.canvas.width / 2 - 100, y: ctx.canvas.height / 2 - 40 }); toast.info("Type your callout"); },
    draw:          () => { setTool("brush"); setEliteTool(null); },
    sticker:       () => refFileInput.current?.click(),
    aiTryOn:       () => toast.info("AI Try On — coming soon"),
    apps:          () => navigate({ to: "/plugins" }),
    myFolders:     () => onClose(),
    border:        () => runFilter((c) => PF.borderFrame(c, 24, color), "Border"),
    shape:         () => toast.info("Shape: tap to drop circle"),
    mask:          () => { setEliteTool("wand"); toast.info("Mask: tap area to define"); },
  };

  // ---- UI ------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-[100] text-white touch-none select-none" style={{ background: "#0d0d0f" }}>
      {/* LAYER 0+1 — Fullscreen canvas viewport, behind every panel */}
      <div
        ref={wrapRef}
        className="absolute inset-0 overflow-hidden"
        style={{ background: "#0d0d0f", zIndex: 1, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div
          style={{
            position: "absolute",
            left: 0, top: 0,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {/* Layer 0 — Reference image (under) */}
          <canvas
            ref={refCanvasRef}
            className="absolute inset-0 bg-white shadow-[0_30px_120px_-30px_rgba(0,0,0,0.7)]"
            style={{
              opacity: refVisible ? refOpacity : 0,
              pointerEvents: "none",
              imageRendering: view.scale > 2 ? "pixelated" : "auto",
            }}
          />
          {/* Layer 1 — Stencil/drawing layer (top) */}
          <canvas
            ref={canvasRef}
            className="relative bg-white shadow-2xl"
            style={{
              imageRendering: view.scale > 2 ? "pixelated" : "auto",
              mixBlendMode: refLoaded && refVisible ? "multiply" : "normal",
            }}
          />
          {/* Selection overlay (cyan tint of mask) */}
          {selection && selOverlayRef.current && (
            <img
              src={selOverlayRef.current.toDataURL()}
              alt=""
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{ mixBlendMode: "screen", opacity: 0.9 }}
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* HEADER — floating control bar (z 10) */}
      <header
        className="absolute left-0 right-0 top-0 flex items-center gap-2 px-3"
        style={{
          height: 50,
          zIndex: 10,
          background: "rgba(18,18,22,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          transform: headerVisible ? "translateY(0)" : "translateY(-105%)",
          transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
          opacity: fadeChrome ? 0.15 : 1,
          pointerEvents: fadeChrome ? "none" : "auto",
          willChange: "transform, opacity",
        }}
      >
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10" aria-label="Close"><X size={18} /></button>
        <div className="text-sm font-semibold truncate flex-1">{doc.name}</div>
        <button
          onClick={() => setImmersive(v => !v)}
          className={`px-2 py-1 rounded text-[10px] font-semibold ${immersive ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "bg-white/5 text-neutral-300 hover:bg-white/10"}`}
          title="Fade panels while drawing"
        >
          {immersive ? "Procreate Mode On" : "Procreate Mode"}
        </button>
        <button onClick={collapseAll} className="p-1.5 rounded hover:bg-white/10" aria-label="Toggle all panels (Tab)"><Minimize2 size={16} /></button>
        <button onClick={doUndo} disabled={!canUndo} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30" aria-label="Undo"><Undo2 size={18} /></button>
        <button onClick={doRedo} disabled={!canRedo} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30" aria-label="Redo"><Redo2 size={18} /></button>
        <button onClick={fitToScreen} className="p-1.5 rounded hover:bg-white/10" aria-label="Fit"><Maximize2 size={16} /></button>
        <button onClick={() => setView(v => ({ ...v, scale: 1, x: 0, y: 0 }))} className="p-1.5 rounded hover:bg-white/10" aria-label="Reset zoom"><RotateCcw size={16} /></button>
        <button onClick={openAdjust} className="p-1.5 rounded hover:bg-white/10 flex items-center gap-1 text-[11px]" title="Curves / Levels"><Activity size={14}/> Adjust</button>
        <button onClick={() => setShowHistory(s => !s)} className={`p-1.5 rounded flex items-center gap-1 text-[11px] ${showHistory ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`} title="History timeline"><History size={14}/> History</button>
        <span className="text-[11px] text-neutral-400 tabular-nums w-12 text-right">{(view.scale * 100).toFixed(0)}%</span>
        {/* Canvas Size dropdown */}
        <div className="relative">
          <button onClick={() => { setShowSizeMenu(s => !s); setShowProMenu(false); }}
            className="p-1.5 rounded hover:bg-white/10 flex items-center gap-1 text-[11px]" title="Canvas Size">
            <Crop size={14} /> Size
          </button>
          {showSizeMenu && (
            <div className="absolute right-0 mt-1 w-56 rounded-lg border border-white/10 bg-[#121216] shadow-xl p-1 z-20">
              {SIZE_PRESETS.map(p => (
                <button key={p.id} onClick={() => applyCanvasPreset(p)}
                  className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10">
                  {p.label}
                </button>
              ))}
              <button onClick={() => {
                const v = window.prompt("Custom size W×H (e.g. 3000x4000)");
                if (!v) return;
                const m = v.match(/(\d+)\s*[x×]\s*(\d+)/i);
                if (!m) { toast.error("Bad format"); return; }
                applyCanvasPreset({ id: "custom", label: "Custom", w: +m[1], h: +m[2] });
              }} className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10 text-[#00F5D4]">
                Custom…
              </button>
            </div>
          )}
        </div>
        {/* Pro Tools dropdown (filters + upscale + text) */}
        <div className="relative">
          <button onClick={() => { setShowProMenu(s => !s); setShowSizeMenu(false); }}
            className="p-1.5 rounded hover:bg-white/10 flex items-center gap-1 text-[11px]" title="Pro Tools">
            <Sliders size={14} /> Pro
          </button>
          {showProMenu && (
            <div className="absolute right-0 mt-1 w-56 rounded-lg border border-white/10 bg-[#121216] shadow-xl p-1 z-20">
              <button onClick={() => { setShowProMenu(false); upscaleTo(6144, 6144); }}
                className="w-full flex items-center gap-2 text-left px-2 py-2 text-[11px] rounded bg-gradient-to-r from-[#A855F7] to-[#7c3aed] text-white font-bold mb-1">
                <Rocket size={12} /> Upscale to 6K (Lanczos)
              </button>
              <button onClick={() => { setShowProMenu(false); upscaleTo(4096, 4096); }}
                className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10">Upscale 4K</button>
              <div className="h-px bg-white/5 my-1" />
              <button onClick={() => { setShowProMenu(false); applyStencilClean(); }}
                className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10">✦ Stencil Clean</button>
              <button onClick={() => { setShowProMenu(false); applyLineSharpen(); }}
                className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10">✦ Line Sharpen</button>
              <button onClick={() => { setShowProMenu(false); applyTattooReady(); }}
                className="w-full text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10 text-[#00F5D4] font-semibold">✦ Tattoo Ready</button>
              <div className="h-px bg-white/5 my-1" />
              <button onClick={() => { setShowProMenu(false); setEliteTool("clone"); cloneSourceRef.current = null; cloneOffsetRef.current = null; toast.info("Clone: tap to set source, then paint"); }}
                className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10">
                <Stamp size={12} /> Clone Stamp
              </button>
              <button onClick={() => { setShowProMenu(false); const ctx = ctxRef.current!; setTextPrompt({ x: ctx.canvas.width / 2 - 100, y: ctx.canvas.height / 2 - 40 }); }}
                className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-[11px] rounded hover:bg-white/10">
                <TypeIcon size={12} /> Add Text
              </button>
            </div>
          )}
        </div>
        <button onClick={onSave} className="ml-1 rounded-full bg-gradient-to-r from-[#00F5D4] to-[#00B8A9] text-black px-3 py-1.5 text-xs font-bold flex items-center gap-1">
          <Save size={14} /> Save Stencil
        </button>
      </header>

      {/* COLUMN 1 — Engines (left floating glass panel) */}
      <aside
        className="absolute overflow-y-auto p-3 space-y-4 text-xs"
        style={{
          top: 60, left: 10, bottom: 10, width: 260,
          zIndex: 10,
          borderRadius: 8,
          background: "rgba(18,18,22,0.85)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.06)",
          transform: leftOpen ? "translateX(0)" : "translateX(-105%)",
          transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
          opacity: fadeChrome ? 0.15 : 1,
          pointerEvents: fadeChrome || !leftOpen ? "none" : "auto",
          willChange: "transform, opacity",
        }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Engine A · Stabilizer</div>
          <input type="range" min={0} max={90} value={Math.round(stabilizer * 100)}
            onChange={e => setStabilizer(+e.target.value / 100)} className="w-full" />
          <div className="text-[10px] text-center text-neutral-400">{Math.round(stabilizer * 100)}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 flex items-center gap-1"><Grid3x3 size={11}/> Symmetry</div>
          <select value={symmetry} onChange={e => setSymmetry(e.target.value as Symmetry)}
            className="w-full bg-black/40 rounded px-2 py-1.5 text-xs border border-white/10">
            <option value="none">None</option>
            <option value="mirror-x">Mirror X</option>
            <option value="mirror-y">Mirror Y</option>
            <option value="radial-8">8-Fold Mandala</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Elite Engines</div>
          <div className="grid grid-cols-2 gap-1">
            {([
              ["stipple", "Stippler", Sparkles],
              ["smudge", "Smudge", Droplet],
              ["liquify-push", "Push", Wind],
              ["liquify-inflate", "Inflate", Wind],
              ["liquify-deflate", "Deflate", Wind],
              ["clone", "Clone", Stamp],
              ["wand", "Magic Wand", Wand],
            ] as const).map(([id, label, Icon]) => (
              <button key={id}
                onClick={() => setEliteTool(eliteTool === id ? null : id)}
                className={`flex flex-col items-center gap-0.5 rounded px-1 py-1.5 text-[10px] border ${eliteTool === id ? "bg-[#00F5D4]/15 text-[#00F5D4] border-[#00F5D4]/40" : "bg-black/30 text-neutral-300 border-white/5 hover:bg-white/10"}`}>
                <Icon size={12} />{label}
              </button>
            ))}
          </div>
          {eliteTool && (
            <button onClick={() => setEliteTool(null)}
              className="mt-1 w-full rounded bg-white/5 text-neutral-400 text-[10px] py-1 hover:bg-white/10">
              Back to Brush
            </button>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Post Process</div>
          <button onClick={applyStencilOptimizer}
            className="w-full flex items-center gap-1 justify-center rounded px-2 py-2 text-[11px] mb-1 font-bold text-black"
            style={{ background: "linear-gradient(135deg,#A855F7,#7c3aed)", color: "#fff" }}>
            <Wand2 size={12} /> Stencil Optimizer
          </button>
          <button onClick={() => applyThreshold(128)}
            className="w-full flex items-center gap-1 justify-center rounded bg-black/30 hover:bg-white/10 px-2 py-2 text-[11px] mb-1 border border-white/5">
            <Contrast size={12} /> Run Stencil Threshold Map
          </button>
          <button onClick={applyThermalBlueCarbon}
            className="w-full flex items-center gap-1 justify-center rounded px-2 py-2 text-[11px] mb-1 font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#2b3a8c,#5a4bd1)" }}>
            <Thermometer size={12} /> Thermal Blue Carbon
          </button>
          <button onClick={applyThermal}
            className="w-full flex items-center gap-1 justify-center rounded bg-gradient-to-r from-purple-700 to-fuchsia-700 hover:opacity-90 px-2 py-2 text-[11px]">
            <Thermometer size={12} /> Thermal Purple
          </button>
        </div>
      </aside>

      {/* COLUMN 2 — Tool dock (60px) */}
      <aside
        className="absolute flex flex-col gap-2 p-2"
        style={{
          top: 60, left: 280, width: 60,
          zIndex: 10,
          borderRadius: 8,
          background: "rgba(18,18,22,0.85)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.06)",
          transform: leftOpen ? "translateX(0)" : "translateX(calc(-280px - 20px))",
          transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
          opacity: fadeChrome ? 0.15 : 1,
          pointerEvents: fadeChrome ? "none" : "auto",
          willChange: "transform, opacity",
        }}
      >
        <button onClick={() => setTool("brush")} className={`p-2 rounded ${tool === "brush" && !eliteTool ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`} aria-label="Brush"><Pipette size={16} className="mx-auto rotate-180" /></button>
        <button onClick={() => setTool("pan")} className={`p-2 rounded ${tool === "pan" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`} aria-label="Pan"><Hand size={16} className="mx-auto" /></button>
        <button onClick={() => { setTool("eraser"); setBrushId("eraser"); }} className={`p-2 rounded ${tool === "eraser" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`} aria-label="Eraser"><Eraser size={16} className="mx-auto" /></button>
        <button onClick={() => setTool("eyedrop")} className={`p-2 rounded ${tool === "eyedrop" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`} aria-label="Eyedropper"><Pipette size={16} className="mx-auto" /></button>
        <div className="mt-1">
          <div className="text-[8px] text-neutral-500 uppercase text-center">Size</div>
          <input type="range" min={1} max={200} value={size} onChange={e => setSize(+e.target.value)}
            className="w-full"
            style={{ writingMode: "vertical-lr" as never, WebkitAppearance: "slider-vertical" as never, height: 90 }} />
          <div className="text-[9px] text-center text-neutral-400">{size}</div>
        </div>
        <div>
          <div className="text-[8px] text-neutral-500 uppercase text-center">Flow</div>
          <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(+e.target.value / 100)}
            className="w-full"
            style={{ writingMode: "vertical-lr" as never, WebkitAppearance: "slider-vertical" as never, height: 90 }} />
          <div className="text-[9px] text-center text-neutral-400">{Math.round(opacity * 100)}</div>
        </div>
        <label className="block mt-1">
          <span className="block text-[8px] text-neutral-500 uppercase text-center mb-1">Color</span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="w-full h-8 bg-transparent rounded cursor-pointer" />
        </label>
      </aside>

      {/* COLUMN 3 — Layers + 500-brush library (right floating panel) */}
      <aside
        className="absolute flex flex-col"
        style={{
          top: 60, right: 10, bottom: 10, width: 280,
          zIndex: 10,
          borderRadius: 8,
          background: "rgba(18,18,22,0.85)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.06)",
          transform: rightOpen ? "translateX(0)" : "translateX(105%)",
          transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
          opacity: fadeChrome ? 0.15 : 1,
          pointerEvents: fadeChrome || !rightOpen ? "none" : "auto",
          willChange: "transform, opacity",
        }}
      >
        {/* Autosave preferences */}
        <AutosaveSettings
          enabled={autosave.enabled}
          intervalMs={autosave.intervalMs}
          onToggle={autosave.setEnabled}
          onIntervalChange={autosave.setIntervalMs}
          onSaveNow={saveNow}
          statusLabel={
            saveState === "saving" ? "Saving…"
            : saveState === "error" ? "Save failed"
            : !autosave.enabled ? "Off"
            : savedAgo ? `Saved ${formatAgo(savedAgo)}`
            : "Ready"
          }
          statusColor={
            saveState === "error" ? "#f87171"
            : saveState === "saving" ? "#A855F7"
            : !autosave.enabled ? "#9ca3af"
            : "#00F5D4"
          }
        />

        {/* Layer manager */}
        <div className="p-3 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Layers</div>
          <div className="space-y-1.5">
            <div className="rounded bg-black/30 border border-white/5 px-2 py-1.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#00F5D4]" /> Layer 1 · Stencil
                <span className="ml-auto text-[9px] text-neutral-500">trace</span>
              </div>
            </div>
            <div className="rounded bg-black/30 border border-white/5 px-2 py-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-neutral-500" /> Layer 0 · Reference
                <button onClick={() => setRefVisible(v => !v)} className="ml-auto p-0.5 text-neutral-400 hover:text-white" aria-label="Toggle reference">
                  {refVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
              <div className="mt-1 flex gap-1">
                <button onClick={() => refFileInput.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1 rounded bg-white/5 hover:bg-white/10 text-[10px] py-1">
                  <ImageIcon size={11} /> {refLoaded ? "Replace" : "Import"}
                </button>
                {refLoaded && (
                  <button onClick={clearRefImage}
                    className="rounded bg-white/5 hover:bg-red-500/20 text-[10px] px-2 py-1">×</button>
                )}
                <input ref={refFileInput} type="file" accept="image/*" onChange={onPickRefImage} className="hidden" />
              </div>
              {refLoaded && (
                <div className="mt-1">
                  <input type="range" min={0} max={100} value={Math.round(refOpacity * 100)}
                    onChange={e => setRefOpacity(+e.target.value / 100)} className="w-full" />
                  <div className="text-[9px] text-neutral-500 text-center">Ref Opacity {Math.round(refOpacity * 100)}%</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Brush library */}
        <div className="p-3 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
            Brush Library · {allVariants.length}
          </div>
          <input
            placeholder="Search 500 brushes…"
            value={brushQuery}
            onChange={e => setBrushQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {filteredVariants.map(v => {
            const sel = v.base === brushId && v.vid.endsWith(`::${variantIdx}`);
            return (
              <button
                key={v.vid}
                onClick={() => {
                  setBrushId(v.base);
                  const idx = parseInt(v.vid.split("::")[1], 10);
                  setVariantIdx(idx);
                  setEliteTool(null);
                  if (v.base !== "eraser") setTool("brush"); else setTool("eraser");
                }}
                className={`w-full text-left rounded px-2 py-1.5 text-[10px] mb-0.5 truncate ${sel ? "bg-[#00F5D4]/15 text-[#00F5D4]" : "hover:bg-white/10 text-neutral-300"}`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Edge dock tabs — appear when a column is collapsed */}
      {!leftOpen && (
        <button
          onClick={() => setLeftOpen(true)}
          aria-label="Open engines panel"
          className="absolute flex items-center justify-center hover:bg-white/15"
          style={{
            left: 0, top: "50%", transform: "translateY(-50%)",
            width: 32, height: 48, zIndex: 11,
            background: "rgba(18,18,22,0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderLeft: "none",
            borderRadius: "0 8px 8px 0",
            backdropFilter: "blur(12px)",
            color: "#00F5D4",
          }}
        >
          <Settings2 size={16} />
        </button>
      )}
      {leftOpen && (
        <button
          onClick={() => setLeftOpen(false)}
          aria-label="Collapse engines panel"
          className="absolute hover:bg-white/15"
          style={{
            left: 340, top: "50%", transform: "translateY(-50%)",
            width: 18, height: 48, zIndex: 11,
            background: "rgba(18,18,22,0.85)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "0 8px 8px 0",
            color: "#9ca3af",
            transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
            opacity: fadeChrome ? 0.15 : 1,
            pointerEvents: fadeChrome ? "none" : "auto",
          }}
        >
          <ChevronLeft size={14} className="mx-auto" />
        </button>
      )}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          aria-label="Open brush vault"
          className="absolute flex items-center justify-center hover:bg-white/15"
          style={{
            right: 0, top: "50%", transform: "translateY(-50%)",
            width: 32, height: 48, zIndex: 11,
            background: "rgba(18,18,22,0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRight: "none",
            borderRadius: "8px 0 0 8px",
            backdropFilter: "blur(12px)",
            color: "#00F5D4",
          }}
        >
          <BrushIcon size={16} />
        </button>
      )}
      {rightOpen && (
        <button
          onClick={() => setRightOpen(false)}
          aria-label="Collapse brush vault"
          className="absolute hover:bg-white/15"
          style={{
            right: 300, top: "50%", transform: "translateY(-50%)",
            width: 18, height: 48, zIndex: 11,
            background: "rgba(18,18,22,0.85)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "8px 0 0 8px",
            color: "#9ca3af",
            transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.2s",
            opacity: fadeChrome ? 0.15 : 1,
            pointerEvents: fadeChrome ? "none" : "auto",
          }}
        >
          <ChevronRight size={14} className="mx-auto" />
        </button>
      )}
      {!headerVisible && (
        <button
          onClick={() => setHeaderVisible(true)}
          aria-label="Show header"
          className="absolute flex items-center justify-center hover:bg-white/15"
          style={{
            top: 0, left: "50%", transform: "translateX(-50%)",
            width: 56, height: 22, zIndex: 11,
            background: "rgba(18,18,22,0.9)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderTop: "none",
            borderRadius: "0 0 10px 10px",
            color: "#00F5D4",
          }}
        >
          <ChevronRight size={14} className="rotate-90" />
        </button>
      )}

      {/* Status pill — bottom center */}
      <div
        className="absolute left-1/2 -translate-x-1/2 px-3 py-1 text-[10px] font-medium tabular-nums flex items-center gap-2"
        style={{
          bottom: 84, zIndex: 13,
          borderRadius: 999,
          background: "rgba(18,18,22,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          color: "rgba(255,255,255,0.75)",
          opacity: fadeChrome ? 0.15 : 1,
          pointerEvents: "none",
          transition: "opacity 0.2s",
        }}
      >
        <span>{(view.scale * 100).toFixed(0)}%</span>
        <span className="text-neutral-600">·</span>
        <span>{eliteTool ? eliteTool.replace("liquify-", "") : (tool === "eraser" ? "eraser" : BRUSH_LABELS[brushId])}</span>
        <span className="text-neutral-600">·</span>
        <span style={{ color:
          saveState === "error" ? "#f87171"
          : saveState === "saving" ? "#A855F7"
          : !autosave.enabled ? "#9ca3af"
          : "#00F5D4" }}>
          {saveState === "saving" ? "Saving…"
            : saveState === "error" ? "Save failed"
            : savedAgo ? `Saved ${formatAgo(savedAgo)}`
            : autosave.enabled ? "Autosave on" : "Autosave off"}
        </span>
      </div>

      {/* Upscale progress overlay */}
      {upscaleBusy !== null && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(13,13,15,0.75)", backdropFilter: "blur(8px)" }}>
          <div className="rounded-xl border border-white/10 bg-[#121216] px-6 py-5 w-72 text-center">
            <Rocket size={24} className="mx-auto text-[#A855F7] mb-2" />
            <div className="text-sm font-bold mb-1">Lanczos Upscaling…</div>
            <div className="text-[11px] text-neutral-400 mb-3">High-fidelity resampling in worker</div>
            <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#A855F7] to-[#00F5D4] transition-all" style={{ width: `${upscaleBusy}%` }} />
            </div>
            <div className="text-[10px] text-neutral-500 mt-1 tabular-nums">{upscaleBusy}%</div>
          </div>
        </div>
      )}

      {/* Text tool input */}
      {textPrompt && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(13,13,15,0.75)", backdropFilter: "blur(8px)" }}>
          <div className="rounded-xl border border-white/10 bg-[#121216] p-4 w-80">
            <div className="flex items-center gap-2 mb-3"><TypeIcon size={14} className="text-[#00F5D4]" /><div className="text-sm font-bold">Add Text</div></div>
            <input autoFocus value={textValue} onChange={e => setTextValue(e.target.value)}
              placeholder="Type text…"
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm mb-2" />
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-neutral-400">Size</span>
              <input type="range" min={12} max={400} value={textSize} onChange={e => setTextSize(+e.target.value)} className="flex-1" />
              <span className="text-[10px] text-neutral-300 tabular-nums w-8 text-right">{textSize}</span>
            </div>
            <label className="flex items-center gap-2 mb-2 text-[11px] text-neutral-300">
              <input type="checkbox" checked={curvedText} onChange={e => setCurvedText(e.target.checked)} />
              Curved text (arc)
            </label>
            {curvedText && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-neutral-400">Radius</span>
                <input type="range" min={60} max={800} value={textRadius} onChange={e => setTextRadius(+e.target.value)} className="flex-1" />
                <span className="text-[10px] text-neutral-300 tabular-nums w-10 text-right">{textRadius}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setTextPrompt(null); setTextValue(""); }}
                className="flex-1 rounded bg-white/5 hover:bg-white/10 text-xs py-2">Cancel</button>
              <button onClick={() => commitTextAdvanced(curvedText, textRadius)}
                className="flex-1 rounded bg-gradient-to-r from-[#00F5D4] to-[#00B8A9] text-black text-xs font-bold py-2">Place</button>
            </div>
          </div>
        </div>
      )}

      {/* Selection floating toolbar */}
      {selection && (
        <div className="absolute z-[12] flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg"
          style={{
            left: "50%", transform: "translateX(-50%)", top: 60,
            background: "rgba(18,18,22,0.92)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(0,245,212,0.35)",
            boxShadow: "0 8px 32px -8px rgba(0,245,212,0.25)",
          }}>
          <span className="text-[10px] text-[#00F5D4] font-bold mr-1">SELECTION</span>
          <button onClick={() => selectionFill(color)} className="px-2 py-1 rounded text-[10px] hover:bg-white/10">Fill</button>
          <button onClick={selectionDelete} className="px-2 py-1 rounded text-[10px] hover:bg-white/10">Delete</button>
          <button onClick={selectionInvert} className="px-2 py-1 rounded text-[10px] hover:bg-white/10">Invert</button>
          <button onClick={selectionApplyThreshold} className="px-2 py-1 rounded text-[10px] hover:bg-white/10">Threshold</button>
          <button onClick={openAdjust} className="px-2 py-1 rounded text-[10px] hover:bg-white/10 text-[#00F5D4]">Adjust…</button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <label className="text-[9px] text-neutral-400">Tol</label>
          <input type="range" min={1} max={150} value={wandTolerance} onChange={e => setWandTolerance(+e.target.value)} className="w-16" />
          <label className="flex items-center gap-1 text-[9px] text-neutral-400 ml-1">
            <input type="checkbox" checked={wandContiguous} onChange={e => setWandContiguous(e.target.checked)} /> Contig
          </label>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <label className="text-[9px] text-neutral-400">Refine</label>
          <input type="range" min={-20} max={20} value={wandExpand} onChange={e => setWandExpand(+e.target.value)} className="w-14" title="Expand/Contract" />
          <input type="range" min={0} max={20} value={wandFeather} onChange={e => setWandFeather(+e.target.value)} className="w-14" title="Feather" />
          <button onClick={clearSelection} className="ml-1 px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-red-500/20">Clear</button>
        </div>
      )}

      {/* History timeline (bottom strip) */}
      {showHistory && (
        <div className="absolute z-[11] flex items-center gap-1 px-2 py-1.5 overflow-x-auto"
          style={{
            left: 10, right: 10, bottom: 110,
            background: "rgba(18,18,22,0.92)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
            opacity: fadeChrome ? 0.15 : 1,
            pointerEvents: fadeChrome ? "none" : "auto",
          }}>
          <History size={12} className="text-neutral-400 shrink-0" />
          <span className="text-[10px] text-neutral-400 mr-1 shrink-0">{historyThumbs.current.length} steps</span>
          {/* render via tick */}
          <span className="hidden">{historyTick}</span>
          {historyThumbs.current.map((src, i) => (
            <button key={i} onClick={() => jumpHistory(i)}
              className={`shrink-0 rounded overflow-hidden border ${i === historyThumbs.current.length - 1 ? "border-[#00F5D4]" : "border-white/10 hover:border-white/30"}`}
              title={`Step ${i + 1}`}>
              {src
                ? <img src={src} alt="" className="h-12 w-auto block" draggable={false} />
                : <div className="h-12 w-12 bg-black/40" />}
            </button>
          ))}
        </div>
      )}

      {/* Adjust modal — Curves & Levels with presets and live preview */}
      {showAdjust && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(13,13,15,0.55)", backdropFilter: "blur(6px)" }}>
          <div className="rounded-xl border border-white/10 bg-[#121216] w-[360px] max-w-[92vw] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-[#A855F7]" />
              <div className="text-sm font-bold">Tonal Adjust</div>
              {selection && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#00F5D4]/15 text-[#00F5D4]">SELECTION</span>}
              <div className="ml-auto flex gap-1 text-[10px]">
                <button onClick={() => setAdjustTab("curves")} className={`px-2 py-1 rounded ${adjustTab === "curves" ? "bg-white/10 text-white" : "text-neutral-400"}`}>Curves</button>
                <button onClick={() => setAdjustTab("levels")} className={`px-2 py-1 rounded ${adjustTab === "levels" ? "bg-white/10 text-white" : "text-neutral-400"}`}>Levels</button>
              </div>
            </div>

            <AdjustHistogram src={preAdjustSnapshot.current} lut={currentLUT()} />

            {adjustTab === "curves" ? (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500">Preset</div>
                <div className="grid grid-cols-2 gap-1">
                  {(Object.keys(CURVES_PRESETS) as (keyof typeof CURVES_PRESETS)[]).map(k => (
                    <button key={k} onClick={() => setCurvePreset(k)}
                      className={`text-[10px] px-2 py-1.5 rounded border ${curvePreset === k ? "bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/40" : "bg-black/30 border-white/5 text-neutral-300 hover:bg-white/10"}`}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500">Preset</div>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(LEVELS_PRESETS) as (keyof typeof LEVELS_PRESETS)[]).map(k => (
                    <button key={k} onClick={() => setLevels({ ...LEVELS_PRESETS[k] })}
                      className="text-[10px] px-2 py-1 rounded bg-black/30 hover:bg-white/10 border border-white/5">{k}</button>
                  ))}
                </div>
                <LevelRow label="In Black" min={0} max={254} value={levels.inBlack}
                  onChange={v => setLevels(l => ({ ...l, inBlack: Math.min(v, l.inWhite - 1) }))} />
                <LevelRow label="Gamma" min={10} max={300} value={Math.round(levels.gamma * 100)} display={(levels.gamma).toFixed(2)}
                  onChange={v => setLevels(l => ({ ...l, gamma: v / 100 }))} />
                <LevelRow label="In White" min={1} max={255} value={levels.inWhite}
                  onChange={v => setLevels(l => ({ ...l, inWhite: Math.max(v, l.inBlack + 1) }))} />
                <LevelRow label="Out Black" min={0} max={254} value={levels.outBlack}
                  onChange={v => setLevels(l => ({ ...l, outBlack: v }))} />
                <LevelRow label="Out White" min={1} max={255} value={levels.outWhite}
                  onChange={v => setLevels(l => ({ ...l, outWhite: v }))} />
              </div>
            )}

            <label className="flex items-center gap-2 text-[10px] text-neutral-400 mt-3">
              <input type="checkbox" checked={adjustPreview} onChange={e => setAdjustPreview(e.target.checked)} /> Live preview
            </label>

            <div className="flex gap-2 mt-3">
              <button onClick={cancelAdjust} className="flex-1 rounded bg-white/5 hover:bg-white/10 text-xs py-2">Cancel</button>
              <button onClick={applyAdjust} className="flex-1 rounded bg-gradient-to-r from-[#A855F7] to-[#7c3aed] text-white text-xs font-bold py-2">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Picsart-style horizontal dock — bottom of viewport */}
      <PicsartDock handlers={dockHandlers} hidden={fadeChrome} />
    </div>
  );
}

function LevelRow({ label, min, max, value, display, onChange }: {
  label: string; min: number; max: number; value: number; display?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-neutral-400 w-16 shrink-0">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} className="flex-1" />
      <span className="text-[10px] tabular-nums text-neutral-300 w-10 text-right">{display ?? value}</span>
    </div>
  );
}

function AdjustHistogram({ src, lut }: { src: ImageData | null; lut: Uint8ClampedArray }) {
  const hist = useMemo(() => src ? lumaHistogram(src) : null, [src]);
  if (!hist) return null;
  // SVG: 256-bar histogram + LUT curve
  const W = 320, H = 70;
  const bars: string[] = [];
  for (let i = 0; i < 256; i++) {
    const x = (i / 256) * W;
    const bh = hist[i] * H;
    bars.push(`M${x.toFixed(2)} ${H} L${x.toFixed(2)} ${(H - bh).toFixed(2)}`);
  }
  let curve = `M0 ${H - (lut[0] / 255) * H}`;
  for (let i = 1; i < 256; i++) {
    curve += ` L${((i / 256) * W).toFixed(2)} ${(H - (lut[i] / 255) * H).toFixed(2)}`;
  }
  return (
    <svg width={W} height={H} className="block w-full h-[70px] mb-3 rounded bg-black/40 border border-white/5">
      <path d={bars.join(" ")} stroke="rgba(255,255,255,0.4)" strokeWidth={1} fill="none" />
      <path d={curve} stroke="#A855F7" strokeWidth={1.5} fill="none" />
    </svg>
  );
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

export default VaultProcreateEditor;
