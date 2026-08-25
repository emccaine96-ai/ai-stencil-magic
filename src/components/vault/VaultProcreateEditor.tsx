import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Save,
  Undo2,
  Redo2,
  Hand,
  Maximize2,
  Pen,
  Check,
  Eraser,
  Pipette,
} from "lucide-react";
import { saveEditorState, type DocumentData, type EditorState, type LayerState } from "@/lib/localDB";
import {
  buildEditorState,
  makeEditorThumbnail,
  persistFromCanvases,
} from "@/lib/editor-persist";
import { toast } from "sonner";
import {
  DEFAULTS,
  BRUSH_LABELS,
  beginStroke,
  endStroke,
  strokeTo,
  type BrushId,
  type BrushSettings,
  type StrokeContext,
} from "@/lib/brushes";
import { PicsartDock, type PicsartDockHandlers } from "./PicsartDock";
import { useNavigate } from "@tanstack/react-router";

type Props = {
  doc: DocumentData;
  onClose: () => void;
  onSaved: () => void;
};

type Tool = "brush" | "eraser" | "pan" | "eyedrop";

/**
 * Vault studio editor — unified save path + first-run Draw coach.
 * Loads layered state, supports draw/pan/undo, and persists via persistFromCanvases.
 */
export function VaultProcreateEditor({ doc, onClose, onSaved }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const refCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const refCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokeRefs = useRef<StrokeContext[]>([]);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const drawingPointerId = useRef<number | null>(null);
  const pointers = useRef<
    Map<number, { id: number; cx: number; cy: number; pressure: number }>
  >(new Map());
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const autosaveDirty = useRef(false);

  const [brushId, setBrushId] = useState<BrushId>("hard-round");
  const [tool, setTool] = useState<Tool>("pan");
  const [color, setColor] = useState("#000000");
  const [size, setSize] = useState(18);
  const [opacity, setOpacity] = useState(1);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  viewRef.current = view;
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [refLoaded, setRefLoaded] = useState(false);
  const [refOpacity] = useState(0.4);
  const [refVisible] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [drawMode, setDrawMode] = useState(false);
  const [coachVisible, setCoachVisible] = useState(false);

  const navigate = useNavigate();

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

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctxRef.current = ctx;
    const refCanvas = refCanvasRef.current!;
    const refCtx = refCanvas.getContext("2d", { willReadFrequently: true })!;
    refCtxRef.current = refCtx;
    ctx.imageSmoothingEnabled = false;
    refCtx.imageSmoothingEnabled = false;

    let layers: LayerState[] | null = null;
    if (doc.layeredEditorData) {
      try {
        layers = (JSON.parse(doc.layeredEditorData) as EditorState).layers;
      } catch {
        layers = null;
      }
    }

    const stencilSrc =
      layers?.find((l) => l.name === "Stencil")?.dataUrl ??
      doc.originalAIImage ??
      doc.thumbnail;
    const refSrc = layers?.find((l) => l.name === "Reference")?.dataUrl ?? null;

    const loadInto = (
      target: HTMLCanvasElement,
      targetCtx: CanvasRenderingContext2D,
      src: string | null,
      fillWhite: boolean,
    ) =>
      new Promise<void>((resolve) => {
        if (!src) {
          resolve();
          return;
        }
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
      await loadInto(canvas, ctx, stencilSrc, true);
      if (!canvas.width) {
        canvas.width = 1024;
        canvas.height = 1024;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 1024, 1024);
      }
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

  useEffect(() => {
    const isPractice =
      (doc.tags && doc.tags.includes("practice")) || doc.style === "freehand";
    if (!isPractice) return;
    try {
      if (
        typeof window !== "undefined" &&
        localStorage.getItem("asm.coach.draw.v1") === "1"
      ) {
        return;
      }
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => setCoachVisible(true), 700);
    return () => window.clearTimeout(t);
  }, [doc.id, doc.tags, doc.style]);

  const dismissCoach = useCallback(() => {
    setCoachVisible(false);
    try {
      localStorage.setItem("asm.coach.draw.v1", "1");
    } catch {
      /* ignore */
    }
  }, []);

  function pushUndo() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    undoStack.current.push(snap);
    while (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
    autosaveDirty.current = true;
  }

  const autosaveNow = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaveState("saving");
    try {
      const editorState = buildEditorState(canvas, refCanvasRef.current, {
        refLoaded,
        refVisible,
        refOpacity,
      });
      const thumb = makeEditorThumbnail(canvas);
      await saveEditorState(doc.id, editorState, thumb);
      setSaveState("saved");
    } catch (err) {
      console.error("[editor] autosave failed", err);
      setSaveState("error");
    }
  }, [doc.id, refLoaded, refVisible, refOpacity]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (autosaveDirty.current) {
        autosaveDirty.current = false;
        autosaveNow();
      }
    }, 120_000);
    return () => window.clearInterval(id);
  }, [autosaveNow]);

  useEffect(() => {
    const flush = () => {
      if (autosaveDirty.current) {
        autosaveDirty.current = false;
        autosaveNow();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", flush);
    };
  }, [autosaveNow]);

  function doUndo() {
    const ctx = ctxRef.current;
    if (!ctx || undoStack.current.length < 2) return;
    const cur = undoStack.current.pop()!;
    redoStack.current.push(cur);
    ctx.putImageData(undoStack.current[undoStack.current.length - 1], 0, 0);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(true);
  }

  function doRedo() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const next = redoStack.current.pop();
    if (!next) return;
    ctx.putImageData(next, 0, 0);
    undoStack.current.push(next);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }

  function screenToCanvas(cx: number, cy: number) {
    const wrap = wrapRef.current!;
    const rect = wrap.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (cx - rect.left - v.x) / v.scale,
      y: (cy - rect.top - v.y) / v.scale,
    };
  }

  function beginDraw(cx: number, cy: number, pressure: number) {
    const ctx = ctxRef.current!;
    const settings: BrushSettings = {
      ...DEFAULTS[brushId],
      id: tool === "eraser" ? "eraser" : brushId,
      color,
      size: Math.max(1, size),
      opacity: Math.max(0.02, Math.min(1, opacity)),
    };
    const { x, y } = screenToCanvas(cx, cy);
    strokeRefs.current = [beginStroke(ctx, settings)];
    strokeTo(strokeRefs.current[0], x, y, pressure);
  }

  function continueDraw(cx: number, cy: number, pressure: number) {
    if (!strokeRefs.current.length) return;
    const { x, y } = screenToCanvas(cx, cy);
    strokeTo(strokeRefs.current[0], x, y, pressure);
  }

  function endDraw() {
    if (strokeRefs.current.length) {
      strokeRefs.current.forEach(endStroke);
      strokeRefs.current = [];
      pushUndo();
    }
  }

  function eyedropAt(cx: number, cy: number) {
    const ctx = ctxRef.current!;
    const { x, y } = screenToCanvas(cx, cy);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= ctx.canvas.width || iy >= ctx.canvas.height) return;
    const d = ctx.getImageData(ix, iy, 1, 1).data;
    if (d[3] === 0) return;
    setColor(
      "#" +
        [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join(""),
    );
    setTool("brush");
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const pressure =
      e.pressure > 0 ? e.pressure : e.pointerType === "pen" ? 0.5 : 1;
    pointers.current.set(e.pointerId, {
      id: e.pointerId,
      cx: e.clientX,
      cy: e.clientY,
      pressure,
    });

    if (pointers.current.size >= 2) {
      if (drawingPointerId.current !== null) {
        endDraw();
        drawingPointerId.current = null;
      }
      return;
    }

    if (tool === "eyedrop") {
      eyedropAt(e.clientX, e.clientY);
      return;
    }
    if (tool === "pan") return;

    drawingPointerId.current = e.pointerId;
    beginDraw(e.clientX, e.clientY, pressure);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = pointers.current.get(e.pointerId)!;
    p.cx = e.clientX;
    p.cy = e.clientY;
    p.pressure = e.pressure > 0 ? e.pressure : p.pressure;

    if (e.pointerId === drawingPointerId.current) {
      continueDraw(e.clientX, e.clientY, p.pressure);
    } else if (tool === "pan" && pointers.current.size === 1) {
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
  }

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

  async function onSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaveState("saving");
    try {
      await persistFromCanvases(doc, canvas, refCanvasRef.current, {
        refLoaded,
        refVisible,
        refOpacity,
        snapshotChanges: "Manual save",
      });
      autosaveDirty.current = false;
      setSaveState("saved");
      toast.success("Stencil saved");
      onSaved();
    } catch (err) {
      console.error("[editor] save failed", err);
      setSaveState("error");
      toast.error("Save failed — storage may be full");
    }
  }

  const enterDrawMode = useCallback(() => {
    setDrawMode(true);
    setTool("brush");
    toast.info("Draw mode — brush active", { duration: 2000 });
  }, []);

  const exitDrawMode = useCallback(() => {
    setDrawMode(false);
    setTool("pan");
  }, []);

  const dockHandlers: PicsartDockHandlers = {
    openCrop: () => toast.info("Crop in full studio"),
    setSelectionMode: () => toast.info("Selection in full studio"),
    openAdjust: () => toast.info("Adjust in full studio"),
    enhance: () => toast.info("Enhance in full studio"),
    resizeMenu: () => toast.info("Resize in full studio"),
    flipH: () => toast.info("Flip in full studio"),
    flipV: () => toast.info("Flip in full studio"),
    rotate90: () => toast.info("Rotate in full studio"),
    perspective: () => toast.info("Perspective in full studio"),
    tiltShift: () => toast.info("Tilt shift in full studio"),
    aiExpand: () => toast.info("Expand in full studio"),
    aiReplace: () => toast.info("Replace in full studio"),
    dispersion: () => toast.info("Dispersion in full studio"),
    stretch: () => toast.info("Stretch in full studio"),
    motion: () => toast.info("Motion in full studio"),
    shapeCrop: () => toast.info("Shape crop in full studio"),
    freeCrop: () => toast.info("Free crop in full studio"),
    cloneStamp: () => toast.info("Clone in full studio"),
    curves: () => toast.info("Curves in full studio"),
    upscale6k: () => toast.info("Upscale in full studio"),
    stencilClean: () => toast.info("Stencil clean in full studio"),
    threshold: () => toast.info("Threshold in full studio"),
    thermalBlue: () => toast.info("Thermal in full studio"),
    thermalPurple: () => toast.info("Thermal in full studio"),
    sharpen: () => toast.info("Sharpen in full studio"),
    blur: () => toast.info("Blur in full studio"),
    vignette: () => toast.info("Vignette in full studio"),
    haltungone: () => toast.info("Halftone in full studio"),
    pixelate: () => toast.info("Pixelate in full studio"),
    posterize: () => toast.info("Posterize in full studio"),
    edge: () => toast.info("Edge in full studio"),
    grain: () => toast.info("Grain in full studio"),
    sepia: () => toast.info("Sepia in full studio"),
    lensFlare: () => toast.info("Lens flare in full studio"),
    glow: () => toast.info("Glow in full studio"),
    chromatic: () => toast.info("Chromatic in full studio"),
    gradientMap: () => toast.info("Gradient map in full studio"),
    smudge: () => toast.info("Smudge in full studio"),
    heal: () => toast.info("Heal in full studio"),
    liquifyPush: () => toast.info("Liquify in full studio"),
    liquifyInflate: () => toast.info("Liquify in full studio"),
    liquifyDeflate: () => toast.info("Liquify in full studio"),
    removeBg: () => toast.info("Remove BG in full studio"),
    cutout: () => toast.info("Cutout in full studio"),
    text: () => toast.info("Text in full studio"),
    addPhoto: () => toast.info("Reference in full studio"),
    openBrushes: () => enterDrawMode(),
    shapeMask: () => toast.info("Shape mask in full studio"),
    frame: () => toast.info("Frame in full studio"),
    callout: () => toast.info("Callout in full studio"),
    draw: () => enterDrawMode(),
    sticker: () => toast.info("Sticker in full studio"),
    aiTryOn: () => navigate({ to: "/plugins" }),
    apps: () => navigate({ to: "/plugins" }),
    myFolders: () => onClose(),
    border: () => toast.info("Border in full studio"),
    shape: () => toast.info("Shape in full studio"),
    mask: () => toast.info("Mask in full studio"),
  } as PicsartDockHandlers;

  return (
    <div
      className="fixed inset-0 z-[100] text-white touch-none select-none"
      style={{ background: "#0d0d0f" }}
    >
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
            left: 0,
            top: 0,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          <canvas
            ref={refCanvasRef}
            className="absolute inset-0 bg-white shadow-[0_30px_120px_-30px_rgba(0,0,0,0.7)]"
            style={{
              opacity: refVisible ? refOpacity : 0,
              pointerEvents: "none",
            }}
          />
          <canvas ref={canvasRef} className="relative bg-white shadow-2xl" />
        </div>
      </div>

      <header
        className="absolute left-0 right-0 top-0 flex items-center gap-2 px-3"
        style={{
          height: 50,
          zIndex: 10,
          background: "rgba(18,18,22,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10" aria-label="Close">
          <X size={18} />
        </button>
        <div className="text-sm font-semibold truncate flex-1">{doc.name}</div>
        {drawMode && (
          <button
            onClick={exitDrawMode}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 bg-[#00F5D4] text-black"
          >
            <Check size={13} /> Done
          </button>
        )}
        <button
          onClick={doUndo}
          disabled={!canUndo}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          onClick={doRedo}
          disabled={!canRedo}
          className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
        <button onClick={fitToScreen} className="p-1.5 rounded hover:bg-white/10" aria-label="Fit">
          <Maximize2 size={16} />
        </button>
        <span className="text-[11px] text-neutral-400 tabular-nums w-12 text-right">
          {(view.scale * 100).toFixed(0)}%
        </span>
        <button
          onClick={onSave}
          disabled={saveState === "saving"}
          className="ml-1 rounded-full bg-gradient-to-r from-[#00F5D4] to-[#00B8A9] text-black px-3 py-1.5 text-xs font-bold flex items-center gap-1"
        >
          <Save size={14} /> {saveState === "saving" ? "Saving…" : "Save Stencil"}
        </button>
      </header>

      {drawMode && (
        <aside
          className="absolute flex flex-col gap-2 p-2"
          style={{
            top: 60,
            left: 10,
            width: 56,
            zIndex: 10,
            borderRadius: 8,
            background: "rgba(18,18,22,0.85)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={() => setTool("brush")}
            className={`p-2 rounded ${tool === "brush" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`}
            aria-label="Brush"
          >
            <Pen size={16} className="mx-auto" />
          </button>
          <button
            onClick={() => setTool("pan")}
            className={`p-2 rounded ${tool === "pan" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`}
            aria-label="Pan"
          >
            <Hand size={16} className="mx-auto" />
          </button>
          <button
            onClick={() => {
              setTool("eraser");
              setBrushId("eraser");
            }}
            className={`p-2 rounded ${tool === "eraser" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`}
            aria-label="Eraser"
          >
            <Eraser size={16} className="mx-auto" />
          </button>
          <button
            onClick={() => setTool("eyedrop")}
            className={`p-2 rounded ${tool === "eyedrop" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`}
            aria-label="Eyedropper"
          >
            <Pipette size={16} className="mx-auto" />
          </button>
          <div>
            <div className="text-[8px] text-neutral-500 uppercase text-center">Size</div>
            <input
              type="range"
              min={1}
              max={120}
              value={size}
              onChange={(e) => setSize(+e.target.value)}
              className="w-full"
            />
            <div className="text-[9px] text-center text-neutral-400">{size}</div>
          </div>
          <label className="block">
            <span className="block text-[8px] text-neutral-500 uppercase text-center mb-1">
              Color
            </span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-8 bg-transparent rounded cursor-pointer"
            />
          </label>
          <div className="text-[9px] text-center text-neutral-500 truncate px-0.5">
            {BRUSH_LABELS[brushId] ?? brushId}
          </div>
        </aside>
      )}

      {coachVisible && !drawMode && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[20] max-w-[min(360px,92vw)]"
          style={{ bottom: 100 }}
        >
          <div
            className="rounded-2xl px-4 py-3 text-sm shadow-2xl"
            style={{
              background: "rgba(18,18,22,0.96)",
              border: "1px solid rgba(0,245,212,0.35)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 12px 40px -8px rgba(0,245,212,0.25)",
            }}
          >
            <div className="font-bold text-[#00F5D4] mb-1 flex items-center gap-1.5">
              <Pen size={14} /> Ready to draw
            </div>
            <p className="text-[12px] text-neutral-300 leading-relaxed mb-3">
              You&apos;re in <span className="text-white font-semibold">Pan</span> mode so the
              canvas is safe to navigate. Tap{" "}
              <span className="text-[#00F5D4] font-semibold">Draw</span> on the dock below to open
              brushes.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  enterDrawMode();
                  dismissCoach();
                }}
                className="flex-1 rounded-full bg-gradient-to-r from-[#00F5D4] to-[#00B8A9] text-black text-xs font-bold py-2"
              >
                Start Drawing
              </button>
              <button
                type="button"
                onClick={dismissCoach}
                className="rounded-full border border-white/15 px-3 py-2 text-xs text-neutral-300 hover:bg-white/5"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <PicsartDock handlers={dockHandlers} />
    </div>
  );
}

export default VaultProcreateEditor;
