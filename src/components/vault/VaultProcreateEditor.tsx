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

/** Two-finger pinch + pan, single-pointer draw. Matrix-based transform so
 *  zoom anchors stay locked to the midpoint between the fingers — no drift. */
export function VaultProcreateEditor({ doc, onClose, onSaved }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokeRef = useRef<StrokeContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);

  const [brushId, setBrushId] = useState<BrushId>("hard-round");
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(18);
  const [opacity, setOpacity] = useState(1);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
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

  function beginDraw(p: Pt) {
    const ctx = ctxRef.current!;
    const settings: BrushSettings = {
      ...DEFAULTS[brushId],
      id: tool === "eraser" ? "eraser" : brushId,
      color,
      size,
      opacity,
    };
    strokeRef.current = beginStroke(ctx, settings);
    const { x, y } = screenToCanvas(p.cx, p.cy);
    strokeTo(strokeRef.current, x, y, p.pressure);
  }
  function continueDraw(p: Pt) {
    if (!strokeRef.current) return;
    const { x, y } = screenToCanvas(p.cx, p.cy);
    strokeTo(strokeRef.current, x, y, p.pressure);
  }
  function endDraw() {
    if (strokeRef.current) {
      endStroke(strokeRef.current);
      strokeRef.current = null;
      pushUndo();
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
      continueDraw(p);
    } else if (tool === "pan" && pointers.current.size === 1) {
      // single-finger pan when in pan mode
      const v = viewRef.current;
      setView({ ...v, x: v.x + e.movementX, y: v.y + e.movementY });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (e.pointerId === drawingPointerId.current) {
      endDraw();
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
