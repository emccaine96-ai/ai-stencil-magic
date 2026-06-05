import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { BUILTIN_BRUSHES, BRUSH_CATEGORIES, type Brush, toLegacyBrush } from "@/lib/advanced-brushes";
import { beginStroke, strokeTo, endStroke } from "@/lib/brushes";
import { MobileToolbarAdvanced } from "@/components/studio/MobileToolbarAdvanced";
import { readPointer, resetPointerSampler } from "@/lib/tilt-pressure";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/brushes")({
  component: BrushPlayground,
  head: () => ({
    meta: [
      { title: "Brush Studio — PrimalCanvas 2.0" },
      { name: "description", content: "27 pro brushes with pressure, tilt and texture for tattoo stencil design." },
    ],
  }),
});

function BrushPlayground() {
  const [brush, setBrush] = useState<Brush>(BUILTIN_BRUSHES[3]); // Fine Liner
  const [size, setSize] = useState<number>(brush.params.size);
  const [flow, setFlow] = useState<number>(brush.params.flow);
  const [color, setColor] = useState<string>("#111111");
  const [active, setActive] = useState<"brush" | "eraser">("brush");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const sc = useRef<ReturnType<typeof beginStroke> | null>(null);

  useEffect(() => { setSize(brush.params.size); setFlow(brush.params.flow); }, [brush]);

  // Init canvas size
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const resize = () => {
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pushUndo = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    undoStack.current.push(ctx.getImageData(0, 0, c.width, c.height));
    if (undoStack.current.length > 30) undoStack.current.shift();
    redoStack.current.length = 0;
  };

  const undo = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    const snap = undoStack.current.pop(); if (!snap) return;
    redoStack.current.push(ctx.getImageData(0, 0, c.width, c.height));
    ctx.putImageData(snap, 0, 0);
  };
  const redo = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    const snap = redoStack.current.pop(); if (!snap) return;
    undoStack.current.push(ctx.getImageData(0, 0, c.width, c.height));
    ctx.putImageData(snap, 0, 0);
  };
  const clearCanvas = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    pushUndo();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    pushUndo();
    resetPointerSampler();
    const liveBrush: Brush = active === "eraser"
      ? { ...brush, type: "eraser", params: { ...brush.params, size, flow, color } }
      : { ...brush, params: { ...brush.params, size, flow, color } };
    sc.current = beginStroke(ctx, toLegacyBrush(liveBrush, color));
    drawing.current = true;
    const p = readPointer(e.nativeEvent, c.getBoundingClientRect(), 1);
    strokeTo(sc.current, p.x, p.y, p.pressure);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current || !sc.current) return;
    const c = canvasRef.current!;
    const p = readPointer(e.nativeEvent, c.getBoundingClientRect(), 1);
    strokeTo(sc.current, p.x, p.y, p.pressure);
  };
  const onPointerUp = () => {
    if (sc.current) endStroke(sc.current);
    sc.current = null; drawing.current = false;
  };

  const grouped = useMemo(() => {
    const map: Record<string, Brush[]> = {};
    for (const cat of BRUSH_CATEGORIES) map[cat] = [];
    for (const b of BUILTIN_BRUSHES) if (b.category) map[b.category].push(b);
    return map;
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-border">
        <Link to="/" className="p-2 -ml-2 hover:bg-muted rounded"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="font-semibold">Brush Studio</h1>
        <span className="text-xs text-muted-foreground hidden sm:inline">— 27 professional brushes with tilt & pressure</span>
        <div className="flex-1" />
        <Link to="/help" className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted hidden sm:inline-block">Help</Link>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="color" className="w-8 h-8 rounded" />
        <button onClick={clearCanvas} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Clear</button>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <aside className="md:w-72 md:border-r md:border-border overflow-y-auto p-3 hidden md:block">
          {BRUSH_CATEGORIES.map((cat) => (
            <div key={cat} className="mb-4">
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{cat}</h3>
              <div className="grid grid-cols-2 gap-2">
                {grouped[cat].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBrush(b)}
                    className={`text-left rounded-md border p-2 text-xs transition ${brush.id === b.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  >
                    <div className="font-semibold truncate">{b.name}</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2">{b.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <main className="flex-1 relative min-h-[60vh] pb-48 md:pb-4">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </main>
      </div>

      <MobileToolbarAdvanced
        active={active}
        onPickBrush={() => setActive("brush")}
        onPickEraser={() => setActive("eraser")}
        onUndo={undo}
        onRedo={redo}
        onLayers={() => {}}
        onMore={() => {}}
        brushSize={size}
        setBrushSize={setSize}
        brushFlow={flow}
        setBrushFlow={setFlow}
        currentBrush={brush}
        onOpenBrushPicker={() => {
          const idx = BUILTIN_BRUSHES.findIndex((b) => b.id === brush.id);
          setBrush(BUILTIN_BRUSHES[(idx + 1) % BUILTIN_BRUSHES.length]);
        }}
      />
    </div>
  );
}
