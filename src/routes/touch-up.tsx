import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from "react";
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
  Archive,
  Pipette,
  ImageMinus,
  Hand,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { TouchUpCanvasEngine, type StrokeConfig } from "@/lib/touch-up/canvas-engine";
import { INK_COLORS, tintInkMask, sampleInkHex } from "@/lib/touch-up/ink-lab";
import { buildToneCurveLUT, CURVE_PRESETS, applyLutToAlpha } from "@/lib/touch-up/tone-curve";
import { pixelsToInches, inchesToMm, PAPER_SIZES, composePrintCanvas, printCanvas, type PaperSize } from "@/lib/touch-up/print";
import { enterTattooMode } from "@/lib/touch-up/tattoo-mode";
import {
  createEmptyMask,
  paintExclusion,
  renderMaskOverlay,
  maskHasPaint,
  type ExclusionMask,
} from "@/lib/touch-up/smart-erase";
import {
  TOUCHUP_LOAD_KEY,
  TOUCHUP_CURRENT_KEY,
  TOUCHUP_AUTOSAVE_KEY,
  readJson,
  writeJson,
  type TouchUpPayload,
  type TouchUpAutosave,
  type TouchUpGenConfig,
} from "@/lib/touch-up/session";
import { listDocuments, bestExportUrl, type DocumentData } from "@/lib/localDB";
import { saveStencil } from "@/lib/vault";
import { processClassicalPro } from "@/lib/classical-pro-integration";

export const Route = createFileRoute("/touch-up")({
  head: () => ({
    meta: [
      { title: "Touch-Up Studio — AI Stencil Magic" },
      { name: "description", content: "Fix and finish your generated stencil — brush, erase, remove fills, tone curves, ink color, true-size print, and Tattoo Mode." },
    ],
  }),
  component: TouchUpPage,
});

type Tool = "brush" | "erase" | "lighten" | "darken" | "remove-fill" | "eyedropper" | "smart-erase" | "pan";
type ViewMode = "stencil" | "photo" | "overlay";

const CURVE_LABELS: Record<string, string> = {
  standard: "Standard",
  soft: "Soft",
  highContrast: "Punchy",
  stencilPunch: "Stencil punch",
};

