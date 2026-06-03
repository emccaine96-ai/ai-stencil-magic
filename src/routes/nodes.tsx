import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Eraser, FileImage, FileText, Sparkles } from "lucide-react";
import type { CubicBezier, StrokeSample, VectorStroke } from "@/lib/stroke-vector";
import { fitBeziers, simplifyRDP, strokeToSvgPath } from "@/lib/stroke-vector";
import { downloadString, exportSVG, exportThermalPng } from "@/lib/vector-export";
import { PointerRouter } from "@/lib/pointer";

export const Route = createFileRoute("/nodes")({
  head: () => ({
    meta: [
      { title: "Vector Node Editor — PrimalCanvas Studio" },
      { name: "description", content: "Draw and reshape strokes with editable Bézier nodes. Export crisp SVG, PDF, or 1-bit thermal stencil PNG." },
      { property: "og:title", content: "Vector Node Editor — PrimalCanvas" },
      { property: "og:description", content: "Convert freehand strokes into editable, infinite-resolution vector spines." },
    ],
  }),
  component: NodesPage,
});

type EditableStroke = VectorStroke & { beziers: CubicBezier[] };

const STROKE_COLOR = "#0d0d0d";

function NodesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<EditableStroke[]>([]);
  const [active, setActive] = useState<{ strokeIdx: number; nodeIdx: number; handle: "p0" | "c1" | "c2" | "p1" } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const samplesRef = useRef<StrokeSample[]>([]);
  const router = useMemo(() => new PointerRouter({ preferPen: false }), []);
  const [size, setSize] = useState(4);
  const [hint, setHint] = useState("Draw any stroke. Each stroke becomes editable Bézier nodes.");

  const W = 900, H = 560;

  const repaint = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, W, H);
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      if (s.beziers.length) {
        ctx.moveTo(s.beziers[0].p0[0], s.beziers[0].p0[1]);
        for (const b of s.beziers) ctx.bezierCurveTo(b.c1[0], b.c1[1], b.c2[0], b.c2[1], b.p1[0], b.p1[1]);
      }
      ctx.stroke();
    }
  };

  const repaintOverlay = () => {
    const c = overlayRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    strokes.forEach((s, si) => {
      ctx.strokeStyle = "rgba(99,102,241,0.55)";
      ctx.lineWidth = 1;
      s.beziers.forEach((b) => {
        ctx.beginPath(); ctx.moveTo(b.p0[0], b.p0[1]); ctx.lineTo(b.c1[0], b.c1[1]); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.p1[0], b.p1[1]); ctx.lineTo(b.c2[0], b.c2[1]); ctx.stroke();
      });
      s.beziers.forEach((b, bi) => {
        drawHandle(ctx, b.p0[0], b.p0[1], "anchor");
        drawHandle(ctx, b.c1[0], b.c1[1], "control");
        drawHandle(ctx, b.c2[0], b.c2[1], "control");
        if (bi === s.beziers.length - 1) drawHandle(ctx, b.p1[0], b.p1[1], "anchor");
      });
    });
  };

  useEffect(repaint, [strokes]);
  useEffect(repaintOverlay, [strokes, active]);

  const hitTest = (x: number, y: number) => {
    for (let si = 0; si < strokes.length; si++) {
      const s = strokes[si];
      for (let bi = 0; bi < s.beziers.length; bi++) {
        const b = s.beziers[bi];
        const tests: ["p0" | "c1" | "c2" | "p1", number, number][] = [
          ["p0", b.p0[0], b.p0[1]],
          ["c1", b.c1[0], b.c1[1]],
          ["c2", b.c2[0], b.c2[1]],
        ];
        if (bi === s.beziers.length - 1) tests.push(["p1", b.p1[0], b.p1[1]]);
        for (const [h, hx, hy] of tests) {
          if (Math.hypot(hx - x, hy - y) <= 8) return { strokeIdx: si, nodeIdx: bi, handle: h };
        }
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const p = router.accept(e.nativeEvent, rect, 1); if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const hit = hitTest(p.x, p.y);
    if (hit) { setActive(hit); return; }
    setDrawing(true);
    samplesRef.current = [{ x: p.x, y: p.y, p: p.pressure, t: e.timeStamp }];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const p = router.accept(e.nativeEvent, rect, 1); if (!p) return;
    if (active) {
      setStrokes(prev => {
        const next = prev.slice();
        const s = { ...next[active.strokeIdx] };
        s.beziers = s.beziers.slice();
        const b = { ...s.beziers[active.nodeIdx] } as CubicBezier;
        const point: [number, number] = [p.x, p.y];
        if (active.handle === "p0") b.p0 = point;
        if (active.handle === "c1") b.c1 = point;
        if (active.handle === "c2") b.c2 = point;
        if (active.handle === "p1") b.p1 = point;
        s.beziers[active.nodeIdx] = b;
        // Keep neighbor seam continuous when p0/p1 move.
        if (active.handle === "p1" && active.nodeIdx + 1 < s.beziers.length) {
          s.beziers[active.nodeIdx + 1] = { ...s.beziers[active.nodeIdx + 1], p0: point };
        }
        if (active.handle === "p0" && active.nodeIdx > 0) {
          s.beziers[active.nodeIdx - 1] = { ...s.beziers[active.nodeIdx - 1], p1: point };
        }
        next[active.strokeIdx] = s;
        return next;
      });
      return;
    }
    if (!drawing) return;
    samplesRef.current.push({ x: p.x, y: p.y, p: p.pressure, t: e.timeStamp });
    // Live preview stroke
    const ctx = canvasRef.current!.getContext("2d")!;
    repaint();
    ctx.strokeStyle = STROKE_COLOR; ctx.lineWidth = size; ctx.lineCap = "round";
    ctx.beginPath();
    const s = samplesRef.current;
    ctx.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
    ctx.stroke();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    router.release(e.nativeEvent);
    if (active) { setActive(null); return; }
    if (!drawing) return;
    setDrawing(false);
    const raw = samplesRef.current;
    samplesRef.current = [];
    if (raw.length < 2) return;
    const simplified = simplifyRDP(raw, 1.5);
    const beziers = fitBeziers(simplified);
    setStrokes(prev => [...prev, {
      id: crypto.randomUUID(),
      brushId: "ink-pen",
      color: STROKE_COLOR,
      size,
      samples: simplified,
      beziers,
    }]);
    setHint(`Stroke captured · ${simplified.length} nodes · drag handles to reshape.`);
  };

  const onExportSvg = () => {
    const svg = exportSVG({ width: W, height: H, strokes, background: "#ffffff" });
    downloadString("primalcanvas-vector.svg", "image/svg+xml", svg);
  };
  const onExportThermal = () => {
    const png = exportThermalPng({ width: W, height: H, strokes });
    downloadString("primalcanvas-stencil-thermal.png", "image/png", png);
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Vector Node Editor
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground/70 flex items-center gap-2">
            Width
            <input type="range" min={1} max={24} value={size} onChange={(e) => setSize(Number(e.target.value))} />
            <span className="tabular-nums w-6 text-right">{size}</span>
          </label>
          <Button variant="ghost" size="sm" onClick={() => { setStrokes([]); setHint("Cleared."); }}>
            <Eraser className="w-4 h-4 mr-1" /> Clear
          </Button>
          <Button size="sm" variant="outline" onClick={onExportSvg}>
            <FileText className="w-4 h-4 mr-1" /> SVG
          </Button>
          <Button size="sm" onClick={onExportThermal}>
            <FileImage className="w-4 h-4 mr-1" /> Thermal PNG
          </Button>
        </div>
      </header>

      <section className="p-4">
        <p className="text-sm text-foreground/70 mb-3">{hint}</p>
        <div className="relative inline-block rounded-lg overflow-hidden border border-border shadow-sm" style={{ width: W, maxWidth: "100%" }}>
          <canvas ref={canvasRef} width={W} height={H} className="block" style={{ background: "#fafafa", maxWidth: "100%", height: "auto" }} />
          <canvas
            ref={overlayRef}
            width={W} height={H}
            className="absolute inset-0 touch-none"
            style={{ maxWidth: "100%", height: "auto" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        </div>
        <div className="mt-4 text-xs text-foreground/60 max-w-2xl">
          Each freehand stroke is simplified (Ramer–Douglas–Peucker) and converted into
          a chain of cubic Bézier segments. Indigo squares are anchor nodes; circles are
          control handles. Drag anything to reshape the spine at infinite resolution.
        </div>
      </section>
    </main>
  );
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "anchor" | "control") {
  ctx.save();
  if (kind === "anchor") {
    ctx.fillStyle = "#4f46e5";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.strokeRect(x - 4, y - 4, 8, 8);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
