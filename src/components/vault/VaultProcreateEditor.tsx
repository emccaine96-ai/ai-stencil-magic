import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  X, Save, Undo2, Redo2, Eraser, Hand, Pipette, RotateCcw, Maximize2,
  Droplet, Wind, Sparkles, Contrast, Thermometer, Grid3x3,
} from "lucide-react";
import { saveDocument, type DocumentData } from "@/lib/localDB";
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

  // ---- Init canvas from doc -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctxRef.current = ctx;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.naturalWidth || 1024;
      canvas.height = img.naturalHeight || 1024;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      fitToScreen();
      pushUndo();
    };
    img.onerror = () => {
      canvas.width = 1024; canvas.height = 1024;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1024, 1024);
      fitToScreen();
      pushUndo();
    };
    img.src = doc.originalAIImage ?? doc.thumbnail;
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

  // ---- Undo/redo ------------------------------------------------------------
  function pushUndo() {
    const ctx = ctxRef.current; if (!ctx) return;
    const snap = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    undoStack.current.push(snap);
    if (undoStack.current.length > 30) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
  }
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
  function applyThreshold(level = 128) {
    const ctx = ctxRef.current!;
    const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // NTSC luminance
      const l = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      const v = l < level ? 0 : 255;
      d[i] = d[i+1] = d[i+2] = v;
    }
    ctx.putImageData(img, 0, 0);
    pushUndo();
  }
  function applyThermal() {
    // Stencil-paper purple emulator: darks → deep violet, mids → magenta tint, lights → cream
    const ctx = ctxRef.current!;
    const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 255;
      const r = Math.round(60 + (255 - 60) * Math.pow(l, 1.2));
      const g = Math.round(35 + (245 - 35) * Math.pow(l, 1.7));
      const b = Math.round(95 + (235 - 95) * Math.pow(l, 1.1));
      d[i] = r; d[i+1] = g; d[i+2] = b;
    }
    ctx.putImageData(img, 0, 0);
    pushUndo();
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
    if (tool === "pan") return;
    if (eliteTool) {
      drawingPointerId.current = e.pointerId;
      lastCanvasPt.current = { x: e.clientX, y: e.clientY };
      applyEliteAt(e.clientX, e.clientY, 0, 0);
      return;
    }
    drawingPointerId.current = e.pointerId;
    beginDraw(p);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = pointers.current.get(e.pointerId)!;
    p.cx = e.clientX; p.cy = e.clientY;
    p.pressure = e.pressure > 0 ? e.pressure : p.pressure;

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

  // ---- UI ------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950 text-white flex flex-col touch-none select-none">
      {/* Top bar */}
      <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-neutral-800 bg-neutral-900">
        <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-800" aria-label="Close"><X size={18} /></button>
        <div className="text-sm font-semibold truncate flex-1">{doc.name}</div>
        <button onClick={doUndo} disabled={!canUndo} className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30" aria-label="Undo"><Undo2 size={18} /></button>
        <button onClick={doRedo} disabled={!canRedo} className="p-1.5 rounded hover:bg-neutral-800 disabled:opacity-30" aria-label="Redo"><Redo2 size={18} /></button>
        <button onClick={fitToScreen} className="p-1.5 rounded hover:bg-neutral-800" aria-label="Fit"><Maximize2 size={16} /></button>
        <button onClick={() => setView(v => ({ ...v, scale: 1, x: 0, y: 0 }))} className="p-1.5 rounded hover:bg-neutral-800" aria-label="Reset zoom"><RotateCcw size={16} /></button>
        <button onClick={onSave} className="ml-1 rounded-full bg-gradient-to-r from-[#00F5D4] to-[#00B8A9] text-black px-3 py-1.5 text-xs font-bold flex items-center gap-1">
          <Save size={14} /> Save
        </button>
      </header>

      {/* Workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Brush list */}
        <aside className="w-20 sm:w-28 shrink-0 bg-neutral-900 border-r border-neutral-800 overflow-y-auto p-1">
          {BRUSH_ORDER.map(id => (
            <button
              key={id}
              onClick={() => { setBrushId(id); if (id !== "eraser") setTool("brush"); else setTool("eraser"); }}
              className={`w-full text-left rounded px-2 py-1.5 text-[10px] sm:text-xs mb-0.5 ${brushId === id ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-neutral-800 text-neutral-300"}`}
            >
              {BRUSH_LABELS[id]}
            </button>
          ))}
        </aside>

        {/* Canvas viewport */}
        <div
          ref={wrapRef}
          className="flex-1 relative overflow-hidden bg-neutral-800"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          style={{ touchAction: "none" }}
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
            <canvas
              ref={canvasRef}
              className="bg-white shadow-2xl"
              style={{ imageRendering: view.scale > 2 ? "pixelated" : "auto" }}
            />
          </div>
          <div className="absolute bottom-2 left-2 text-[10px] text-neutral-400 bg-black/40 px-2 py-0.5 rounded">
            {(view.scale * 100).toFixed(0)}%
          </div>
        </div>

        {/* Right controls */}
        <aside className="w-16 sm:w-24 shrink-0 bg-neutral-900 border-l border-neutral-800 flex flex-col items-stretch p-2 gap-2">
          <button onClick={() => setTool("pan")} className={`p-2 rounded ${tool === "pan" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-neutral-800"}`} aria-label="Pan"><Hand size={16} className="mx-auto" /></button>
          <button onClick={() => { setTool("eraser"); setBrushId("eraser"); }} className={`p-2 rounded ${tool === "eraser" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-neutral-800"}`} aria-label="Eraser"><Eraser size={16} className="mx-auto" /></button>
          <button onClick={() => setTool("eyedrop")} className={`p-2 rounded ${tool === "eyedrop" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-neutral-800"}`} aria-label="Eyedropper"><Pipette size={16} className="mx-auto" /></button>

          <div className="mt-2">
            <div className="text-[9px] text-neutral-400 uppercase">Size</div>
            <input type="range" min={1} max={200} value={size} onChange={e => setSize(+e.target.value)} className="w-full" />
            <div className="text-[10px] text-center">{size}px</div>
          </div>
          <div>
            <div className="text-[9px] text-neutral-400 uppercase">Opacity</div>
            <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(+e.target.value / 100)} className="w-full" />
            <div className="text-[10px] text-center">{Math.round(opacity * 100)}%</div>
          </div>

          <div className="mt-1">
            <div className="text-[9px] text-neutral-400 uppercase mb-1">Color</div>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-8 bg-transparent rounded cursor-pointer" />
            <div className="grid grid-cols-3 gap-0.5 mt-1">
              {PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`aspect-square rounded border ${color.toLowerCase() === c ? "border-[#00F5D4]" : "border-neutral-700"}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default VaultProcreateEditor;
