import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback, type PointerEvent } from "react";
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Paintbrush,
  Eraser,
  Sun,
  Moon,
  PaintBucket,
  Download,
  Maximize,
  Printer,
  RotateCcw,
} from "lucide-react";
import { TouchUpCanvasEngine } from "@/lib/touch-up/canvas-engine";
import { INK_COLORS, tintInkMask } from "@/lib/touch-up/ink-lab";
import { buildToneCurveLUT, CURVE_PRESETS } from "@/lib/touch-up/tone-curve";
import { pixelsToInches, inchesToMm } from "@/lib/touch-up/print";
import { enterTattooMode } from "@/lib/touch-up/tattoo-mode";
import { listDocuments, bestExportUrl, type DocumentData } from "@/lib/localDB";
import { saveStencil } from "@/lib/vault";

export const Route = createFileRoute("/touch-up")({
  head: () => ({
    meta: [
      { title: "Touch-Up Studio — AI Stencil Magic" },
      { name: "description", content: "Fix and finish your generated stencil — brush, erase, remove fills, tone curves, ink color, true-size print, and Tattoo Mode." },
    ],
  }),
  component: TouchUpPage,
});

type Tool = "brush" | "erase" | "lighten" | "darken" | "remove-fill";

function TouchUpPage() {
  const [sourceStencil, setSourceStencil] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null); // hidden, pristine reference — never redrawn after load
  const editCanvasRef = useRef<HTMLCanvasElement>(null); // visible, the only mutable layer
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<TouchUpCanvasEngine | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const tattooExitRef = useRef<(() => void) | null>(null);

  const [tool, setTool] = useState<Tool>("brush");
  const [size, setSize] = useState(12);
  const [opacity, setOpacity] = useState(1);
  const [inkColorId, setInkColorId] = useState("purple");
  const [customHex, setCustomHex] = useState("#7C3AED");
  const [dpi, setDpi] = useState(300);
  const [mirror, setMirror] = useState(false);
  const [tattooMode, setTattooMode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Hand-off from create.tsx (same sessionStorage pattern the app already
  // uses for the Vault -> editor hand-off in create.tsx).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("primalprint.touchup.load");
      if (raw) {
        sessionStorage.removeItem("primalprint.touchup.load");
        const parsed = JSON.parse(raw) as { stencil?: string };
        if (parsed.stencil) setSourceStencil(parsed.stencil);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!sourceStencil) return;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      setDims({ w, h });
      const base = baseCanvasRef.current, edit = editCanvasRef.current;
      if (!base || !edit) return;
      base.width = w; base.height = h;
      edit.width = w; edit.height = h;
      base.getContext("2d")!.drawImage(img, 0, 0);
      edit.getContext("2d")!.drawImage(img, 0, 0);
      engineRef.current = new TouchUpCanvasEngine(edit.getContext("2d")!);
      setCanUndo(false);
      setCanRedo(false);
    };
    img.src = sourceStencil;
  }, [sourceStencil]);

  const refreshHistoryButtons = useCallback(() => {
    const e = engineRef.current;
    setCanUndo(!!e?.canUndo());
    setCanRedo(!!e?.canRedo());
  }, []);

  function pointerPos(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = e.currentTarget.width / rect.width;
    const scaleY = e.currentTarget.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const engine = engineRef.current;
    if (!engine) return;
    const p = pointerPos(e);
    if (tool === "remove-fill") {
      const ctx = editCanvasRef.current!.getContext("2d")!;
      const cur = ctx.getImageData(0, 0, editCanvasRef.current!.width, editCanvasRef.current!.height);
      engine.beginStroke();
      const result = engine.removeFillAt(Math.round(p.x), Math.round(p.y), cur);
      ctx.putImageData(result, 0, 0);
      refreshHistoryButtons();
      return;
    }
    engine.beginStroke();
    lastPointRef.current = p;
    engine.strokeAt(p.x, p.y, p.x, p.y, { mode: tool, size, opacity }, e.pressure > 0 ? e.pressure : 1);
    refreshHistoryButtons();
  }
  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (e.buttons !== 1) return;
    const engine = engineRef.current;
    if (!engine || tool === "remove-fill" || !lastPointRef.current) return;
    const p = pointerPos(e);
    engine.strokeAt(p.x, p.y, lastPointRef.current.x, lastPointRef.current.y, { mode: tool, size, opacity }, e.pressure > 0 ? e.pressure : 1);
    lastPointRef.current = p;
  }
  function onPointerUp() {
    lastPointRef.current = null;
  }

  function undo() { engineRef.current?.undo(); refreshHistoryButtons(); }
  function redo() { engineRef.current?.redo(); refreshHistoryButtons(); }

  function resetToOriginal() {
    const base = baseCanvasRef.current, edit = editCanvasRef.current, engine = engineRef.current;
    if (!base || !edit || !engine) return;
    engine.beginStroke();
    edit.getContext("2d")!.drawImage(base, 0, 0);
    refreshHistoryButtons();
  }

  function applyInkColor(hex: string, id: string) {
    const edit = editCanvasRef.current;
    const engine = engineRef.current;
    if (!edit || !engine) return;
    const ctx = edit.getContext("2d")!;
    engine.beginStroke();
    const cur = ctx.getImageData(0, 0, edit.width, edit.height);
    const tinted = tintInkMask(cur, hex);
    ctx.putImageData(tinted, 0, 0);
    setInkColorId(id);
    refreshHistoryButtons();
  }

  function applyToneCurve(presetKey: keyof typeof CURVE_PRESETS) {
    const edit = editCanvasRef.current;
    const engine = engineRef.current;
    if (!edit || !engine) return;
    const ctx = edit.getContext("2d")!;
    engine.beginStroke();
    const cur = ctx.getImageData(0, 0, edit.width, edit.height);
    const lut = buildToneCurveLUT(CURVE_PRESETS[presetKey]);
    const out = new ImageData(new Uint8ClampedArray(cur.data), cur.width, cur.height);
    for (let i = 3; i < out.data.length; i += 4) {
      out.data[i] = lut[out.data[i]]; // applied to alpha (=ink density) only; RGB and transparent background untouched
    }
    ctx.putImageData(out, 0, 0);
    refreshHistoryButtons();
  }

  function downloadPNG() {
    const edit = editCanvasRef.current;
    if (!edit) return;
    const out = document.createElement("canvas");
    out.width = edit.width;
    out.height = edit.height;
    const octx = out.getContext("2d")!;
    if (mirror) {
      octx.save();
      octx.translate(out.width, 0);
      octx.scale(-1, 1);
      octx.drawImage(edit, 0, 0);
      octx.restore();
    } else {
      octx.drawImage(edit, 0, 0);
    }
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "touched-up-stencil.png";
    a.click();
  }

  async function toggleTattooMode() {
    if (!tattooMode) {
      const el = containerRef.current;
      if (!el) return;
      tattooExitRef.current = await enterTattooMode(el);
      setTattooMode(true);
    } else {
      tattooExitRef.current?.();
      tattooExitRef.current = null;
      setTattooMode(false);
    }
  }

  const physicalIn = dims ? { w: pixelsToInches(dims.w, dpi), h: pixelsToInches(dims.h, dpi) } : null;

  if (!sourceStencil) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground text-sm max-w-xs">
          No stencil to touch up yet. Generate one first, then open it here.
        </p>
        <Link to="/create" className="rounded-full bg-gradient-primary text-primary-foreground px-4 py-2 text-sm font-bold">
          Go to Generator
        </Link>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`min-h-screen bg-background text-foreground ${tattooMode ? "fixed inset-0 z-50 overflow-y-auto" : ""}`}>
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center justify-between gap-2">
          <Link to="/create" className="flex items-center gap-2 text-sm">
            <ChevronLeft size={18} /> <span className="hidden sm:inline">Back</span>
          </Link>
          <span className="font-script text-lg">Touch-Up Studio</span>
          <button onClick={toggleTattooMode} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Maximize size={14} /> <span className="hidden sm:inline">{tattooMode ? "Exit" : "Tattoo Mode"}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 sm:px-4 py-5 space-y-4">
        <div className="relative rounded-3xl overflow-hidden border border-border bg-white">
          <canvas ref={baseCanvasRef} className="hidden" />
          <canvas
            ref={editCanvasRef}
            className="w-full h-auto touch-none block"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {showCompare ? (
            <img
              src={sourceStencil}
              alt="Original (before edits)"
              className="absolute inset-0 h-full w-full object-contain pointer-events-none"
            />
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
          <div className="grid grid-cols-5 gap-1.5">
            {(
              [
                { id: "brush", label: "Brush", icon: Paintbrush },
                { id: "erase", label: "Erase", icon: Eraser },
                { id: "lighten", label: "Lighten", icon: Sun },
                { id: "darken", label: "Darken", icon: Moon },
                { id: "remove-fill", label: "Rm. Fill", icon: PaintBucket },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-semibold border transition ${tool === t.id ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground w-14">Size</label>
            <input type="range" min={1} max={60} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1" />
            <span className="text-xs w-8 text-right">{size}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground w-14">Opacity</label>
            <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="flex-1" />
            <span className="text-xs w-8 text-right">{Math.round(opacity * 100)}%</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button onClick={undo} disabled={!canUndo} className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-semibold disabled:opacity-40 hover:border-primary/50">
              <Undo2 size={14} /> Undo
            </button>
            <button onClick={redo} disabled={!canRedo} className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-semibold disabled:opacity-40 hover:border-primary/50">
              <Redo2 size={14} /> Redo
            </button>
            <button
              onMouseDown={() => setShowCompare(true)}
              onMouseUp={() => setShowCompare(false)}
              onMouseLeave={() => setShowCompare(false)}
              onTouchStart={() => setShowCompare(true)}
              onTouchEnd={() => setShowCompare(false)}
              className="rounded-xl border border-border py-2 text-xs font-semibold hover:border-primary/50"
            >
              Compare
            </button>
            <button onClick={resetToOriginal} className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-semibold hover:border-primary/50">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-semibold">Ink color</div>
          <div className="flex gap-2 flex-wrap">
            {INK_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => applyInkColor(c.hex, c.id)}
                title={c.name}
                className={`h-8 w-8 rounded-full border-2 transition ${inkColorId === c.id ? "border-primary scale-110" : "border-border"}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
            <input
              type="color"
              value={customHex}
              onChange={(e) => { setCustomHex(e.target.value); applyInkColor(e.target.value, "custom"); }}
              className="h-8 w-8 rounded-full border-2 border-border cursor-pointer"
              title="Custom color"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-semibold">Ink density curve</div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(CURVE_PRESETS) as Array<keyof typeof CURVE_PRESETS>).map((k) => (
              <button key={k} onClick={() => applyToneCurve(k)} className="rounded-xl border border-border py-2 text-xs font-semibold hover:border-primary/50 capitalize">
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Printer size={14} /> True-size print
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">DPI</label>
            <input
              type="number"
              value={dpi}
              onChange={(e) => setDpi(Number(e.target.value) || 300)}
              className="flex-1 bg-background border border-border rounded-lg px-2 py-1 text-sm"
            />
          </div>
          {physicalIn ? (
            <p className="text-xs text-muted-foreground">
              {physicalIn.w.toFixed(2)}in × {physicalIn.h.toFixed(2)}in ({inchesToMm(physicalIn.w).toFixed(0)}mm × {inchesToMm(physicalIn.h).toFixed(0)}mm) at {dpi} DPI
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror for transfer (export only — never changes the stored stencil)
          </label>
        </div>

        <button onClick={downloadPNG} className="w-full rounded-full bg-gradient-primary text-primary-foreground py-3 font-bold shadow-glow flex items-center justify-center gap-2">
          <Download size={16} /> Download PNG
        </button>
      </main>
    </div>
  );
}
