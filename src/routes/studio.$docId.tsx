import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ChevronLeft, Save, Undo2, Redo2, Eye, EyeOff, Lock, Unlock, Plus, Trash2,
  Layers as LayersIcon, Brush as BrushIcon, Download, ChevronUp, ChevronDown,
  Square, Circle, Lasso, Wand2, Move, Scissors, Copy as CopyIcon, ClipboardPaste,
  RotateCcw, FlipHorizontal, FlipVertical, X, Check,
} from "lucide-react";
import {
  getDocument, saveDocument, makeThumbnail,
  type DocumentData, type LayerState, type BlendMode, type EditorState,
} from "@/lib/localDB";
import { v4 as uuidv4 } from "uuid";
import { InputSmoother, estimatePressureFromVelocity, type SmoothedPoint } from "@/lib/kalman";
import { beginStroke, endStroke, strokeTo, DEFAULTS, BRUSH_LABELS, type BrushId, type BrushSettings, type StrokeContext } from "@/lib/brushes";
import {
  createMask, clearMask, invertMask, fillRect, fillEllipse, fillPolygon,
  magicWand, featherMask, maskBounds, maskToImageData,
  type SelectionMask,
} from "@/lib/selection";

export const Route = createFileRoute("/studio/$docId")({
  head: () => ({
    meta: [
      { title: "PrimalCanvas Studio — PrimalPrint AI" },
      { name: "description", content: "Procreate-inspired stencil editor: pressure-sensitive brushes, layers, selections, free transform." },
    ],
  }),
  component: StudioPage,
});

const CANVAS_W = 1536;
const CANVAS_H = 1536;
const AUTOSAVE_MS = 25_000;

const BLEND_MODES: BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "soft-light", "hard-light",
  "color-dodge", "color-burn", "darken", "lighten", "difference", "exclusion",
  "hue", "saturation", "color", "luminosity",
];

type Tool = "brush" | "rect" | "ellipse" | "lasso" | "wand" | "transform";
type SelectOp = "replace" | "add" | "subtract";

type HistoryEntry = { layerId: string; before: ImageData; after: ImageData };

type FloatingTransform = {
  /** Source canvas containing the cut pixels (already mask-applied). */
  src: HTMLCanvasElement;
  /** Original bbox the cut came from. */
  origin: { x: number; y: number; w: number; h: number };
  tx: number; ty: number;       // additional translation
  scale: number; rotation: number; // rotation in radians
  flipX: boolean; flipY: boolean;
  /** Layer ID the floating selection belongs to (so commit returns it home). */
  layerId: string;
  /** Pre-cut layer snapshot so cancel restores. */
  beforeCut: ImageData;
};

