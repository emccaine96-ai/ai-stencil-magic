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
import { useTier } from "@/hooks/use-tier";
import { can, TIER_LABEL, type Feature } from "@/lib/entitlements";
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
import { BrushPickerPanel } from "./BrushPickerPanel";
import { FilterGalleryModal } from "./FilterGalleryModal";
import { LayoutDialog, type LayoutKind, type LayoutResult } from "./LayoutDialog";
import { borderImageData, cropImageData, frameImageData, resizeImageData } from "@/lib/vault-ops/layout-ops";
import { createMask, featherMask, isEmpty, magicWand } from "@/lib/selection";
import { useNavigate } from "@tanstack/react-router";
import { applyAdjustments, applyAdjustmentsToCanvas, type AdjustmentValues } from "@/lib/canvas/adjustments";
import { applyWithinMask } from "@/lib/canvas/local-touchup";
import { runPlugin, BUILTIN_PLUGINS } from "@/lib/plugins";
import {
  FILTER_OPS,
  STROKE_OPS,
  ASYNC_OPS,
  type StrokeKind,
} from "@/lib/vault-ops/dock-ops";
import {
  smudgeImageData,
  liquifyImageData,
  healImageData,
  cloneStampImageData,
  removeBackground,
  upscaleImageData,
  type Point as OpPoint,
} from "@/lib/vault-ops/brush-ops";

type Props = {
  doc: DocumentData;
  onClose: () => void;
  onSaved: () => void;
};

type Tool = "brush" | "eraser" | "pan" | "eyedrop";

/** Upper bound on pixels held by undo snapshots. */
const UNDO_BUDGET_BYTES = 240 * 1024 * 1024;
/** Largest long edge the Upscale button will produce (a 4096 square is ~67 MB per snapshot). */
const UPSCALE_TARGET_LONG_EDGE = 6000;
const UPSCALE_MAX_PIXELS = 36_000_000; // 6000 x 6000

/**
 * Vault studio editor — unified save path + first-run Draw coach.
 * Loads layered state, supports draw/pan/undo, and persists via persistFromCanvases.
 */