function TouchUpPage() {
  const [sourceStencil, setSourceStencil] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [genConfig, setGenConfig] = useState<TouchUpGenConfig | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const editCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<TouchUpCanvasEngine | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const tattooExitRef = useRef<(() => void) | null>(null);
  const exclusionRef = useRef<ExclusionMask | null>(null);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; scale: number; x: number; y: number } | null>(null);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<Tool>("brush");
  const [size, setSize] = useState(12);
  const [opacity, setOpacity] = useState(1);
  const [inkColorId, setInkColorId] = useState("purple");
  const [customHex, setCustomHex] = useState("#7C3AED");
  const [dpi, setDpi] = useState(300);
  const [paperId, setPaperId] = useState("letter");
  const [mirror, setMirror] = useState(false);
  const [tattooMode, setTattooMode] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [recent, setRecent] = useState<DocumentData[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [view, setView] = useState<ViewMode>("stencil");
  const [overlayOpacity, setOverlayOpacity] = useState(0.85);
  const [photoFilter, setPhotoFilter] = useState({ brightness: 1, contrast: 1 });
  const [stencilFilter, setStencilFilter] = useState({ brightness: 1, contrast: 1 });
  const [cam, setCam] = useState({ x: 0, y: 0, scale: 1 });
  const [regenState, setRegenState] = useState<"idle" | "running" | "error">("idle");
  const [maskTick, setMaskTick] = useState(0);
  const [curvePreview, setCurvePreview] = useState<string>("standard");

  camRef.current = cam;

  useEffect(() => {
    try {
      const payload = readJson<TouchUpPayload>(TOUCHUP_LOAD_KEY);
      if (payload?.stencil) {
        sessionStorage.removeItem(TOUCHUP_LOAD_KEY);
        setSourceStencil(payload.stencil);
        if (payload.photo) setPhotoUrl(payload.photo);
        if (payload.config) setGenConfig(payload.config);
        if (payload.inkColor) {
          const known = INK_COLORS.find((c) => c.id === payload.inkColor || c.hex.toLowerCase() === payload.inkColor!.toLowerCase());
          if (known) setInkColorId(known.id);
        }
        writeJson(TOUCHUP_CURRENT_KEY, payload.stencil);
        return;
      }
      const current = sessionStorage.getItem(TOUCHUP_CURRENT_KEY);
      if (current) {
        setSourceStencil(current);
        const auto = readJson<TouchUpAutosave>(TOUCHUP_AUTOSAVE_KEY);
        if (auto?.photo) setPhotoUrl(auto.photo);
        if (auto?.config) setGenConfig(auto.config);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (sourceStencil) return;
    let alive = true;
    listDocuments()
      .then((docs) => { if (alive) setRecent(docs.slice(0, 12)); })
      .catch(() => { /* empty vault */ });
    return () => { alive = false; };
  }, [sourceStencil]);

  function loadStencil(dataUrl: string) {
    setSourceStencil(dataUrl);
    writeJson(TOUCHUP_CURRENT_KEY, dataUrl);
  }

  function onUpload(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") loadStencil(reader.result); };
    reader.readAsDataURL(file);
  }

  function persistAutosave() {
    const edit = editCanvasRef.current;
    if (!edit || !sourceStencil) return;
    writeJson(TOUCHUP_AUTOSAVE_KEY, {
      edited: edit.toDataURL("image/png"),
      source: sourceStencil,
      photo: photoUrl,
      config: genConfig ?? undefined,
      inkColorId,
      customHex,
    } satisfies TouchUpAutosave);
  }

  async function saveToVault() {
    const edit = editCanvasRef.current;
    if (!edit) return;
    setSaveState("saving");
    try {
      await saveStencil({
        stencil: edit.toDataURL("image/png"),
        photo: photoUrl,
        style: "touch-up",
        meta: { source: "touch-up-studio" },
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2500);
    }
  }

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
      if (!exclusionRef.current || exclusionRef.current.width !== w || exclusionRef.current.height !== h) {
        exclusionRef.current = createEmptyMask(w, h);
        setMaskTick((n) => n + 1);
      }
      const auto = readJson<TouchUpAutosave>(TOUCHUP_AUTOSAVE_KEY);
      if (auto?.edited && auto.source === sourceStencil) {
        const restored = new Image();
        restored.onload = () => {
          edit.getContext("2d")!.clearRect(0, 0, w, h);
          edit.getContext("2d")!.drawImage(restored, 0, 0);
        };
        restored.src = auto.edited;
        if (auto.inkColorId) setInkColorId(auto.inkColorId);
        if (auto.customHex) setCustomHex(auto.customHex);
      }
    };
    img.src = sourceStencil;
  }, [sourceStencil]);

  const refreshMaskOverlay = useCallback(() => {
    const ctx = maskCanvasRef.current?.getContext("2d");
    const mask = exclusionRef.current;
    if (!ctx || !mask) return;
    renderMaskOverlay(ctx, mask);
  }, []);

  useEffect(() => { refreshMaskOverlay(); }, [maskTick, refreshMaskOverlay]);

  const refreshHistoryButtons = useCallback(() => {
    const e = engineRef.current;
    setCanUndo(!!e?.canUndo());
    setCanRedo(!!e?.canRedo());
  }, []);

  function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = e.currentTarget.width / rect.width;
    const scaleY = e.currentTarget.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function strokeCfg(): StrokeConfig {
    return { mode: tool === "erase" || tool === "lighten" || tool === "darken" || tool === "brush" ? tool : "brush", size, opacity };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.size >= 1) return; // pinch is handled on the stage
    const engine = engineRef.current;
    if (!engine) return;
    const p = pointerPos(e);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);

    if (tool === "pan") {
      panLastRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "eyedropper") {
      const ctx = editCanvasRef.current!.getContext("2d")!;
      const cur = ctx.getImageData(0, 0, editCanvasRef.current!.width, editCanvasRef.current!.height);
      const hex = sampleInkHex(cur, p.x, p.y);
      if (hex) {
        setCustomHex(hex);
        applyInkColor(hex, "custom");
      }
      return;
    }
    if (tool === "smart-erase") {
      lastPointRef.current = p;
      const mask = exclusionRef.current;
      if (!mask) return;
      paintExclusion(mask, p.x, p.y, size, e.shiftKey || e.altKey);
      refreshMaskOverlay();
      return;
    }
    if (tool === "remove-fill") {
      const ctx = editCanvasRef.current!.getContext("2d")!;
      const cur = ctx.getImageData(0, 0, editCanvasRef.current!.width, editCanvasRef.current!.height);
      engine.beginStroke();
      const result = engine.removeFillAt(Math.round(p.x), Math.round(p.y), cur);
      ctx.putImageData(result, 0, 0);
      refreshHistoryButtons();
      persistAutosave();
      return;
    }
    engine.beginStroke();
    lastPointRef.current = p;
    const pressure = e.pressure > 0 ? e.pressure : 1;
    engine.strokeAt(p.x, p.y, p.x, p.y, strokeCfg(), pressure);
    refreshHistoryButtons();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.size > 1) return;
    if (tool === "pan" && panLastRef.current && e.buttons === 1) {
      const dx = e.clientX - panLastRef.current.x;
      const dy = e.clientY - panLastRef.current.y;
      panLastRef.current = { x: e.clientX, y: e.clientY };
      setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
      return;
    }
    if (e.buttons !== 1) return;
    if (tool === "smart-erase" && lastPointRef.current) {
      const p = pointerPos(e);
      const mask = exclusionRef.current;
      if (!mask) return;
      paintExclusion(mask, p.x, p.y, size, e.shiftKey || e.altKey);
      lastPointRef.current = p;
      refreshMaskOverlay();
      return;
    }
    const engine = engineRef.current;
    if (!engine || tool === "remove-fill" || tool === "eyedropper" || !lastPointRef.current) return;
    const p = pointerPos(e);
    const pressure = e.pressure > 0 ? e.pressure : 1;
    engine.strokeAt(p.x, p.y, lastPointRef.current.x, lastPointRef.current.y, strokeCfg(), pressure);
    lastPointRef.current = p;
  }

  function onPointerUp() {
    lastPointRef.current = null;
    panLastRef.current = null;
    if (tool === "smart-erase") setMaskTick((n) => n + 1);
    if (tool !== "pan" && tool !== "eyedropper" && tool !== "smart-erase") persistAutosave();
  }

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.08 : 1 / 1.08;
      setCam((c) => ({ ...c, scale: Math.min(8, Math.max(0.2, c.scale * factor)) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [sourceStencil]);

  function onStagePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = { dist, scale: camRef.current.scale, x: camRef.current.x, y: camRef.current.y };
    }
  }
  function onStagePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const next = pinchRef.current.scale * (dist / Math.max(1, pinchRef.current.dist));
      setCam((c) => ({ ...c, scale: Math.min(8, Math.max(0.2, next)) }));
    }
  }
  function onStagePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  }

  function undo() { engineRef.current?.undo(); refreshHistoryButtons(); persistAutosave(); }
  function redo() { engineRef.current?.redo(); refreshHistoryButtons(); persistAutosave(); }

  function resetToOriginal() {
    const base = baseCanvasRef.current, edit = editCanvasRef.current, engine = engineRef.current;
    if (!base || !edit || !engine) return;
    engine.beginStroke();
    edit.getContext("2d")!.drawImage(base, 0, 0);
    refreshHistoryButtons();
    persistAutosave();
  }

  function applyInkColor(hex: string, id: string) {
    const edit = editCanvasRef.current;
    const engine = engineRef.current;
    if (!edit || !engine) return;
    const ctx = edit.getContext("2d")!;
    engine.beginStroke();
    const cur = ctx.getImageData(0, 0, edit.width, edit.height);
    ctx.putImageData(tintInkMask(cur, hex), 0, 0);
    setInkColorId(id);
    refreshHistoryButtons();
    persistAutosave();
  }

  function applyToneCurve(presetKey: keyof typeof CURVE_PRESETS) {
    const edit = editCanvasRef.current;
    const engine = engineRef.current;
    if (!edit || !engine) return;
    const ctx = edit.getContext("2d")!;
    engine.beginStroke();
    const cur = ctx.getImageData(0, 0, edit.width, edit.height);
    const lut = buildToneCurveLUT(CURVE_PRESETS[presetKey]);
    ctx.putImageData(applyLutToAlpha(cur, lut), 0, 0);
    setCurvePreview(presetKey);
    refreshHistoryButtons();
    persistAutosave();
  }

  function exportCanvas(mirrored: boolean): HTMLCanvasElement {
    const edit = editCanvasRef.current!;
    const out = document.createElement("canvas");
    out.width = edit.width;
    out.height = edit.height;
    const octx = out.getContext("2d")!;
    if (mirrored) {
      octx.translate(out.width, 0);
      octx.scale(-1, 1);
    }
    octx.drawImage(edit, 0, 0);
    return out;
  }

  function downloadPNG() {
    const out = exportCanvas(mirror);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "touched-up-stencil.png";
    a.click();
  }

  function handlePrint() {
    const edit = editCanvasRef.current;
    if (!edit) return;
    const paper = PAPER_SIZES.find((p) => p.id === paperId) ?? PAPER_SIZES[0];
    const page = composePrintCanvas(edit, edit.width, edit.height, { dpi, paper, mirror });
    printCanvas(page, "Touched-up stencil");
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

  async function regenerate() {
    if (!photoUrl || !exclusionRef.current || !maskHasPaint(exclusionRef.current)) {
      toast.error("Paint exclusion regions on the photo overlay first.");
      return;
    }
    setRegenState("running");
    try {
      const result = await processClassicalPro(photoUrl, {
        style: genConfig?.style ?? "hatching",
        intensity: genConfig?.intensity ?? 0.7,
        purpleTint: true,
        useAdvancedPipeline: genConfig?.useAdvancedPipeline ?? false,
        useRetinex: genConfig?.useRetinex ?? false,
        backgroundMode: genConfig?.backgroundMode ?? "keep",
        exclusionMask: exclusionRef.current,
      });
      loadStencil(result.dataUrl);
      toast.success(`Regenerated with Smart Erase (${result.processingTime}ms)`);
      setRegenState("idle");
    } catch (err) {
      console.error("[touch-up] regenerate failed", err);
      setRegenState("error");
      toast.error("Regenerate failed — try again");
      setTimeout(() => setRegenState("idle"), 2500);
    }
  }

  function clearExclusion() {
    if (!dims) return;
    exclusionRef.current = createEmptyMask(dims.w, dims.h);
    setMaskTick((n) => n + 1);
  }

  const physicalIn = dims ? { w: pixelsToInches(dims.w, dpi), h: pixelsToInches(dims.h, dpi) } : null;
  const paper = PAPER_SIZES.find((p) => p.id === paperId) ?? PAPER_SIZES[0];
  const lutPreview = buildToneCurveLUT(CURVE_PRESETS[curvePreview] ?? CURVE_PRESETS.standard);
  const stencilOpacity = view === "photo" ? 0 : view === "overlay" ? overlayOpacity : 1;
  const showPhoto = !!photoUrl && view !== "stencil";
  const showMask = tool === "smart-erase" || (exclusionRef.current ? maskHasPaint(exclusionRef.current) : false);

  if (!sourceStencil) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center gap-5 p-6">
        <div className="w-full max-w-md flex items-center justify-between">
          <Link to="/create" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft size={18} /> Back
          </Link>
          <span className="font-script text-lg">Touch-Up Studio</span>
          <span className="w-10" />
        </div>
        <p className="text-muted-foreground text-sm max-w-xs text-center">
          Pick a saved stencil, upload an image, or generate a new one to start touching up.
        </p>
        <div className="w-full max-w-md space-y-3">
          <label className="block w-full rounded-full bg-gradient-primary text-primary-foreground px-4 py-3 text-sm font-bold text-center cursor-pointer">
            Upload an image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
          <Link to="/create" className="block w-full rounded-full border border-border hover:border-primary/50 px-4 py-3 text-sm font-semibold text-center text-muted-foreground hover:text-foreground transition">
            Go to Generator
          </Link>
        </div>
        {recent.length ? (
          <div className="w-full max-w-md space-y-2">
            <div className="text-sm font-semibold">From your Vault</div>
            <div className="grid grid-cols-3 gap-2">
              {recent.map((doc) => {
                const url = bestExportUrl(doc);
                if (!url) return null;
                return (
                  <button key={doc.id} onClick={() => loadStencil(url)} className="rounded-xl overflow-hidden border border-border hover:border-primary bg-white aspect-square" title={doc.name}>
                    <img src={doc.thumbnail || url} alt={doc.name} className="h-full w-full object-contain" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const tools: { id: Tool; label: string; icon: typeof Paintbrush }[] = [
    { id: "brush", label: "Brush", icon: Paintbrush },
    { id: "erase", label: "Erase", icon: Eraser },
    { id: "lighten", label: "Lighten", icon: Sun },
    { id: "darken", label: "Darken", icon: Moon },
    { id: "remove-fill", label: "Rm. Fill", icon: PaintBucket },
    { id: "eyedropper", label: "Sample", icon: Pipette },
    { id: "smart-erase", label: "Smart Erase", icon: ImageMinus },
    { id: "pan", label: "Pan", icon: Hand },
  ];

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
        <div className="flex gap-1 rounded-full border border-border bg-card p-1">
          {(["stencil", "photo", "overlay"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => {
                if (v !== "stencil" && !photoUrl) {
                  toast.info("No source photo on this session — generate from Create to enable Overlay / Photo.");
                  return;
                }
                setView(v);
              }}
              className={`flex-1 rounded-full py-1.5 text-xs font-semibold capitalize transition ${view === v ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>

        <div
          ref={stageRef}
          className="relative overflow-hidden rounded-3xl border border-border bg-white"
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerUp}
        >
          <div
            className="relative origin-center"
            style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}
          >
            {showPhoto ? (
              <img
                src={photoUrl!}
                alt="Source photo"
                className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                style={{ filter: `brightness(${photoFilter.brightness}) contrast(${photoFilter.contrast})` }}
              />
            ) : null}
            <canvas ref={baseCanvasRef} className="hidden" />
            <canvas
              ref={editCanvasRef}
              className="relative w-full h-auto touch-none block"
              style={{
                opacity: stencilOpacity,
                filter: `brightness(${stencilFilter.brightness}) contrast(${stencilFilter.contrast})`,
                cursor: tool === "pan" ? "grab" : "crosshair",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            <canvas
              ref={maskCanvasRef}
              className="absolute inset-0 h-full w-full pointer-events-none"
              style={{ display: showMask && view !== "stencil" ? "block" : tool === "smart-erase" ? "block" : "none" }}
            />
            {showCompare ? (
              <img src={sourceStencil} alt="Original (before edits)" className="absolute inset-0 h-full w-full object-contain pointer-events-none" />
            ) : null}
          </div>
          {regenState === "running" ? (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
          ) : null}
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Scroll to zoom · Pan tool or two-finger pinch to move · edits never touch the original
        </p>

        <div className="rounded-2xl border border-border bg-card p-3 space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTool(t.id);
                  if (t.id === "smart-erase" && photoUrl) setView("overlay");
                }}
                className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-semibold border transition ${tool === t.id ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground w-14">Size</label>
            <input type="range" min={1} max={80} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1" />
            <span className="text-xs w-8 text-right">{size}</span>
          </div>
          {tool !== "remove-fill" && tool !== "eyedropper" && tool !== "pan" && tool !== "smart-erase" ? (
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-14">Opacity</label>
              <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="flex-1" />
              <span className="text-xs w-8 text-right">{Math.round(opacity * 100)}%</span>
            </div>
          ) : null}
          {view === "overlay" ? (
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-14">Overlay</label>
              <input type="range" min={0} max={1} step={0.01} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} className="flex-1" />
              <span className="text-xs w-8 text-right">{Math.round(overlayOpacity * 100)}%</span>
            </div>
          ) : null}
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

        {tool === "smart-erase" ? (
          <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
            <div className="text-sm font-semibold">Smart Erase</div>
            <p className="text-[11px] text-muted-foreground">
              Paint over stray hairs, clothing, or background on the photo, then regenerate. Hold Shift/Alt to un-paint. Source photo is never modified.
            </p>
            {!photoUrl ? (
              <p className="text-[11px] text-destructive">This session has no source photo, so regenerate is unavailable. Open Touch-Up from a fresh generation.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={clearExclusion} className="rounded-xl border border-border py-2 text-xs font-semibold hover:border-primary/50">
                  Clear mask
                </button>
                <button
                  onClick={regenerate}
                  disabled={regenState === "running"}
                  className="rounded-xl bg-gradient-primary text-primary-foreground py-2 text-xs font-bold disabled:opacity-50"
                >
                  {regenState === "running" ? "Regenerating…" : "Regenerate"}
                </button>
              </div>
            )}
          </div>
        ) : null}

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
          <svg viewBox="0 0 256 256" className="w-full h-16 bg-background rounded-xl border border-border">
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              points={Array.from(lutPreview, (y, x) => `${x},${255 - y}`).join(" ")}
              className="text-primary"
            />
          </svg>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(CURVE_PRESETS) as Array<keyof typeof CURVE_PRESETS>).map((k) => (
              <button
                key={k}
                onClick={() => applyToneCurve(k)}
                onPointerEnter={() => setCurvePreview(k)}
                className={`rounded-xl border py-2 text-xs font-semibold hover:border-primary/50 ${curvePreview === k ? "border-primary" : "border-border"}`}
              >
                {CURVE_LABELS[k] ?? k}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Preview is a LUT lookup, not a per-pixel spline. Apply commits via undo history.</p>
        </div>

        {(view !== "stencil" || tattooMode) ? (
          <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
            <div className="text-sm font-semibold">Layer look</div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">Photo B</label>
              <input type="range" min={0.4} max={1.8} step={0.05} value={photoFilter.brightness} onChange={(e) => setPhotoFilter((f) => ({ ...f, brightness: Number(e.target.value) }))} className="flex-1" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">Photo C</label>
              <input type="range" min={0.4} max={1.8} step={0.05} value={photoFilter.contrast} onChange={(e) => setPhotoFilter((f) => ({ ...f, contrast: Number(e.target.value) }))} className="flex-1" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">Ink B</label>
              <input type="range" min={0.4} max={1.8} step={0.05} value={stencilFilter.brightness} onChange={(e) => setStencilFilter((f) => ({ ...f, brightness: Number(e.target.value) }))} className="flex-1" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-16">Ink C</label>
              <input type="range" min={0.4} max={1.8} step={0.05} value={stencilFilter.contrast} onChange={(e) => setStencilFilter((f) => ({ ...f, contrast: Number(e.target.value) }))} className="flex-1" />
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Printer size={14} /> True-size print
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              DPI
              <input type="number" value={dpi} onChange={(e) => setDpi(Number(e.target.value) || 300)} className="mt-1 w-full bg-background border border-border rounded-lg px-2 py-1 text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted-foreground">
              Paper
              <select value={paperId} onChange={(e) => setPaperId(e.target.value)} className="mt-1 w-full bg-background border border-border rounded-lg px-2 py-1 text-sm text-foreground">
                {PAPER_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          </div>
          {physicalIn ? (
            <p className="text-xs text-muted-foreground">
              Stencil {physicalIn.w.toFixed(2)} in × {physicalIn.h.toFixed(2)} in ({inchesToMm(physicalIn.w).toFixed(0)} mm × {inchesToMm(physicalIn.h).toFixed(0)} mm) at {dpi} DPI
              {" · "}
              {paper.name} is {paper.widthIn.toFixed(2)} in × {paper.heightIn.toFixed(2)} in
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror for transfer (export/print only — stored stencil unchanged)
          </label>
          <button onClick={handlePrint} className="w-full rounded-xl border border-border py-2 text-xs font-semibold hover:border-primary/50">
            Print on {paper.name}
          </button>
        </div>

        <div className="space-y-2 pb-4">
          <button onClick={downloadPNG} className="w-full rounded-full bg-gradient-primary text-primary-foreground py-3 font-bold shadow-glow flex items-center justify-center gap-2">
            <Download size={16} /> Download PNG
          </button>
          <button
            onClick={saveToVault}
            disabled={saveState === "saving"}
            className="w-full rounded-full border border-border hover:border-primary/50 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Archive size={14} />
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to Vault" : saveState === "error" ? "Save failed — try again" : "Save to Vault"}
          </button>
        </div>
      </main>
    </div>
  );
}