function StudioPage() {
  const { docId } = useParams({ from: "/studio/$docId" });
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [activeBrushId, setActiveBrushId] = useState<BrushId>("hard-round");
  const [brushOverrides, setBrushOverrides] = useState<Partial<BrushSettings>>({});
  const [color, setColor] = useState("#111111");
  const [smoothing, setSmoothing] = useState(0.45);
  const [pressure, setPressure] = useState(0);
  const [showLayers, setShowLayers] = useState(true);
  const [showBrushes, setShowBrushes] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<Tool>("brush");
  const [selectOp, setSelectOp] = useState<SelectOp>("replace");
  const [wandTolerance, setWandTolerance] = useState(32);
  const [featherRadius, setFeatherRadius] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const [antPhase, setAntPhase] = useState(0);
  const [floating, setFloating] = useState<FloatingTransform | null>(null);

  const composedRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // layerId -> offscreen canvas
  const layerCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const scratchRef = useRef<HTMLCanvasElement | null>(null); // per-stroke scratch when selection active
  const maskRef = useRef<SelectionMask>(createMask(CANVAS_W, CANVAS_H));
  const clipboardRef = useRef<HTMLCanvasElement | null>(null);
  const smootherRef = useRef(new InputSmoother());
  const strokeRef = useRef<{ sc: StrokeContext; prev: SmoothedPoint | null; before: ImageData; target: HTMLCanvasElement } | null>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);

  // Selection drag state
  const selDragRef = useRef<{ start: { x: number; y: number }; lasso: number[] } | null>(null);
  // Transform drag state
  const tfmDragRef = useRef<{ mode: "move" | "scale" | "rotate"; sx: number; sy: number; startTx: number; startTy: number; startScale: number; startRot: number } | null>(null);

  const brush: BrushSettings = useMemo(() => ({
    ...DEFAULTS[activeBrushId],
    ...brushOverrides,
    color: activeBrushId === "eraser" ? "#000000" : color,
  }), [activeBrushId, brushOverrides, color]);

  /* ---------- Load document ---------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await getDocument(docId);
      if (!alive) return;
      if (!d) { navigate({ to: "/vault" }); return; }
      setDoc(d);
      const initial = await ensureEditorState(d);
      if (!alive) return;
      for (const layer of initial.layers) {
        const c = await dataUrlToCanvas(layer.dataUrl, initial.width, initial.height);
        layerCanvases.current.set(layer.id, c);
      }
      setState(initial);
    })();
    return () => { alive = false; };
  }, [docId, navigate]);

  /* ---------- Marching-ants animation tick ---------- */
  useEffect(() => {
    if (!hasSelection && !floating) return;
    const id = window.setInterval(() => setAntPhase(p => (p + 1) % 12), 90);
    return () => window.clearInterval(id);
  }, [hasSelection, floating]);

  /* ---------- Render composite ---------- */

  const compose = useCallback(() => {
    const cv = composedRef.current; if (!cv || !state) return;
    const ctx = cv.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const layer of state.layers) {
      if (!layer.visible) continue;
      const lc = layerCanvases.current.get(layer.id); if (!lc) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      ctx.drawImage(lc, 0, 0);
      // Live preview of scratch on its layer
      if (scratchRef.current && strokeRef.current && layer.id === state.activeLayerId) {
        // already drawn; scratch will be baked into layer on stroke end
        const preview = makeMaskedPreview(scratchRef.current, maskRef.current);
        if (preview) ctx.drawImage(preview, 0, 0);
      }
    }
    // Floating transform preview
    if (floating && floating.layerId === state.activeLayerId) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      const f = floating;
      const cx = f.origin.x + f.origin.w / 2 + f.tx;
      const cy = f.origin.y + f.origin.h / 2 + f.ty;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(f.rotation);
      ctx.scale(f.scale * (f.flipX ? -1 : 1), f.scale * (f.flipY ? -1 : 1));
      ctx.drawImage(f.src, -f.origin.w / 2, -f.origin.h / 2);
      ctx.restore();
    }
    ctx.restore();
    drawOverlay();
  }, [state, floating, hasSelection, antPhase]);

  useEffect(() => { compose(); }, [compose]);

  useEffect(() => {
    smootherRef.current.setSmoothing(smoothing);
  }, [smoothing]);

  /* ---------- Overlay: marching ants + transform handles ---------- */
  const drawOverlay = useCallback(() => {
    const ov = overlayRef.current; if (!ov) return;
    const ctx = ov.getContext("2d")!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    if (hasSelection && !floating) {
      const m = maskRef.current;
      // Trace outline using a 4-connected boundary scan, downsampled.
      const step = 3;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -antPhase;
      ctx.strokeStyle = "#000";
      drawAnts(ctx, m, step);
      ctx.strokeStyle = "#fff";
      ctx.lineDashOffset = -antPhase + 5;
      drawAnts(ctx, m, step);
      ctx.setLineDash([]);
    }
    if (floating) {
      const f = floating;
      const cx = f.origin.x + f.origin.w / 2 + f.tx;
      const cy = f.origin.y + f.origin.h / 2 + f.ty;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(f.rotation);
      ctx.scale(f.scale, f.scale);
      const hw = f.origin.w / 2, hh = f.origin.h / 2;
      ctx.lineWidth = 2 / f.scale;
      ctx.setLineDash([8 / f.scale, 5 / f.scale]);
      ctx.lineDashOffset = -antPhase;
      ctx.strokeStyle = "#A855F7";
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
      ctx.setLineDash([]);
      // Handles
      const hs = 14 / f.scale;
      ctx.fillStyle = "#A855F7";
      const corners: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]];
      for (const [x, y] of corners) ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
      // Rotation handle
      ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, -hh - 40 / f.scale); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -hh - 40 / f.scale, hs * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }, [hasSelection, antPhase, floating]);

  /* ---------- Pointer coords ---------- */
  function canvasCoords(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const cv = composedRef.current!;
    const r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * CANVAS_W,
      y: ((e.clientY - r.top) / r.height) * CANVAS_H,
    };
  }

  /* ---------- Pointer handlers ---------- */
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!state) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = canvasCoords(e);

    if (tool === "transform" && floating) {
      tfmDragRef.current = pickTransformHandle(floating, p);
      return;
    }

    if (tool === "rect" || tool === "ellipse") {
      selDragRef.current = { start: p, lasso: [] };
      return;
    }
    if (tool === "lasso") {
      selDragRef.current = { start: p, lasso: [p.x, p.y] };
      return;
    }
    if (tool === "wand") {
      // Sample from composite (visual) so user clicks "what they see"
      runWand(p);
      return;
    }

    // Brush
    const layer = state.layers.find(l => l.id === state.activeLayerId);
    if (!layer || layer.locked) return;
    const lc = layerCanvases.current.get(layer.id); if (!lc) return;

    // Decide target: scratch if selection active, otherwise layer.
    let target: HTMLCanvasElement = lc;
    if (hasSelection) {
      if (!scratchRef.current || scratchRef.current.width !== lc.width) {
        const s = document.createElement("canvas"); s.width = lc.width; s.height = lc.height;
        scratchRef.current = s;
      }
      const sctx = scratchRef.current.getContext("2d")!;
      sctx.clearRect(0, 0, scratchRef.current.width, scratchRef.current.height);
      target = scratchRef.current;
    }
    const tctx = target.getContext("2d")!;
    smootherRef.current.reset();
    smootherRef.current.setSmoothing(smoothing);
    const rawPressure = e.pressure > 0 && e.pointerType !== "mouse"
      ? e.pressure
      : estimatePressureFromVelocity(null, p.x, p.y, e.timeStamp);
    const sp = smootherRef.current.push(p.x, p.y, rawPressure, e.timeStamp);
    setPressure(sp.pressure);
    const sc = beginStroke(tctx, brush);
    if (layer.alphaLock && brush.id !== "eraser" && target === lc) {
      tctx.globalCompositeOperation = "source-atop";
    }
    const before = lc.getContext("2d")!.getImageData(0, 0, lc.width, lc.height);
    strokeRef.current = { sc, prev: sp, before, target };
    strokeTo(sc, sp.x, sp.y, sp.pressure);
    compose();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!state) return;
    const p = canvasCoords(e);

    if (tool === "transform" && floating && tfmDragRef.current) {
      const d = tfmDragRef.current;
      if (d.mode === "move") {
        setFloating({ ...floating, tx: d.startTx + (p.x - d.sx), ty: d.startTy + (p.y - d.sy) });
      } else if (d.mode === "scale") {
        const cx = floating.origin.x + floating.origin.w / 2 + floating.tx;
        const cy = floating.origin.y + floating.origin.h / 2 + floating.ty;
        const initial = Math.hypot(d.sx - cx, d.sy - cy);
        const now = Math.hypot(p.x - cx, p.y - cy);
        const ns = Math.max(0.05, d.startScale * (now / Math.max(1, initial)));
        setFloating({ ...floating, scale: ns });
      } else if (d.mode === "rotate") {
        const cx = floating.origin.x + floating.origin.w / 2 + floating.tx;
        const cy = floating.origin.y + floating.origin.h / 2 + floating.ty;
        const a0 = Math.atan2(d.sy - cy, d.sx - cx);
        const a1 = Math.atan2(p.y - cy, p.x - cx);
        setFloating({ ...floating, rotation: d.startRot + (a1 - a0) });
      }
      return;
    }

    if (selDragRef.current) {
      if (tool === "lasso") selDragRef.current.lasso.push(p.x, p.y);
      // Live overlay preview
      const ov = overlayRef.current; if (!ov) return;
      const ctx = ov.getContext("2d")!;
      ctx.clearRect(0, 0, ov.width, ov.height);
      ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeStyle = "#A855F7";
      if (tool === "rect") {
        const s = selDragRef.current.start;
        ctx.strokeRect(Math.min(s.x, p.x), Math.min(s.y, p.y), Math.abs(p.x - s.x), Math.abs(p.y - s.y));
      } else if (tool === "ellipse") {
        const s = selDragRef.current.start;
        ctx.beginPath();
        ctx.ellipse((s.x + p.x) / 2, (s.y + p.y) / 2, Math.abs(p.x - s.x) / 2, Math.abs(p.y - s.y) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tool === "lasso") {
        const pts = selDragRef.current.lasso;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      return;
    }

    const s = strokeRef.current; if (!s) return;
    const evts = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evts) {
      const r = composedRef.current!.getBoundingClientRect();
      const cx = ((ev.clientX - r.left) / r.width) * CANVAS_W;
      const cy = ((ev.clientY - r.top) / r.height) * CANVAS_H;
      const rawPressure = (ev as PointerEvent).pressure > 0 && (ev as PointerEvent).pointerType !== "mouse"
        ? (ev as PointerEvent).pressure
        : estimatePressureFromVelocity(s.prev, cx, cy, ev.timeStamp);
      const sp = smootherRef.current.push(cx, cy, rawPressure, ev.timeStamp);
      strokeTo(s.sc, sp.x, sp.y, sp.pressure);
      s.prev = sp;
      setPressure(sp.pressure);
    }
    if (!evts.length) {
      const sp = smootherRef.current.push(p.x, p.y, e.pressure || 0.5, e.timeStamp);
      strokeTo(s.sc, sp.x, sp.y, sp.pressure);
      s.prev = sp;
    }
    compose();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tfmDragRef.current) { tfmDragRef.current = null; return; }

    if (selDragRef.current) {
      const p = canvasCoords(e);
      const start = selDragRef.current.start;
      const m = applySelectOp(maskRef.current, selectOp);
      if (tool === "rect") fillRect(m, start.x, start.y, p.x, p.y);
      else if (tool === "ellipse") fillEllipse(m, start.x, start.y, p.x, p.y);
      else if (tool === "lasso") fillPolygon(m, selDragRef.current.lasso);
      if (featherRadius > 0) featherMask(m, featherRadius);
      finalizeMask(m);
      selDragRef.current = null;
      return;
    }

    const s = strokeRef.current; if (!s || !state) return;
    endStroke(s.sc);
    const layer = state.layers.find(l => l.id === state.activeLayerId);
    if (layer) {
      const lc = layerCanvases.current.get(layer.id);
      if (lc) {
        // If we painted into scratch, bake it into the layer with mask applied.
        if (s.target !== lc && scratchRef.current) {
          bakeScratchToLayer(lc, scratchRef.current, maskRef.current, brush.id === "eraser");
          scratchRef.current.getContext("2d")!.clearRect(0, 0, scratchRef.current.width, scratchRef.current.height);
        }
        const after = lc.getContext("2d")!.getImageData(0, 0, lc.width, lc.height);
        historyRef.current.push({ layerId: layer.id, before: s.before, after });
        if (historyRef.current.length > 60) historyRef.current.shift();
        futureRef.current = [];
      }
    }
    strokeRef.current = null;
    setDirty(true);
    compose();
  }

  /* ---------- Wand ---------- */
  function runWand(p: { x: number; y: number }) {
    if (!state) return;
    const layer = state.layers.find(l => l.id === state.activeLayerId);
    if (!layer) return;
    const lc = layerCanvases.current.get(layer.id); if (!lc) return;
    const img = lc.getContext("2d")!.getImageData(0, 0, lc.width, lc.height);
    const m = applySelectOp(maskRef.current, selectOp);
    magicWand(m, img, Math.round(p.x), Math.round(p.y), wandTolerance, true);
    if (featherRadius > 0) featherMask(m, featherRadius);
    finalizeMask(m);
  }

  /* ---------- Selection ops ---------- */
  function applySelectOp(prev: SelectionMask, op: SelectOp): SelectionMask {
    if (op === "replace") {
      const m = createMask(prev.width, prev.height);
      maskRef.current = m;
      return m;
    }
    if (op === "add") return prev;
    // subtract: invert work mask, then we'll AND result at finalize
    const m = createMask(prev.width, prev.height);
    maskRef.current = m;
    // store original to subtract from
    (m as SelectionMask & { _baseSub?: Uint8ClampedArray })._baseSub = new Uint8ClampedArray(prev.data);
    return m;
  }
  function finalizeMask(m: SelectionMask) {
    const sub = (m as SelectionMask & { _baseSub?: Uint8ClampedArray })._baseSub;
    if (sub) {
      for (let i = 0; i < m.data.length; i++) m.data[i] = Math.max(0, sub[i] - m.data[i]);
    }
    let any = false; for (let i = 0; i < m.data.length; i += 64) if (m.data[i]) { any = true; break; }
    if (!any) for (let i = 0; i < m.data.length; i++) if (m.data[i]) { any = true; break; }
    setHasSelection(any);
    setDirty(true);
    compose();
  }
  function deselect() {
    clearMask(maskRef.current);
    setHasSelection(false);
    setFloating(null);
    compose();
  }
  function invertSelection() {
    if (!hasSelection) { for (let i = 0; i < maskRef.current.data.length; i++) maskRef.current.data[i] = 255; }
    else invertMask(maskRef.current);
    setHasSelection(true);
    compose();
  }
  function selectAll() {
    for (let i = 0; i < maskRef.current.data.length; i++) maskRef.current.data[i] = 255;
    setHasSelection(true);
    compose();
  }

  /* ---------- Cut / Copy / Paste ---------- */
  function copySelection() {
    if (!hasSelection || !state) return;
    const layer = state.layers.find(l => l.id === state.activeLayerId); if (!layer) return;
    const lc = layerCanvases.current.get(layer.id); if (!lc) return;
    const bounds = maskBounds(maskRef.current); if (!bounds) return;
    const cut = extractMasked(lc, maskRef.current, bounds);
    clipboardRef.current = cut;
  }
  function cutSelection() {
    if (!hasSelection || !state) return;
    copySelection();
    const layer = state.layers.find(l => l.id === state.activeLayerId)!;
    const lc = layerCanvases.current.get(layer.id)!;
    const before = lc.getContext("2d")!.getImageData(0, 0, lc.width, lc.height);
    eraseByMask(lc, maskRef.current);
    historyRef.current.push({ layerId: layer.id, before, after: lc.getContext("2d")!.getImageData(0, 0, lc.width, lc.height) });
    setDirty(true);
    compose();
  }
  async function pasteClipboard() {
    if (!clipboardRef.current || !state) return;
    const id = uuidv4();
    const c = document.createElement("canvas"); c.width = state.width; c.height = state.height;
    c.getContext("2d")!.drawImage(clipboardRef.current, (state.width - clipboardRef.current.width) / 2, (state.height - clipboardRef.current.height) / 2);
    layerCanvases.current.set(id, c);
    const newLayer: LayerState = {
      id, name: "Pasted", visible: true, locked: false, alphaLock: false, clipping: false, opacity: 1, blendMode: "normal", dataUrl: "",
    };
    setState({ ...state, layers: [...state.layers, newLayer], activeLayerId: id });
    setDirty(true);
  }

  /* ---------- Transform ---------- */
  function startTransform() {
    if (!hasSelection || !state) return;
    const layer = state.layers.find(l => l.id === state.activeLayerId); if (!layer) return;
    const lc = layerCanvases.current.get(layer.id); if (!lc) return;
    const bounds = maskBounds(maskRef.current); if (!bounds) return;
    const before = lc.getContext("2d")!.getImageData(0, 0, lc.width, lc.height);
    const src = extractMasked(lc, maskRef.current, bounds);
    eraseByMask(lc, maskRef.current);
    setFloating({
      src, origin: bounds, tx: 0, ty: 0, scale: 1, rotation: 0,
      flipX: false, flipY: false, layerId: layer.id, beforeCut: before,
    });
    setTool("transform");
    compose();
  }
  function commitTransform() {
    if (!floating || !state) return;
    const layer = state.layers.find(l => l.id === floating.layerId); if (!layer) return;
    const lc = layerCanvases.current.get(layer.id); if (!lc) return;
    const ctx = lc.getContext("2d")!;
    const before = ctx.getImageData(0, 0, lc.width, lc.height);
    const f = floating;
    const cx = f.origin.x + f.origin.w / 2 + f.tx;
    const cy = f.origin.y + f.origin.h / 2 + f.ty;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(f.rotation);
    ctx.scale(f.scale * (f.flipX ? -1 : 1), f.scale * (f.flipY ? -1 : 1));
    ctx.drawImage(f.src, -f.origin.w / 2, -f.origin.h / 2);
    ctx.restore();
    historyRef.current.push({ layerId: layer.id, before, after: ctx.getImageData(0, 0, lc.width, lc.height) });
    setFloating(null);
    setTool("brush");
    setDirty(true);
    compose();
  }
  function cancelTransform() {
    if (!floating) return;
    const lc = layerCanvases.current.get(floating.layerId);
    if (lc) lc.getContext("2d")!.putImageData(floating.beforeCut, 0, 0);
    setFloating(null);
    setTool("brush");
    compose();
  }

  /* ---------- Undo / redo ---------- */
  function undo() {
    const h = historyRef.current.pop(); if (!h) return;
    const lc = layerCanvases.current.get(h.layerId); if (!lc) return;
    lc.getContext("2d")!.putImageData(h.before, 0, 0);
    futureRef.current.push(h);
    compose();
    setDirty(true);
  }
  function redo() {
    const h = futureRef.current.pop(); if (!h) return;
    const lc = layerCanvases.current.get(h.layerId); if (!lc) return;
    lc.getContext("2d")!.putImageData(h.after, 0, 0);
    historyRef.current.push(h);
    compose();
    setDirty(true);
  }

  /* ---------- Layer ops ---------- */
  function addLayer() {
    if (!state) return;
    const id = uuidv4();
    const c = document.createElement("canvas");
    c.width = state.width; c.height = state.height;
    layerCanvases.current.set(id, c);
    const newLayer: LayerState = {
      id, name: `Layer ${state.layers.length + 1}`, visible: true, locked: false,
      alphaLock: false, clipping: false, opacity: 1, blendMode: "normal", dataUrl: "",
    };
    setState({ ...state, layers: [...state.layers, newLayer], activeLayerId: id });
    setDirty(true);
  }
  function deleteLayer(id: string) {
    if (!state || state.layers.length <= 1) return;
    layerCanvases.current.delete(id);
    const layers = state.layers.filter(l => l.id !== id);
    setState({ ...state, layers, activeLayerId: layers[0].id });
    setDirty(true);
  }
  function updateLayer(id: string, patch: Partial<LayerState>) {
    if (!state) return;
    setState({ ...state, layers: state.layers.map(l => l.id === id ? { ...l, ...patch } : l) });
    setDirty(true);
  }
  function moveLayer(id: string, dir: -1 | 1) {
    if (!state) return;
    const i = state.layers.findIndex(l => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.layers.length) return;
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    setState({ ...state, layers });
    setDirty(true);
  }

  /* ---------- Save / autosave ---------- */
  const save = useCallback(async (changes: string) => {
    if (!doc || !state || saving) return;
    setSaving(true);
    try {
      const layers = state.layers.map(l => ({
        ...l, dataUrl: layerCanvases.current.get(l.id)?.toDataURL("image/png") ?? "",
      }));
      const composed = composedRef.current!.toDataURL("image/png");
      const thumb = await makeThumbnail(composed);
      const editorJson = JSON.stringify({ ...state, layers } satisfies EditorState);
      const next = await saveDocument(
        { ...doc, thumbnail: thumb, layeredEditorData: editorJson },
        { changes, thumbnail: thumb, editorState: editorJson },
      );
      setDoc(next);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [doc, state, saving]);

  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => { save("Autosave"); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [dirty, save]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save("Manual save"); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "a") { e.preventDefault(); selectAll(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "d") { e.preventDefault(); deselect(); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); invertSelection(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "x") { e.preventDefault(); cutSelection(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "c") { e.preventDefault(); copySelection(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "v") { e.preventDefault(); pasteClipboard(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "t") { e.preventDefault(); startTransform(); }
      else if (e.key === "Enter" && floating) { e.preventDefault(); commitTransform(); }
      else if (e.key === "Escape" && floating) { e.preventDefault(); cancelTransform(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, floating, hasSelection]);

  function downloadPng() {
    const a = document.createElement("a");
    a.href = composedRef.current!.toDataURL("image/png");
    a.download = `${doc?.name ?? "stencil"}.png`;
    a.click();
  }

  /* ---------- Render ---------- */
  if (!doc || !state) {
    return <div className="min-h-screen bg-background text-foreground grid place-items-center text-sm text-muted-foreground">Loading editor…</div>;
  }

  return (
    <div className="min-h-screen h-screen flex flex-col bg-background text-foreground overflow-hidden touch-none">
      {/* Top bar */}
      <header className="shrink-0 bg-card border-b border-border h-12 flex items-center px-2 gap-1 sm:gap-2 text-xs">
        <Link to="/vault" className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted">
          <ChevronLeft size={14} /> <span className="hidden sm:inline">Vault</span>
        </Link>
        <input
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value })}
          onBlur={() => save("Renamed")}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none font-semibold truncate text-sm"
        />
        <button onClick={undo} className="p-1.5 rounded hover:bg-muted" aria-label="Undo"><Undo2 size={14} /></button>
        <button onClick={redo} className="p-1.5 rounded hover:bg-muted" aria-label="Redo"><Redo2 size={14} /></button>
        <button onClick={() => save("Manual save")} className="px-2 py-1 rounded bg-gradient-primary text-primary-foreground font-semibold flex items-center gap-1">
          <Save size={12} /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
        <button onClick={downloadPng} className="p-1.5 rounded hover:bg-muted" aria-label="Download"><Download size={14} /></button>
      </header>

      {/* Tool bar (selections & transform) */}
      <div className="shrink-0 bg-card/70 border-b border-border px-2 py-1.5 flex items-center gap-1 text-[11px] overflow-x-auto">
        <ToolBtn active={tool === "brush"}     onClick={() => setTool("brush")}      icon={<BrushIcon size={13} />} label="Brush" />
        <ToolBtn active={tool === "rect"}      onClick={() => setTool("rect")}       icon={<Square size={13} />}    label="Rect" />
        <ToolBtn active={tool === "ellipse"}   onClick={() => setTool("ellipse")}    icon={<Circle size={13} />}    label="Ellipse" />
        <ToolBtn active={tool === "lasso"}     onClick={() => setTool("lasso")}      icon={<Lasso size={13} />}     label="Lasso" />
        <ToolBtn active={tool === "wand"}      onClick={() => setTool("wand")}       icon={<Wand2 size={13} />}     label="Wand" />
        <div className="w-px h-5 bg-border mx-1" />
        {(tool === "rect" || tool === "ellipse" || tool === "lasso" || tool === "wand") && (
          <>
            <select value={selectOp} onChange={(e) => setSelectOp(e.target.value as SelectOp)} className="bg-background border border-border rounded px-1.5 py-0.5">
              <option value="replace">Replace</option>
              <option value="add">Add</option>
              <option value="subtract">Subtract</option>
            </select>
            {tool === "wand" && (
              <label className="flex items-center gap-1">Tol
                <input type="range" min={1} max={120} value={wandTolerance} onChange={(e) => setWandTolerance(Number(e.target.value))} className="w-16 accent-primary" />
                <span className="tabular-nums w-6">{wandTolerance}</span>
              </label>
            )}
            <label className="flex items-center gap-1">Feather
              <input type="range" min={0} max={20} value={featherRadius} onChange={(e) => setFeatherRadius(Number(e.target.value))} className="w-16 accent-primary" />
              <span className="tabular-nums w-5">{featherRadius}</span>
            </label>
          </>
        )}
        <div className="w-px h-5 bg-border mx-1" />
        <ToolBtn onClick={invertSelection} icon={<RotateCcw size={13} />} label="Invert" disabled={!hasSelection} />
        <ToolBtn onClick={deselect}        icon={<X size={13} />} label="Deselect" disabled={!hasSelection && !floating} />
        <ToolBtn onClick={cutSelection}    icon={<Scissors size={13} />} label="Cut" disabled={!hasSelection} />
        <ToolBtn onClick={copySelection}   icon={<CopyIcon size={13} />} label="Copy" disabled={!hasSelection} />
        <ToolBtn onClick={pasteClipboard}  icon={<ClipboardPaste size={13} />} label="Paste" disabled={!clipboardRef.current} />
        <ToolBtn onClick={startTransform}  icon={<Move size={13} />} label="Transform" disabled={!hasSelection || !!floating} />
        {floating && (
          <>
            <ToolBtn onClick={() => setFloating({ ...floating, flipX: !floating.flipX })} icon={<FlipHorizontal size={13} />} label="Flip H" />
            <ToolBtn onClick={() => setFloating({ ...floating, flipY: !floating.flipY })} icon={<FlipVertical size={13} />} label="Flip V" />
            <button onClick={commitTransform} className="px-2 py-1 rounded bg-gradient-primary text-primary-foreground font-semibold flex items-center gap-1"><Check size={13} /> Apply</button>
            <button onClick={cancelTransform} className="px-2 py-1 rounded bg-muted font-semibold flex items-center gap-1"><X size={13} /> Cancel</button>
          </>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 min-h-0 flex">
        {/* Brush rail (left) */}
        <aside className="hidden sm:flex flex-col w-12 border-r border-border bg-card overflow-y-auto">
          {(Object.keys(DEFAULTS) as BrushId[]).map(id => (
            <button
              key={id}
              onClick={() => { setActiveBrushId(id); setBrushOverrides({}); setTool("brush"); }}
              className={`h-12 grid place-items-center text-[10px] ${activeBrushId === id && tool === "brush" ? "bg-primary/15 text-primary border-l-2 border-primary" : "hover:bg-muted"}`}
              title={BRUSH_LABELS[id]}
            >
              <BrushIcon size={16} />
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div ref={wrapRef} className="flex-1 min-w-0 relative bg-muted/30 overflow-auto grid place-items-center p-2">
          <div className="relative" style={{ width: "min(100%, 100vh)", aspectRatio: "1 / 1" }}>
            <canvas
              ref={composedRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="bg-white shadow-2xl rounded touch-none w-full h-full block"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <canvas
              ref={overlayRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          </div>
          <div className="absolute top-3 left-3 bg-card/85 backdrop-blur rounded-full px-2.5 py-1 text-[10px] flex items-center gap-1.5 border border-border">
            <span className="text-muted-foreground">Pressure</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-primary transition-[width]" style={{ width: `${Math.round(pressure * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <aside className="hidden lg:flex w-72 border-l border-border bg-card flex-col overflow-y-auto">
          <BrushPanel brush={brush} setOverrides={setBrushOverrides} color={color} setColor={setColor} smoothing={smoothing} setSmoothing={setSmoothing} />
          <LayersPanel state={state} setState={setState} setDirty={setDirty} updateLayer={updateLayer} addLayer={addLayer} deleteLayer={deleteLayer} moveLayer={moveLayer} />
        </aside>
      </div>

      {/* Mobile bottom bar */}
      <div className="lg:hidden shrink-0 border-t border-border bg-card">
        <div className="flex">
          <button onClick={() => { setShowBrushes(s => !s); setShowLayers(false); }} className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${showBrushes ? "text-primary" : ""}`}>
            <BrushIcon size={14} /> Brush
          </button>
          <button onClick={() => { setShowLayers(s => !s); setShowBrushes(false); }} className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${showLayers ? "text-primary" : ""}`}>
            <LayersIcon size={14} /> Layers · {state.layers.length}
          </button>
        </div>
        {showBrushes && (
          <div className="border-t border-border max-h-[55vh] overflow-y-auto">
            <div className="grid grid-cols-3 gap-1 p-2">
              {(Object.keys(DEFAULTS) as BrushId[]).map(id => (
                <button key={id} onClick={() => { setActiveBrushId(id); setBrushOverrides({}); setTool("brush"); }} className={`py-2 rounded text-[11px] font-semibold ${activeBrushId === id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {BRUSH_LABELS[id]}
                </button>
              ))}
            </div>
            <BrushPanel brush={brush} setOverrides={setBrushOverrides} color={color} setColor={setColor} smoothing={smoothing} setSmoothing={setSmoothing} />
          </div>
        )}
        {showLayers && (
          <div className="border-t border-border max-h-[55vh] overflow-y-auto">
            <LayersPanel state={state} setState={setState} setDirty={setDirty} updateLayer={updateLayer} addLayer={addLayer} deleteLayer={deleteLayer} moveLayer={moveLayer} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function ToolBtn(props: { active?: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`px-2 py-1 rounded flex items-center gap-1 whitespace-nowrap ${props.active ? "bg-primary text-primary-foreground" : "hover:bg-muted"} ${props.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {props.icon}<span className="hidden sm:inline">{props.label}</span>
    </button>
  );
}

function BrushPanel(props: {
  brush: BrushSettings;
  setOverrides: React.Dispatch<React.SetStateAction<Partial<BrushSettings>>>;
  color: string;
  setColor: (c: string) => void;
  smoothing: number;
  setSmoothing: (n: number) => void;
}) {
  const { brush, setOverrides, color, setColor, smoothing, setSmoothing } = props;
  function set<K extends keyof BrushSettings>(k: K, v: BrushSettings[K]) {
    setOverrides(p => ({ ...p, [k]: v }));
  }
  return (
    <div className="p-3 border-b border-border space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">{BRUSH_LABELS[brush.id]}</span>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-7 w-9 rounded cursor-pointer bg-transparent border border-border" />
      </div>
      <Slider label="Size" value={brush.size} min={0.5} max={400} step={0.5} onChange={(v) => set("size", v)} />
      <Slider label="Opacity" value={brush.opacity * 100} min={1} max={100} step={1} onChange={(v) => set("opacity", v / 100)} suffix="%" />
      <Slider label="Flow" value={brush.flow * 100} min={1} max={100} step={1} onChange={(v) => set("flow", v / 100)} suffix="%" />
      <Slider label="Spacing" value={brush.spacing * 100} min={2} max={300} step={1} onChange={(v) => set("spacing", v / 100)} suffix="%" />
      <Slider label="Hardness" value={brush.hardness * 100} min={0} max={100} step={1} onChange={(v) => set("hardness", v / 100)} suffix="%" />
      <Slider label="Scatter" value={brush.scatter} min={0} max={40} step={0.5} onChange={(v) => set("scatter", v)} suffix="px" />
      <Slider label="Pressure → Size" value={brush.pressureSize * 100} min={0} max={100} step={1} onChange={(v) => set("pressureSize", v / 100)} suffix="%" />
      <Slider label="Pressure → Opacity" value={brush.pressureOpacity * 100} min={0} max={100} step={1} onChange={(v) => set("pressureOpacity", v / 100)} suffix="%" />
      <Slider label="Pressure Curve" value={brush.pressureCurve * 100} min={30} max={300} step={5} onChange={(v) => set("pressureCurve", v / 100)} suffix="%" />
      <Slider label="Stabiliser" value={smoothing * 100} min={0} max={100} step={1} onChange={(v) => setSmoothing(v / 100)} suffix="%" />
    </div>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{props.label}</span>
        <span>{Math.round(props.value)}{props.suffix ?? ""}</span>
      </div>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(parseFloat(e.target.value))} className="w-full accent-primary" />
    </label>
  );
}

function LayersPanel(props: {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setDirty: (b: boolean) => void;
  updateLayer: (id: string, patch: Partial<LayerState>) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
}) {
  const { state, updateLayer, addLayer, deleteLayer, moveLayer } = props;
  function setActive(id: string) { props.setState({ ...state, activeLayerId: id }); }
  return (
    <div className="flex-1 p-2 text-xs">
      <div className="flex items-center justify-between p-1">
        <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Layers</span>
        <button onClick={addLayer} className="p-1 rounded hover:bg-muted" aria-label="Add layer"><Plus size={14} /></button>
      </div>
      <div className="space-y-1">
        {[...state.layers].reverse().map((layer) => {
          const active = layer.id === state.activeLayerId;
          return (
            <div key={layer.id} className={`rounded-lg border ${active ? "border-primary bg-primary/5" : "border-border"} p-2`}>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateLayer(layer.id, { visible: !layer.visible })} className="p-1" aria-label="Toggle visibility">
                  {layer.visible ? <Eye size={12} /> : <EyeOff size={12} className="text-muted-foreground" />}
                </button>
                <button onClick={() => setActive(layer.id)} className="flex-1 text-left truncate font-semibold">{layer.name}</button>
                <button onClick={() => moveLayer(layer.id, 1)} className="p-0.5 hover:bg-muted rounded" aria-label="Up"><ChevronUp size={11} /></button>
                <button onClick={() => moveLayer(layer.id, -1)} className="p-0.5 hover:bg-muted rounded" aria-label="Down"><ChevronDown size={11} /></button>
                <button onClick={() => updateLayer(layer.id, { locked: !layer.locked })} className="p-1" aria-label="Lock">
                  {layer.locked ? <Lock size={11} /> : <Unlock size={11} className="text-muted-foreground" />}
                </button>
                <button onClick={() => deleteLayer(layer.id)} className="p-1 text-destructive" aria-label="Delete"><Trash2 size={11} /></button>
              </div>
              {active && (
                <div className="mt-1.5 space-y-1.5">
                  <Slider label="Opacity" value={layer.opacity * 100} min={0} max={100} step={1} onChange={(v) => updateLayer(layer.id, { opacity: v / 100 })} suffix="%" />
                  <select
                    value={layer.blendMode}
                    onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as BlendMode })}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-[11px] capitalize"
                  >
                    {BLEND_MODES.map(m => <option key={m} value={m}>{m.replace("-", " ")}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-[10px]">
                    <input type="checkbox" checked={layer.alphaLock} onChange={(e) => updateLayer(layer.id, { alphaLock: e.target.checked })} /> Alpha lock
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

async function ensureEditorState(d: DocumentData): Promise<EditorState> {
  if (d.layeredEditorData) {
    try { return JSON.parse(d.layeredEditorData) as EditorState; } catch { /* fall through */ }
  }
  const w = CANVAS_W, h = CANVAS_H;
  const baseId = uuidv4();
  let baseDataUrl = "";
  if (d.originalAIImage) {
    baseDataUrl = await fitImageToDataUrl(d.originalAIImage, w, h);
  } else {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    baseDataUrl = c.toDataURL("image/png");
  }
  const inkId = uuidv4();
  return {
    width: w, height: h,
    activeLayerId: inkId,
    layers: [
      { id: baseId, name: "Base stencil", visible: true, locked: false, alphaLock: false, clipping: false, opacity: 1, blendMode: "normal", dataUrl: baseDataUrl },
      { id: inkId,  name: "Ink",          visible: true, locked: false, alphaLock: false, clipping: false, opacity: 1, blendMode: "normal", dataUrl: blankPng(w, h) },
    ],
  };
}

function blankPng(w: number, h: number): string {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return c.toDataURL("image/png");
}

async function dataUrlToCanvas(url: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  if (!url) return c;
  await new Promise<void>((res) => {
    const img = new Image();
    img.onload = () => { c.getContext("2d")!.drawImage(img, 0, 0, w, h); res(); };
    img.onerror = () => res();
    img.src = url;
  });
  return c;
}

async function fitImageToDataUrl(url: string, w: number, h: number): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      const r = Math.min(w / img.width, h / img.height);
      const dw = img.width * r, dh = img.height * r;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      res(c.toDataURL("image/png"));
    };
    img.onerror = () => res(blankPng(w, h));
    img.src = url;
  });
}

/* --- Bake scratch (selection-clipped) onto layer --- */

let _maskCanvas: HTMLCanvasElement | null = null;
function maskAsCanvas(m: SelectionMask): HTMLCanvasElement {
  if (!_maskCanvas || _maskCanvas.width !== m.width) {
    _maskCanvas = document.createElement("canvas");
    _maskCanvas.width = m.width; _maskCanvas.height = m.height;
  }
  _maskCanvas.getContext("2d")!.putImageData(maskToImageData(m), 0, 0);
  return _maskCanvas;
}

function bakeScratchToLayer(layer: HTMLCanvasElement, scratch: HTMLCanvasElement, mask: SelectionMask, eraser: boolean) {
  // Apply mask to scratch first (destination-in)
  const sctx = scratch.getContext("2d")!;
  sctx.save();
  sctx.globalCompositeOperation = "destination-in";
  sctx.drawImage(maskAsCanvas(mask), 0, 0);
  sctx.restore();
  // Composite onto layer
  const lctx = layer.getContext("2d")!;
  lctx.save();
  lctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
  lctx.drawImage(scratch, 0, 0);
  lctx.restore();
}

function makeMaskedPreview(scratch: HTMLCanvasElement, mask: SelectionMask): HTMLCanvasElement | null {
  // Build a temporary clone with mask applied for live preview only.
  const c = document.createElement("canvas"); c.width = scratch.width; c.height = scratch.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(scratch, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskAsCanvas(mask), 0, 0);
  return c;
}

function extractMasked(layer: HTMLCanvasElement, mask: SelectionMask, bounds: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = bounds.w; c.height = bounds.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(layer, -bounds.x, -bounds.y);
  // Multiply by mask alpha, restricted to bounds
  const img = ctx.getImageData(0, 0, bounds.w, bounds.h);
  for (let y = 0; y < bounds.h; y++) {
    for (let x = 0; x < bounds.w; x++) {
      const mIdx = (y + bounds.y) * mask.width + (x + bounds.x);
      const i = (y * bounds.w + x) * 4;
      img.data[i + 3] = Math.round((img.data[i + 3] * mask.data[mIdx]) / 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function eraseByMask(layer: HTMLCanvasElement, mask: SelectionMask) {
  const ctx = layer.getContext("2d")!;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(maskAsCanvas(mask), 0, 0);
  ctx.restore();
}

/* --- Marching-ants outline draw --- */
function drawAnts(ctx: CanvasRenderingContext2D, m: SelectionMask, step: number) {
  const w = m.width, h = m.height;
  ctx.beginPath();
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = m.data[y * w + x] > 127;
      const l = x > 0 ? m.data[y * w + (x - step >= 0 ? x - step : 0)] > 127 : false;
      const u = y > 0 ? m.data[(y - step >= 0 ? y - step : 0) * w + x] > 127 : false;
      if (v !== l) { ctx.moveTo(x, y); ctx.lineTo(x, y + step); }
      if (v !== u) { ctx.moveTo(x, y); ctx.lineTo(x + step, y); }
    }
  }
  ctx.stroke();
}

/* --- Transform handle picking --- */
function pickTransformHandle(f: FloatingTransform, p: { x: number; y: number }) {
  const cx = f.origin.x + f.origin.w / 2 + f.tx;
  const cy = f.origin.y + f.origin.h / 2 + f.ty;
  // Inverse-transform p into floating local space
  const dx = p.x - cx, dy = p.y - cy;
  const ca = Math.cos(-f.rotation), sa = Math.sin(-f.rotation);
  const lx = (dx * ca - dy * sa) / f.scale;
  const ly = (dx * sa + dy * ca) / f.scale;
  const hw = f.origin.w / 2, hh = f.origin.h / 2;
  const hs = 30; // generous picking margin
  // Rotation handle
  if (Math.hypot(lx, ly + hh + 40) < hs) return { mode: "rotate" as const, sx: p.x, sy: p.y, startTx: f.tx, startTy: f.ty, startScale: f.scale, startRot: f.rotation };
  // Corner = scale
  const corners: Array<[number, number]> = [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]];
  for (const [cxh, cyh] of corners) {
    if (Math.abs(lx - cxh) < hs && Math.abs(ly - cyh) < hs) {
      return { mode: "scale" as const, sx: p.x, sy: p.y, startTx: f.tx, startTy: f.ty, startScale: f.scale, startRot: f.rotation };
    }
  }
  // Inside bbox = move
  if (Math.abs(lx) < hw && Math.abs(ly) < hh) {
    return { mode: "move" as const, sx: p.x, sy: p.y, startTx: f.tx, startTy: f.ty, startScale: f.scale, startRot: f.rotation };
  }
  return null;
}
