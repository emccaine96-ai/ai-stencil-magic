/**
 * VaultProcreateEditor — fullscreen Procreate-style editor overlay.
 *
 * Triggered from the Vault "Edit" button. Bundles in one screen:
 *   • dark #0d0d0f stage with high-contrast white canvas
 *   • left vertical Procreate-style sliders (brush size + intensity)
 *   • top capsule with Mesh Warp / Push / Inflate / Deflate toggles
 *   • right-edge slide-out drawer with 200+ brush presets
 *   • 4×4 mesh-warp vector grid with bilinear triangle warping
 *   • real-time liquify (Push / Inflate / Deflate) with radial falloff
 *   • 2-finger tap on canvas = Undo
 *   • "Save to Vault" commits compressed PNG back to IndexedDB and
 *     refreshes the thumbnail.
 *
 * No standalone routes — this component is the unified editing surface.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, Undo2, Redo2, Brush, Hand, Maximize2, Minimize2, Grid3x3, RotateCcw } from "lucide-react";
import { saveDocument, makeThumbnail, type DocumentData } from "@/lib/localDB";

/* ---------------------------- Brush library ---------------------------- */

const BRUSH_CATEGORIES = [
  "Sketching", "Drawing", "Inking", "Calligraphy", "Painting",
  "Airbrushing", "Textures", "Organic", "Abstract", "Tattoo",
] as const;
type Cat = typeof BRUSH_CATEGORIES[number];

export type BrushPreset = {
  id: string;
  name: string;
  category: Cat;
  size: number;       // base px @ 100% slider
  flow: number;       // 0..1
  hardness: number;   // 0..1 (edge softness)
  spacing: number;    // 0.02..0.5 of size
  jitter: number;     // 0..1 scatter
  rotJitter: number;  // 0..1 rotation jitter
  pressureSize: number; // 0..1
};

function seededRng(seed: number) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) % 10000) / 10000; };
}

/** Generate 200 deterministic, category-balanced presets. */
export function buildBrushLibrary(): BrushPreset[] {
  const out: BrushPreset[] = [];
  const perCat = 20;
  BRUSH_CATEGORIES.forEach((cat, ci) => {
    const rng = seededRng(7919 + ci * 131);
    for (let i = 0; i < perCat; i++) {
      const sizeBase = ({
        Sketching: 6, Drawing: 8, Inking: 5, Calligraphy: 18, Painting: 26,
        Airbrushing: 60, Textures: 32, Organic: 30, Abstract: 40, Tattoo: 7,
      } as Record<Cat, number>)[cat];
      const hardnessBase = ({
        Sketching: 0.75, Drawing: 0.85, Inking: 1.0, Calligraphy: 0.95, Painting: 0.55,
        Airbrushing: 0.08, Textures: 0.7, Organic: 0.5, Abstract: 0.4, Tattoo: 1.0,
      } as Record<Cat, number>)[cat];
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng();
      out.push({
        id: `${cat.toLowerCase()}-${i + 1}`,
        name: `${cat} ${String(i + 1).padStart(2, "0")}`,
        category: cat,
        size: Math.round(sizeBase * (0.6 + r1 * 1.6)),
        flow: 0.4 + r2 * 0.6,
        hardness: Math.min(1, Math.max(0.05, hardnessBase + (r3 - 0.5) * 0.3)),
        spacing: 0.04 + r4 * 0.12 + (cat === "Textures" || cat === "Abstract" ? 0.2 : 0),
        jitter: cat === "Organic" || cat === "Abstract" ? 0.3 + r1 * 0.6 : r1 * 0.15,
        rotJitter: cat === "Textures" || cat === "Abstract" ? r2 : r2 * 0.2,
        pressureSize: cat === "Tattoo" || cat === "Inking" ? 0.3 + r3 * 0.4 : 0.6 + r3 * 0.4,
      });
    }
  });
  return out;
}

/* ---------------------------- Component ---------------------------- */

type Mode = "paint" | "warp" | "push" | "inflate" | "deflate";