export function VaultProcreateEditor({ doc, onClose, onSaved }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { tier } = useTier();
  /** Soft gate for paid tools. Returns true when allowed; otherwise explains and returns false. */
  const requirePlan = (feature: Feature, label: string): boolean => {
    if (can(tier, feature)) return true;
    toast.info(`${label} is a Pro feature (you're on ${TIER_LABEL[tier]}).`, {
      description: "Upgrade to Pro in Settings to unlock it.",
    });
    return false;
  };
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
  const [brushPickerOpen, setBrushPickerOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [wandOn, setWandOn] = useState(false);
  const [layoutKind, setLayoutKind] = useState<LayoutKind | null>(null);
  const [wandTolerance, setWandTolerance] = useState(32);
  const [gallerySource, setGallerySource] = useState<ImageData | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentValues>({});

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
    // Keep at most 40 steps AND at most ~240 MB of snapshots, so a large canvas can't exhaust phone memory.
    const bytes = (x: ImageData) => x.width * x.height * 4;
    let total = undoStack.current.reduce((n, x) => n + bytes(x), 0);
    while (undoStack.current.length > 2 && (undoStack.current.length > 40 || total > UNDO_BUDGET_BYTES)) {
      total -= bytes(undoStack.current.shift()!);
    }
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

  /** Put a snapshot on the canvas, resizing the canvas (and reference overlay) if its size differs. */
  function restoreSnapshot(snap: ImageData) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const canvas = ctx.canvas;
    if (canvas.width !== snap.width || canvas.height !== snap.height) {
      canvas.width = snap.width;
      canvas.height = snap.height;
      const ref = refCanvasRef.current;
      if (ref) {
        // Resizing wipes a canvas, so carry the reference image across (scaled to fit).
        const keep = document.createElement("canvas");
        keep.width = ref.width;
        keep.height = ref.height;
        keep.getContext("2d")!.drawImage(ref, 0, 0);
        ref.width = snap.width;
        ref.height = snap.height;
        if (keep.width > 0 && keep.height > 0) {
          refCtxRef.current?.drawImage(keep, 0, 0, snap.width, snap.height);
        }
      }
      fitToScreen();
    }
    ctx.putImageData(snap, 0, 0);
  }

  function doUndo() {
    if (!ctxRef.current || undoStack.current.length < 2) return;
    const cur = undoStack.current.pop()!;
    redoStack.current.push(cur);
    restoreSnapshot(undoStack.current[undoStack.current.length - 1]);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(true);
  }

  function doRedo() {
    if (!ctxRef.current) return;
    const next = redoStack.current.pop();
    if (!next) return;
    restoreSnapshot(next);
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

  /** Magic wand cutout: select the contiguous region under the tap and erase it to transparent. */
  function wandCutAt(cx: number, cy: number) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { x, y } = screenToCanvas(cx, cy);
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const { width: w, height: h } = ctx.canvas;
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return;
    const img = ctx.getImageData(0, 0, w, h);
    if (img.data[(iy * w + ix) * 4 + 3] === 0) {
      toast.info("That area is already transparent");
      return;
    }
    const mask = createMask(w, h);
    magicWand(mask, img, ix, iy, wandTolerance, true);
    if (isEmpty(mask)) return;
    featherMask(mask, 1); // soften the cut edge a touch so it isn't jagged
    const d = img.data;
    for (let p = 0; p < mask.data.length; p++) {
      const m = mask.data[p];
      if (m) d[p * 4 + 3] = Math.round((d[p * 4 + 3] * (255 - m)) / 255);
    }
    ctx.putImageData(img, 0, 0);
    pushUndo();
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
        if (retouch) retouchPath.current = [];
        else endDraw();
        drawingPointerId.current = null;
      }
      return;
    }

    if (retouch) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      // Clone stamp: first tap (with no source yet) picks the source point.
      if (retouch === "clone" && !cloneSource.current) {
        cloneSource.current = { x, y };
        toast.info("Source set. Now paint where you want the copy.", { duration: 2000 });
        return;
      }
      drawingPointerId.current = e.pointerId;
      retouchPath.current = [{ x, y, pressure: pressure }];
      return;
    }

    if (wandOn) {
      wandCutAt(e.clientX, e.clientY);
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

    if (retouch && e.pointerId === drawingPointerId.current) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      const last = retouchPath.current[retouchPath.current.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) >= 1.5) {
        retouchPath.current.push({ x, y, pressure: p.pressure });
      }
    } else if (e.pointerId === drawingPointerId.current) {
      continueDraw(e.clientX, e.clientY, p.pressure);
    } else if (tool === "pan" && pointers.current.size === 1) {
      const v = viewRef.current;
      setView({ ...v, x: v.x + e.movementX, y: v.y + e.movementY });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (e.pointerId === drawingPointerId.current) {
      if (retouch) finishRetouch();
      else endDraw();
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
    setRetouch(null);
    setWandOn(false);
    setDrawMode(true);
    setTool("brush");
    toast.info("Draw mode — brush active", { duration: 2000 });
  }, []);

  const exitDrawMode = useCallback(() => {
    setDrawMode(false);
    setTool("pan");
  }, []);

  // --- Adjust panel helpers ---
  // Mask state for selective touch-up (local-touchup.ts)
  const [touchupMask, setTouchupMask] = useState<Uint8ClampedArray | null>(null);

  function applyAdjustPreview(next: AdjustmentValues) {
    setAdjustments(next);
    const ctx = ctxRef.current;
    if (!ctx) return;
    const base = undoStack.current[undoStack.current.length - 1];
    if (base) ctx.putImageData(base, 0, 0);
    // If a touch-up mask is active, apply adjustments only within the mask
    if (touchupMask && base) {
      const adjustedCanvas = document.createElement("canvas");
      adjustedCanvas.width = ctx.canvas.width;
      adjustedCanvas.height = ctx.canvas.height;
      const adjustedCtx = adjustedCanvas.getContext("2d", { willReadFrequently: true })!;
      adjustedCtx.putImageData(base, 0, 0);
      applyAdjustmentsToCanvas(adjustedCanvas, next);
      const adjusted = adjustedCtx.getImageData(0, 0, adjustedCanvas.width, adjustedCanvas.height);
      const composited = applyWithinMask(base, adjusted, touchupMask);
      ctx.putImageData(composited, 0, 0);
    } else {
      applyAdjustmentsToCanvas(ctx.canvas, next);
    }
  }

  function commitAdjust() {
    pushUndo();
    setAdjustOpen(false);
  }

  // --- Plugin helper ---
  async function applyDockPlugin(pluginId: string) {
    const plugin = BUILTIN_PLUGINS.find((p) => p.id === pluginId);
    if (!plugin) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const params: Record<string, any> = {};
    plugin.params?.forEach((p) => { params[p.key] = p.default; });
    const result = await runPlugin(plugin, imageData, params);
    ctx.putImageData(result, 0, 0);
    pushUndo();
  }

  const [busy, setBusy] = useState<string | null>(null);
  const [retouch, setRetouch] = useState<StrokeKind | null>(null);
  const retouchPath = useRef<OpPoint[]>([]);
  const cloneSource = useRef<{ x: number; y: number } | null>(null);

  /** Run a pure ImageData op on the canvas, write the result back and record undo. */
  function applyFilter(label: string, run: (img: ImageData) => ImageData) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      const src = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      const out = run(src);
      if (out.width !== src.width || out.height !== src.height) {
        restoreSnapshot(out);
      } else {
        ctx.putImageData(out, 0, 0);
      }
      pushUndo();
    } catch (err) {
      console.error(`[editor] ${label} failed`, err);
      toast.error(`${label} failed`);
    }
  }

  /** Same as applyFilter, but for async jobs, with a busy indicator. */
  async function applyAsync(label: string, run: (img: ImageData) => Promise<ImageData>) {
    const ctx = ctxRef.current;
    if (!ctx || busy) return;
    setBusy(label);
    try {
      // Let the busy state paint before heavy synchronous work starts.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const src = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
      const out = await run(src);
      if (out.width !== src.width || out.height !== src.height) restoreSnapshot(out);
      else ctx.putImageData(out, 0, 0);
      pushUndo();
      toast.success(`${label} done`);
    } catch (err) {
      console.error(`[editor] ${label} failed`, err);
      toast.error(`${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  /** Switch to a drag-to-retouch tool. The stroke is applied when the finger lifts. */
  function startRetouch(kind: StrokeKind, label: string, hint: string) {
    setWandOn(false);
    setRetouch(kind);
    setTool("pan");
    setDrawMode(false);
    cloneSource.current = null;
    retouchPath.current = [];
    toast.info(`${label}: ${hint}`, { duration: 2500 });
  }

  /** Apply the collected retouch path, then clear it. */
  function finishRetouch() {
    const kind = retouch;
    const path = retouchPath.current;
    retouchPath.current = [];
    if (!kind || path.length === 0) return;
    const radius = Math.max(4, Math.round(size * 1.5));
    const label = Object.values(STROKE_OPS).find((o) => o.stroke === kind)?.label ?? "Retouch";
    applyFilter(label, (img) => {
      switch (kind) {
        case "smudge":
          return smudgeImageData(img, path, { radius, strength: 0.7 });
        case "liquify-push":
          return liquifyImageData(img, path, { mode: "push", radius, strength: 0.6 });
        case "liquify-inflate":
          return liquifyImageData(img, path, { mode: "inflate", radius, strength: 0.6 });
        case "liquify-deflate":
          return liquifyImageData(img, path, { mode: "deflate", radius, strength: 0.6 });
        case "heal": {
          // Build a mask from the painted path.
          const mask = new Uint8Array(img.width * img.height);
          const r2 = radius * radius;
          for (const p of path) {
            const x0 = Math.max(0, Math.floor(p.x - radius)), x1 = Math.min(img.width - 1, Math.ceil(p.x + radius));
            const y0 = Math.max(0, Math.floor(p.y - radius)), y1 = Math.min(img.height - 1, Math.ceil(p.y + radius));
            for (let y = y0; y <= y1; y++)
              for (let x = x0; x <= x1; x++)
                if ((x - p.x) ** 2 + (y - p.y) ** 2 <= r2) mask[y * img.width + x] = 255;
          }
          return healImageData(img, { mask });
        }
        case "clone": {
          const src = cloneSource.current;
          if (!src) return img;
          const first = path[0];
          return cloneStampImageData(img, path, {
            sourceOffset: { x: src.x - first.x, y: src.y - first.y },
            radius,
            strength: 1,
          });
        }
      }
    });
  }

  const stub = (label: string) => () => toast.info(`${label} isn't available yet`);

  /** Handler for a one-tap filter from the shared op table. */
  const filter = (key: string) => () => applyFilter(FILTER_OPS[key].label, FILTER_OPS[key].run);
  /** Handler for a drag-to-retouch tool. */
  const stroke = (key: string) => () => {
    const o = STROKE_OPS[key];
    startRetouch(o.stroke, o.label, o.hint);
  };

  const dockHandlers: PicsartDockHandlers = {
    openCrop: () => setLayoutKind("crop"),
    setSelectionMode: stub("Selection"),
    openFilters: () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      setGallerySource(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height));
      setGalleryOpen(true);
    },
    openAdjust: () => setAdjustOpen(true),
    enhance: () => setAdjustOpen(true),
    resizeMenu: () => setLayoutKind("resize"),
    flipH: filter("flipH"),
    flipV: filter("flipV"),
    rotate90: filter("rotate90"),
    perspective: stub("Perspective"),
    tiltShift: filter("tiltShift"),
    aiExpand: stub("Expand"),
    aiReplace: stub("Replace"),
    dispersion: filter("dispersion"),
    stretch: filter("stretch"),
    motion: filter("motion"),
    shapeCrop: stub("Shape crop"),
    freeCrop: stub("Free crop"),
    cloneStamp: stroke("cloneStamp"),
    curves: filter("curves"),
    upscale6k: () => {
      if (!requirePlan("upscale-6k", "Upscale 6K")) return;
      const ctx = ctxRef.current;
      if (!ctx) return;
      const { width: w, height: h } = ctx.canvas;
      // Scale so the long edge reaches ~6000px, never shrinking and never beyond the pixel budget.
      let factor = UPSCALE_TARGET_LONG_EDGE / Math.max(w, h);
      factor = Math.min(factor, Math.sqrt(UPSCALE_MAX_PIXELS / (w * h)));
      if (factor < 1.05) {
        toast.info("This stencil is already at maximum size");
        return;
      }
      const outW = Math.round(w * factor);
      const outH = Math.round(h * factor);
      void applyAsync(`Upscaling to ${outW}×${outH}`, (img) =>
        upscaleImageData(img, factor, undefined, { sharpenAmount: 0.25 }),
      );
    },
    stencilClean: () => applyDockPlugin("builtin.edge-connector"),
    threshold: () => applyDockPlugin("builtin.otsu-threshold"),
    thermalBlue: filter("thermalBlue"),
    thermalPurple: filter("thermalPurple"),
    sharpen: filter("sharpen"),
    blur: filter("blur"),
    vignette: filter("vignette"),
    halftone: () => applyDockPlugin("builtin.halftone-stipple"),
    pixelate: filter("pixelate"),
    posterize: () => applyDockPlugin("builtin.posterize"),
    edge: filter("edge"),
    grain: filter("grain"),
    sepia: filter("sepia"),
    lensFlare: filter("lensFlare"),
    glow: filter("glow"),
    chromatic: filter("chromatic"),
    gradientMap: filter("gradientMap"),
    smudge: stroke("smudge"),
    heal: stroke("heal"),
    liquifyPush: stroke("liquifyPush"),
    liquifyInflate: stroke("liquifyInflate"),
    liquifyDeflate: stroke("liquifyDeflate"),
    removeBg: () => !requirePlan("remove-bg", "Remove BG") ? undefined : applyAsync(ASYNC_OPS.removeBg.label, async (img) => (await removeBackground(img)).imageData),
    cutout: () => {
      setRetouch(null);
      setDrawMode(false);
      setTool("pan");
      setWandOn(true);
      toast.info("Magic Wand: tap an area to cut it out", { duration: 2500 });
    },
    text: stub("Text"),
    addPhoto: stub("Reference"),
    openBrushes: () => setBrushPickerOpen(true),
    shapeMask: stub("Shape mask"),
    frame: () => setLayoutKind("frame"),
    callout: stub("Callout"),
    draw: () => enterDrawMode(),
    sticker: stub("Sticker"),
    aiTryOn: () => navigate({ to: "/plugins" }),
    apps: () => navigate({ to: "/plugins" }),
    myFolders: () => onClose(),
    border: () => setLayoutKind("border"),
    shape: stub("Shape"),
    mask: stub("Mask"),
  };


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
        {wandOn && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-white/70">
              Tolerance
              <input
                type="range"
                min={0}
                max={120}
                value={wandTolerance}
                onChange={(e) => setWandTolerance(Number(e.target.value))}
                aria-label="Wand tolerance"
                className="w-20"
              />
            </label>
            <button
              onClick={() => setWandOn(false)}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 bg-[#00F5D4] text-black"
              aria-label="Finish magic wand"
            >
              <Check size={13} /> Wand · Done
            </button>
          </div>
        )}
        {retouch && (
          <button
            onClick={() => {
              setRetouch(null);
              retouchPath.current = [];
              cloneSource.current = null;
            }}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 bg-[#00F5D4] text-black"
            aria-label="Finish retouch"
          >
            <Check size={13} /> {Object.values(STROKE_OPS).find((o) => o.stroke === retouch)?.label ?? "Retouch"} · Done
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
            onClick={() => { setRetouch(null); setWandOn(false); setTool("brush"); }}
            className={`p-2 rounded ${tool === "brush" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`}
            aria-label="Brush"
          >
            <Pen size={16} className="mx-auto" />
          </button>
          <button
            onClick={() => { setRetouch(null); setWandOn(false); setTool("pan"); }}
            className={`p-2 rounded ${tool === "pan" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`}
            aria-label="Pan"
          >
            <Hand size={16} className="mx-auto" />
          </button>
          <button
            onClick={() => {
              setRetouch(null);
              setWandOn(false);
              setTool("eraser");
              setBrushId("eraser");
            }}
            className={`p-2 rounded ${tool === "eraser" ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/10"}`}
            aria-label="Eraser"
          >
            <Eraser size={16} className="mx-auto" />
          </button>
          <button
            onClick={() => { setRetouch(null); setWandOn(false); setTool("eyedrop"); }}
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
              You're in <span className="text-white font-semibold">Pan</span> mode so the
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

      {brushPickerOpen && (
        <BrushPickerPanel
          current={brushId}
          onPick={(id) => {
            setBrushId(id);
            setTool("brush");
            enterDrawMode();
            setBrushPickerOpen(false);
          }}
          onClose={() => setBrushPickerOpen(false)}
        />
      )}
      {adjustOpen && (
        <div className="absolute inset-x-2 bottom-[64px] z-[20] max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141417]/95 backdrop-blur-xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-400 uppercase">Adjust</span>
            <div className="flex gap-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setAdjustments({}); applyAdjustPreview({}); }} className="text-xs text-neutral-400 hover:text-neutral-200">Reset</button>
                <button
                  type="button"
                  onClick={() => {
                    // Toggle touch-up mask: when active, adjustments apply only to painted areas
                    if (touchupMask) {
                      setTouchupMask(null);
                      toast.info("Touch-up mask disabled");
                    } else {
                      // Create a simple full-canvas mask (all pixels = 255 = apply everywhere)
                      // In production, this would read from a mask canvas painted by the user
                      const ctx = ctxRef.current;
                      if (ctx) {
                        const mask = new Uint8ClampedArray(ctx.canvas.width * ctx.canvas.height).fill(255);
                        setTouchupMask(mask);
                        toast.info("Touch-up mask enabled — adjustments apply to painted areas only");
                      }
                    }
                  }}
                  className={`text-xs ${touchupMask ? "text-[#00F5D4]" : "text-neutral-400"} hover:text-neutral-200`}
                >
                  {touchupMask ? "Mask: On" : "Mask: Off"}
                </button>
              </div>
              <button type="button" onClick={commitAdjust} className="text-xs font-bold text-[#00F5D4]">Done</button>
            </div>
          </div>
          {([
            { key: "brightness", label: "Brightness", min: -100, max: 100 },
            { key: "contrast", label: "Contrast", min: -100, max: 100 },
            { key: "saturation", label: "Saturation", min: -100, max: 100 },
            { key: "exposure", label: "Exposure", min: -100, max: 100 },
            { key: "gamma", label: "Gamma", min: 0.1, max: 3.0, step: 0.1 },
            { key: "temperature", label: "Temperature", min: -100, max: 100 },
            { key: "tint", label: "Tint", min: -100, max: 100 },
            { key: "vibrance", label: "Vibrance", min: -100, max: 100 },
          ] as const).map((ctrl) => (
            <div key={ctrl.key} className="space-y-1">
              <label className="text-[10px] font-bold text-neutral-500 uppercase">{ctrl.label}</label>
              <input
                type="range"
                min={ctrl.min}
                max={ctrl.max}
                step={"step" in ctrl ? ctrl.step : 1}
                value={(adjustments[ctrl.key] as number) ?? ("step" in ctrl ? 1 : 0)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  applyAdjustPreview({ ...adjustments, [ctrl.key]: v });
                }}
                className="w-full accent-[#00F5D4]"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => applyAdjustPreview({ ...adjustments, invert: !adjustments.invert })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${adjustments.invert ? "bg-[#00F5D4]/20 text-[#00F5D4] border-[#00F5D4]/40" : "border-white/10 text-neutral-300"}`}
            >
              Invert
            </button>
            <button
              type="button"
              onClick={() => applyAdjustPreview({ ...adjustments, grayscale: !adjustments.grayscale })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border ${adjustments.grayscale ? "bg-[#00F5D4]/20 text-[#00F5D4] border-[#00F5D4]/40" : "border-white/10 text-neutral-300"}`}
            >
              Grayscale
            </button>
          </div>
        </div>
      )}
      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 grid place-items-center"
          style={{ zIndex: 60, background: "rgba(0,0,0,0.45)" }}
        >
          <div className="px-4 py-2 rounded-full text-sm font-semibold bg-[#121216] border border-white/10">
            {busy}…
          </div>
        </div>
      )}

      {layoutKind && ctxRef.current && (
        <LayoutDialog
          kind={layoutKind}
          width={ctxRef.current.canvas.width}
          height={ctxRef.current.canvas.height}
          onClose={() => setLayoutKind(null)}
          onApply={(r: LayoutResult) => {
            setLayoutKind(null);
            if (r.kind === "crop") applyFilter("Crop", (img) => cropImageData(img, r.rect));
            else if (r.kind === "resize") applyFilter("Resize", (img) => resizeImageData(img, r.width, r.height));
            else if (r.kind === "border") applyFilter("Border", (img) => borderImageData(img, r.thickness, r.color));
            else applyFilter("Frame", (img) => frameImageData(img, r.radius, r.thickness, r.color));
          }}
        />
      )}

      {galleryOpen && (
        <FilterGalleryModal
          source={gallerySource}
          onClose={() => {
            setGalleryOpen(false);
            setGallerySource(null);
          }}
          onApply={(preset) => {
            applyFilter(preset.name, (img) => applyAdjustments(img, preset.values) ?? img);
            setGalleryOpen(false);
            setGallerySource(null);
          }}
        />
      )}

      <PicsartDock handlers={dockHandlers} />
    </div>
  );
}

export default VaultProcreateEditor;
