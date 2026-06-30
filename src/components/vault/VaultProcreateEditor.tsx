import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  X, Save, Undo2, Redo2, Eraser, Hand, Pipette, RotateCcw, Maximize2,
  Droplet, Wind, Sparkles, Contrast, Thermometer, Grid3x3, Image as ImageIcon, Eye, EyeOff,
  ChevronRight, ChevronLeft, Settings2, Brush as BrushIcon, Minimize2, Wand2,
} from "lucide-react";
import { saveDocument, saveEditorState, type DocumentData, type EditorState, type LayerState } from "@/lib/localDB";
import { runOp } from "@/lib/worker-bridge";
import { toast } from "sonner";
import {
  DEFAULTS, BRUSH_LABELS, beginStroke, endStroke, strokeTo,
  type BrushId, type BrushSettings, type StrokeContext,
} from "@/lib/brushes";

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
type EliteTool = "smudge" | "liquify-push" | "liquify-inflate" | "liquify-deflate" | "stipple";
type Symmetry = "none" | "mirror-x" | "mirror-y" | "radial-8";

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
  const [stabilizer, setStabilizer] = useState(0.35); // 0..0.9 EMA weight toward target
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
  const autosaveTimer = useRef<number | null>(null);
  const lastVelocity = useRef(0);
  const lastMoveTs = useRef(0);

  // Drawer + HUD state machines (Procreate-style collapsible workspace)
  // Panels start collapsed — they only appear when the user taps an edge tab.
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const lastTapRef = useRef(0);

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
    if (undoStack.current.length > 30) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
    scheduleAutosave();
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

  function scheduleAutosave() {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => { autosaveNow(); }, 3000);
  }

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "hidden") autosaveNow(); };
    const onBye = () => { autosaveNow(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", onBye);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onBye);
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
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
    ctx.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(true);
  }
  function doRedo() {
    const ctx = ctxRef.current; if (!ctx) return;
    const next = redoStack.current.pop();
    if (!next) return;
    ctx.putImageData(next, 0, 0);
    undoStack.current.push(next);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
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
        <span className="text-[11px] text-neutral-400 tabular-nums w-12 text-right">{(view.scale * 100).toFixed(0)}%</span>
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
          bottom: 12, zIndex: 10,
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
        <span style={{ color: saveState === "error" ? "#f87171" : saveState === "saving" ? "#A855F7" : "#00F5D4" }}>
          {saveState === "saving" ? "Saving…"
            : saveState === "error" ? "Save failed"
            : savedAgo ? `Saved ${formatAgo(savedAgo)}`
            : "Autosave on"}
        </span>
      </div>
    </div>
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