export function VaultProcreateEditor({
  doc,
  onClose,
  onSaved,
}: {
  doc: DocumentData;
  onClose: () => void;
  onSaved: (updated: DocumentData) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // Painting-only canvas (ink layer on top of stencil bitmap).
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  // Currently displayed bitmap (warps/liquify rewrite this directly).
  const baseRef = useRef<HTMLCanvasElement | null>(null);

  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("paint");
  const [size, setSize] = useState(40);            // 0..100
  const [intensity, setIntensity] = useState(60);  // 0..100
  const [color, setColor] = useState("#111111");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<Cat>("Sketching");
  const [activeBrushId, setActiveBrushId] = useState("sketching-1");
  const [saving, setSaving] = useState(false);
  const [, force] = useState(0);

  const brushes = useMemo(buildBrushLibrary, []);
  const brush = useMemo(
    () => brushes.find(b => b.id === activeBrushId) ?? brushes[0],
    [brushes, activeBrushId],
  );

  // 4x4 mesh warp grid in normalised coords (0..1)
  const meshRef = useRef<{ x: number; y: number }[]>(buildMesh());
  const meshOrigRef = useRef<{ x: number; y: number }[]>(buildMesh());

  /* ---------- Init: paint the stencil into the working buffer ---------- */
  useEffect(() => {
    let alive = true;
    const W = 1024, H = 1024;
    const cv = canvasRef.current!;
    cv.width = W; cv.height = H;
    overlayRef.current!.width = W; overlayRef.current!.height = H;

    const base = document.createElement("canvas");
    base.width = W; base.height = H;
    const paint = document.createElement("canvas");
    paint.width = W; paint.height = H;
    baseRef.current = base;
    paintRef.current = paint;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      const bctx = base.getContext("2d")!;
      bctx.fillStyle = "#ffffff";
      bctx.fillRect(0, 0, W, H);
      // Fit-contain draw
      const r = img.width / img.height || 1;
      let dw = W, dh = H;
      if (r > 1) dh = Math.round(W / r); else dw = Math.round(H * r);
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      bctx.drawImage(img, dx, dy, dw, dh);
      pushUndo();
      redraw();
      setReady(true);
    };
    img.onerror = () => {
      const bctx = base.getContext("2d")!;
      bctx.fillStyle = "#ffffff";
      bctx.fillRect(0, 0, W, H);
      pushUndo();
      redraw();
      setReady(true);
    };
    img.src = doc.originalAIImage ?? doc.thumbnail;
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  /* ---------- Render pipeline ---------- */
  function redraw() {
    const cv = canvasRef.current; const base = baseRef.current; const paint = paintRef.current;
    if (!cv || !base || !paint) return;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(paint, 0, 0);
    drawOverlay();
  }

  function drawOverlay() {
    const ov = overlayRef.current!; const ctx = ov.getContext("2d")!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    if (mode === "warp") {
      const m = meshRef.current;
      ctx.strokeStyle = "rgba(168,85,247,0.85)";
      ctx.lineWidth = 1.5;
      // grid lines
      for (let r = 0; r < 4; r++) {
        ctx.beginPath();
        for (let c = 0; c < 4; c++) {
          const p = m[r * 4 + c];
          const x = p.x * ov.width, y = p.y * ov.height;
          if (c === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let c = 0; c < 4; c++) {
        ctx.beginPath();
        for (let r = 0; r < 4; r++) {
          const p = m[r * 4 + c];
          const x = p.x * ov.width, y = p.y * ov.height;
          if (r === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "#A855F7";
      for (const p of m) {
        const x = p.x * ov.width, y = p.y * ov.height;
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* ---------- History ---------- */
  function pushUndo() {
    const base = baseRef.current; const paint = paintRef.current;
    if (!base || !paint) return;
    // Composite snapshot of base+paint for compact history.
    const snap = document.createElement("canvas");
    snap.width = base.width; snap.height = base.height;
    const sctx = snap.getContext("2d")!;
    sctx.drawImage(base, 0, 0);
    sctx.drawImage(paint, 0, 0);
    undoStackRef.current.push(sctx.getImageData(0, 0, snap.width, snap.height));
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
    redoStackRef.current = [];
  }

  function undo() {
    if (undoStackRef.current.length <= 1) return;
    const cur = undoStackRef.current.pop()!;
    redoStackRef.current.push(cur);
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    const base = baseRef.current!; const paint = paintRef.current!;
    base.getContext("2d")!.putImageData(prev, 0, 0);
    paint.getContext("2d")!.clearRect(0, 0, paint.width, paint.height);
    redraw();
    force(n => n + 1);
  }

  function redo() {
    const e = redoStackRef.current.pop(); if (!e) return;
    undoStackRef.current.push(e);
    const base = baseRef.current!; const paint = paintRef.current!;
    base.getContext("2d")!.putImageData(e, 0, 0);
    paint.getContext("2d")!.clearRect(0, 0, paint.width, paint.height);
    redraw();
    force(n => n + 1);
  }

  /* ---------- Pointer ---------- */
  type P = { x: number; y: number; pressure: number };

  function toCanvas(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * cv.width,
      y: ((e.clientY - r.top) / r.height) * cv.height,
    };
  }

  const strokeRef = useRef<{ last: P | null; warpNode: number | null }>({ last: null, warpNode: null });

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    if (mode === "warp") {
      const cv = canvasRef.current!;
      const idx = pickMeshNode(meshRef.current, p.x / cv.width, p.y / cv.height);
      strokeRef.current.warpNode = idx;
      return;
    }
    strokeRef.current.last = { x: p.x, y: p.y, pressure: e.pressure || 0.5 };
    if (mode === "paint") {
      stamp(p.x, p.y, e.pressure || 0.5);
    } else {
      liquify(p.x, p.y, 0, 0);
    }
    redraw();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode === "warp") {
      const idx = strokeRef.current.warpNode;
      if (idx == null) return;
      const cv = canvasRef.current!;
      const p = toCanvas(e);
      const m = meshRef.current.slice();
      m[idx] = {
        x: Math.min(1, Math.max(0, p.x / cv.width)),
        y: Math.min(1, Math.max(0, p.y / cv.height)),
      };
      meshRef.current = m;
      applyMeshWarp();
      return;
    }
    const last = strokeRef.current.last; if (!last) return;
    const p = toCanvas(e);
    const pr = e.pressure || 0.5;
    if (mode === "paint") {
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      const step = Math.max(1, brushPx() * brush.spacing);
      const steps = Math.max(1, Math.floor(dist / step));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stamp(last.x + (p.x - last.x) * t, last.y + (p.y - last.y) * t, last.pressure + (pr - last.pressure) * t);
      }
    } else {
      liquify(p.x, p.y, p.x - last.x, p.y - last.y);
    }
    strokeRef.current.last = { x: p.x, y: p.y, pressure: pr };
    redraw();
  }

  function onUp() {
    if (mode === "warp" && strokeRef.current.warpNode != null) {
      pushUndo();
    } else if (strokeRef.current.last) {
      pushUndo();
    }
    strokeRef.current.last = null;
    strokeRef.current.warpNode = null;
  }

  /* ---------- Brush stamping ---------- */
  function brushPx() {
    // Map size slider 0..100 to 1..240 px
    return Math.max(1, Math.round((size / 100) * 240));
  }

  function stamp(x: number, y: number, pressure: number) {
    const paint = paintRef.current!;
    const ctx = paint.getContext("2d")!;
    const radius = (brushPx() / 2) * (1 - brush.pressureSize + brush.pressureSize * pressure);
    const alpha = (intensity / 100) * brush.flow * (0.5 + 0.5 * pressure);
    const jx = (Math.random() - 0.5) * radius * brush.jitter;
    const jy = (Math.random() - 0.5) * radius * brush.jitter;
    const cx = x + jx, cy = y + jy;
    const g = ctx.createRadialGradient(cx, cy, radius * brush.hardness, cx, cy, radius);
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- Liquify ---------- */
  function liquify(x: number, y: number, dx: number, dy: number) {
    const base = baseRef.current!;
    const ctx = base.getContext("2d")!;
    const radius = brushPx();
    const strength = (intensity / 100) * 0.8;
    const x0 = Math.max(0, Math.floor(x - radius));
    const y0 = Math.max(0, Math.floor(y - radius));
    const x1 = Math.min(base.width, Math.ceil(x + radius));
    const y1 = Math.min(base.height, Math.ceil(y + radius));
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const src = ctx.getImageData(x0, y0, w, h);
    const dst = ctx.createImageData(w, h);
    const sd = src.data, dd = dst.data;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = i + x0, py = j + y0;
        const ddx = px - x, ddy = py - y;
        const d = Math.hypot(ddx, ddy);
        let sx = px, sy = py;
        if (d < radius) {
          const falloff = Math.cos((d / radius) * Math.PI * 0.5);
          if (mode === "push") {
            sx = px - dx * strength * falloff;
            sy = py - dy * strength * falloff;
          } else if (mode === "inflate") {
            sx = px - (ddx / Math.max(0.001, d)) * radius * 0.4 * strength * falloff;
            sy = py - (ddy / Math.max(0.001, d)) * radius * 0.4 * strength * falloff;
          } else if (mode === "deflate") {
            sx = px + (ddx / Math.max(0.001, d)) * radius * 0.4 * strength * falloff;
            sy = py + (ddy / Math.max(0.001, d)) * radius * 0.4 * strength * falloff;
          }
        }
        // Sample src with clamp + nearest
        const si = Math.min(w - 1, Math.max(0, Math.floor(sx - x0)));
        const sj = Math.min(h - 1, Math.max(0, Math.floor(sy - y0)));
        const so = (sj * w + si) * 4;
        const dO = (j * w + i) * 4;
        dd[dO] = sd[so]; dd[dO + 1] = sd[so + 1]; dd[dO + 2] = sd[so + 2]; dd[dO + 3] = sd[so + 3];
      }
    }
    ctx.putImageData(dst, x0, y0);
  }

  /* ---------- Mesh warp render ---------- */
  function applyMeshWarp() {
    // Re-render base from the ORIGINAL snapshot (undo[0]) using current mesh.
    if (!undoStackRef.current.length) return;
    const orig = undoStackRef.current[0];
    const W = orig.width, H = orig.height;
    const srcCv = document.createElement("canvas");
    srcCv.width = W; srcCv.height = H;
    srcCv.getContext("2d")!.putImageData(orig, 0, 0);

    const base = baseRef.current!;
    const ctx = base.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, base.width, base.height);

    const m = meshRef.current; const o = meshOrigRef.current;
    // Subdivide each 3x3 cell with 2 triangles → 18 triangles
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const tl = r * 4 + c, tr = tl + 1, bl = tl + 4, br = bl + 1;
        drawTriangle(ctx, srcCv, o[tl], o[tr], o[bl], m[tl], m[tr], m[bl]);
        drawTriangle(ctx, srcCv, o[tr], o[br], o[bl], m[tr], m[br], m[bl]);
      }
    }
    redraw();
  }

  function resetMesh() {
    meshRef.current = buildMesh();
    applyMeshWarp();
  }

  /* ---------- 2-finger tap undo ---------- */
  const tapRef = useRef<{ start: number; touches: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) tapRef.current = { start: performance.now(), touches: 2 };
    else tapRef.current = null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const t = tapRef.current; tapRef.current = null;
    if (!t) return;
    if (e.touches.length === 0 && performance.now() - t.start < 220) undo();
  }

  /* ---------- Save ---------- */
  async function save() {
    setSaving(true);
    try {
      const cv = canvasRef.current!;
      // Composite a fresh PNG of the result.
      const out = document.createElement("canvas");
      out.width = cv.width; out.height = cv.height;
      const octx = out.getContext("2d")!;
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(baseRef.current!, 0, 0);
      octx.drawImage(paintRef.current!, 0, 0);
      const dataUrl = out.toDataURL("image/png");
      const thumb = await makeThumbnail(dataUrl, 384);
      const updated = await saveDocument(
        { ...doc, originalAIImage: dataUrl, thumbnail: thumb },
        { changes: "Vault editor save", thumbnail: thumb },
      );
      onSaved(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  /* ---------- UI ---------- */
  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[100] flex items-center justify-center select-none"
      style={{ background: "#0d0d0f", touchAction: "none" }}
      role="dialog"
      aria-label="Vault Procreate Editor"
    >
      {/* Top capsule */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full bg-white/5 backdrop-blur-md border border-white/10 px-1.5 py-1 text-xs text-white">
        <CapBtn active={mode === "paint"} onClick={() => setMode("paint")} icon={<Brush size={14} />} label="Paint" />
        <CapBtn active={mode === "warp"} onClick={() => setMode("warp")} icon={<Grid3x3 size={14} />} label="Mesh Warp" />
        <CapBtn active={mode === "push"} onClick={() => setMode("push")} icon={<Hand size={14} />} label="Push" />
        <CapBtn active={mode === "inflate"} onClick={() => setMode("inflate")} icon={<Maximize2 size={14} />} label="Inflate" />
        <CapBtn active={mode === "deflate"} onClick={() => setMode("deflate")} icon={<Minimize2 size={14} />} label="Deflate" />
        <div className="w-px h-5 bg-white/15 mx-0.5" />
        <CapBtn onClick={undo} icon={<Undo2 size={14} />} label="Undo" />
        <CapBtn onClick={redo} icon={<Redo2 size={14} />} label="Redo" />
        {mode === "warp" && (
          <CapBtn onClick={resetMesh} icon={<RotateCcw size={14} />} label="Reset Mesh" />
        )}
      </div>

      {/* Brush drawer trigger */}
      <button
        onClick={() => setDrawerOpen(o => !o)}
        className="absolute top-3 right-20 z-20 rounded-full bg-white/5 backdrop-blur-md border border-white/10 px-3 py-1.5 text-xs text-white flex items-center gap-1.5 hover:bg-white/10"
      >
        <Brush size={13} /> {brush?.name ?? "Brush"}
      </button>

      {/* Save / Close */}
      <button
        onClick={save}
        disabled={!ready || saving}
        className="absolute top-3 right-3 z-20 rounded-full px-4 py-1.5 text-xs font-bold text-white bg-[#A855F7] hover:bg-[#9333EA] disabled:opacity-50 flex items-center gap-1.5 shadow-[0_0_20px_rgba(168,85,247,0.45)]"
      >
        <Save size={13} /> {saving ? "Saving…" : "Save to Vault"}
      </button>
      <button
        onClick={onClose}
        className="absolute top-14 right-3 z-20 rounded-full p-1.5 text-white/70 hover:text-white hover:bg-white/10"
        aria-label="Close editor"
      >
        <X size={16} />
      </button>

      {/* Left sliders */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex gap-2">
        <VSlider label="Size" value={size} onChange={setSize} />
        <VSlider label="Force" value={intensity} onChange={setIntensity} />
      </div>

      {/* Canvas stage */}
      <div className="relative" style={{ width: "min(86vw, 86vh)", height: "min(86vw, 86vh)" }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full rounded-md shadow-2xl bg-white"
          style={{ touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>

      {/* Right brush drawer */}
      <div
        className={`absolute top-0 right-0 h-full z-30 w-[320px] max-w-[85vw] bg-[#0d0d0f] border-l border-white/10 transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-white font-bold text-sm">Brush Studio</div>
          <button onClick={() => setDrawerOpen(false)} className="text-white/60 hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-3 grid grid-cols-2 gap-1.5">
          {BRUSH_CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`text-[11px] py-1.5 rounded ${activeCat === c ? "bg-[#A855F7] text-white" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            >{c}</button>
          ))}
        </div>
        <div className="px-3 pb-3">
          <div className="text-[10px] text-white/50 mb-1.5">{brushes.filter(b => b.category === activeCat).length} brushes</div>
          <div className="grid grid-cols-2 gap-1.5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
            {brushes.filter(b => b.category === activeCat).map(b => (
              <button
                key={b.id}
                onClick={() => { setActiveBrushId(b.id); setDrawerOpen(false); }}
                className={`text-left p-2 rounded border text-white ${
                  activeBrushId === b.id ? "border-[#A855F7] bg-[#A855F7]/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="text-[11px] font-semibold truncate">{b.name}</div>
                <div className="text-[9px] text-white/50">size {b.size} · flow {b.flow.toFixed(2)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Helpers ---------------------------- */

function CapBtn({ active, onClick, icon, label }: { active?: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full flex items-center gap-1 ${active ? "bg-[#A855F7] text-white" : "text-white/70 hover:text-white hover:bg-white/10"}`}
      title={label}
      aria-label={label}
    >
      {icon}<span className="hidden md:inline">{label}</span>
    </button>
  );
}

function VSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col items-center bg-white/5 backdrop-blur-md border border-white/10 rounded-full py-3 px-1.5 w-10">
      <div className="text-[9px] text-white/60 mb-1">{value}%</div>
      <input
        type="range"
        min={1}
        max={100}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="appearance-none bg-transparent vault-vslider"
        style={{
          // Rotate to vertical via CSS writing-mode-like trick.
          WebkitAppearance: "slider-vertical" as React.CSSProperties["WebkitAppearance"],
          width: 18,
          height: "60vh",
          maxHeight: 360,
          accentColor: "#A855F7",
        }}
        aria-label={label}
      />
      <div className="text-[9px] text-white/70 font-semibold mt-1 tracking-wider">{label[0]}</div>
    </div>
  );
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

function buildMesh() {
  const arr: { x: number; y: number }[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) arr.push({ x: c / 3, y: r / 3 });
  return arr;
}

function pickMeshNode(m: { x: number; y: number }[], x: number, y: number): number | null {
  let best = -1, bd = 0.06 * 0.06;
  for (let i = 0; i < m.length; i++) {
    const dx = m[i].x - x, dy = m[i].y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = i; }
  }
  return best === -1 ? null : best;
}

/** Affine-warp one source triangle onto a destination triangle. */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  s0: { x: number; y: number }, s1: { x: number; y: number }, s2: { x: number; y: number },
  d0: { x: number; y: number }, d1: { x: number; y: number }, d2: { x: number; y: number },
) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sx0 = s0.x * W, sy0 = s0.y * H;
  const sx1 = s1.x * W, sy1 = s1.y * H;
  const sx2 = s2.x * W, sy2 = s2.y * H;
  const dx0 = d0.x * W, dy0 = d0.y * H;
  const dx1 = d1.x * W, dy1 = d1.y * H;
  const dx2 = d2.x * W, dy2 = d2.y * H;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0); ctx.lineTo(dx1, dy1); ctx.lineTo(dx2, dy2); ctx.closePath();
  ctx.clip();

  // Solve affine T such that T * src = dst.
  const a = sx1 - sx0, b = sx2 - sx0, c = sy1 - sy0, d = sy2 - sy0;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-6) { ctx.restore(); return; }
  const inv = 1 / det;
  const ia = d * inv, ib = -b * inv, ic = -c * inv, id = a * inv;
  // x' = m11*x + m12*y + m13  (where x = src.x - sx0)
  const m11 = (dx1 - dx0) * ia + (dx2 - dx0) * ic;
  const m21 = (dy1 - dy0) * ia + (dy2 - dy0) * ic;
  const m12 = (dx1 - dx0) * ib + (dx2 - dx0) * id;
  const m22 = (dy1 - dy0) * ib + (dy2 - dy0) * id;
  const m13 = dx0 - m11 * sx0 - m12 * sy0;
  const m23 = dy0 - m21 * sx0 - m22 * sy0;
  ctx.setTransform(m11, m21, m12, m22, m13, m23);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}