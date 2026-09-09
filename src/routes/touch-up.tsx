import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  X,
  Undo2,
  Redo2,
  Trash2,
  Paintbrush,
  Eraser,
  Sun,
  Moon,
  PaintBucket,
  Download,
  Maximize,
  Printer,
  Layers,
  Check,
  Pipette,
  ImageMinus,
  Hand,
  Loader2,
  Spline,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { TouchUpCanvasEngine, type StrokeConfig } from "@/lib/touch-up/canvas-engine";
import { INK_COLORS, tintInkMask, sampleInkHex } from "@/lib/touch-up/ink-lab";
import {
  buildToneCurveLUT,
  CURVE_PRESETS,
  applyLutToAlpha,
  type CurveNode,
} from "@/lib/touch-up/tone-curve";
import { CurveEditor } from "@/components/touch-up/CurveEditor";
import {
  pixelsToInches,
  inchesToMm,
  PAPER_SIZES,
  composePrintCanvas,
  printCanvas,
} from "@/lib/touch-up/print";
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
  readJson,
  type TouchUpPayload,
  type TouchUpAutosave,
  type TouchUpGenConfig,
} from "@/lib/touch-up/session";
import {
  takeHandoff,
  writeCurrent,
  readCurrent,
  writeAutosave,
  readAutosave,
} from "@/lib/touch-up/handoff";
import { listDocuments, bestExportUrl, type DocumentData } from "@/lib/localDB";
import { saveStencil } from "@/lib/vault";
import { processClassicalPro } from "@/lib/classical-pro-integration";

export const Route = createFileRoute("/touch-up")({
  head: () => ({
    meta: [
      { title: "Touch-Up Studio — AI Stencil Magic" },
      {
        name: "description",
        content:
          "Fix and finish your generated stencil — pressure brush, smart erase, remove fills, interactive tone curves, ink color, true-size print, and Tattoo Mode.",
      },
      { property: "og:title", content: "Touch-Up Studio — AI Stencil Magic" },
      {
        property: "og:description",
        content:
          "Retouch every line of your stencil, print it true to size, and keep it at the chair while you work.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TouchUpPage,
});

type Tool =
  | "brush"
  | "erase"
  | "lighten"
  | "darken"
  | "remove-fill"
  | "eyedropper"
  | "smart-erase"
  | "pan";
type ViewMode = "stencil" | "photo" | "overlay";
type Panel = null | "curves" | "print" | "color" | "layers";

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
  const [booting, setBooting] = useState(true);

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
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tool, setTool] = useState<Tool>("brush");
  const [size, setSize] = useState(25);
  const [opacity, setOpacity] = useState(0.25);
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
  const [panel, setPanel] = useState<Panel>(null);
  const [curveNodes, setCurveNodes] = useState<CurveNode[]>(CURVE_PRESETS.standard);

  camRef.current = cam;
  const activeHex = inkColorId === "custom" ? customHex : (INK_COLORS.find((c) => c.id === inkColorId)?.hex ?? customHex);

  /* ---------------- load: IndexedDB hand-off, then current, then legacy ---------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const apply = (p: TouchUpPayload) => {
        if (!alive) return;
        setSourceStencil(p.stencil);
        if (p.photo) setPhotoUrl(p.photo);
        if (p.config) setGenConfig(p.config);
        if (p.inkColor) {
          const known = INK_COLORS.find(
            (c) => c.id === p.inkColor || c.hex.toLowerCase() === p.inkColor!.toLowerCase(),
          );
          if (known) setInkColorId(known.id);
        }
      };

      try {
        const handoff = await takeHandoff();
        if (handoff?.stencil) {
          apply(handoff);
          void writeCurrent(handoff);
          setBooting(false);
          return;
        }
        // Legacy sessionStorage hand-off (older builds).
        const legacy = readJson<TouchUpPayload>(TOUCHUP_LOAD_KEY);
        if (legacy?.stencil) {
          sessionStorage.removeItem(TOUCHUP_LOAD_KEY);
          apply(legacy);
          void writeCurrent(legacy);
          setBooting(false);
          return;
        }
        const current = await readCurrent();
        if (current?.stencil) {
          apply(current);
          setBooting(false);
          return;
        }
        const legacyCurrent = sessionStorage.getItem(TOUCHUP_CURRENT_KEY);
        if (legacyCurrent) {
          apply({ stencil: legacyCurrent });
        }
      } catch {
        /* fall through to empty state */
      }
      if (alive) setBooting(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (sourceStencil) return;
    let alive = true;
    listDocuments()
      .then((docs) => {
        if (alive) setRecent(docs.slice(0, 12));
      })
      .catch(() => {
        /* empty vault */
      });
    return () => {
      alive = false;
    };
  }, [sourceStencil]);

  function loadStencil(dataUrl: string, photo?: string | null) {
    setSourceStencil(dataUrl);
    if (photo !== undefined) setPhotoUrl(photo);
    void writeCurrent({ stencil: dataUrl, photo: photo ?? photoUrl, config: genConfig ?? undefined });
  }

  function onUpload(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") loadStencil(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function persistAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const edit = editCanvasRef.current;
      if (!edit || !sourceStencil) return;
      void writeAutosave({
        edited: edit.toDataURL("image/png"),
        source: sourceStencil,
        photo: photoUrl,
        config: genConfig ?? undefined,
        inkColorId,
        customHex,
      } satisfies TouchUpAutosave);
    }, 700);
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
      toast.success("Saved to your Vault");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      toast.error("Could not save — try again");
      setTimeout(() => setSaveState("idle"), 2500);
    }
  }

  /* ---------------- canvas setup ---------------- */
  useEffect(() => {
    if (!sourceStencil) return;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth,
        h = img.naturalHeight;
      setDims({ w, h });
      const base = baseCanvasRef.current,
        edit = editCanvasRef.current,
        mask = maskCanvasRef.current;
      if (!base || !edit) return;
      base.width = w;
      base.height = h;
      edit.width = w;
      edit.height = h;
      if (mask) {
        mask.width = w;
        mask.height = h;
      }
      base.getContext("2d")!.drawImage(img, 0, 0);
      const ectx = edit.getContext("2d")!;
      ectx.clearRect(0, 0, w, h);
      ectx.drawImage(img, 0, 0);
      engineRef.current = new TouchUpCanvasEngine(ectx);
      setCanUndo(false);
      setCanRedo(false);
      if (!exclusionRef.current || exclusionRef.current.width !== w || exclusionRef.current.height !== h) {
        exclusionRef.current = createEmptyMask(w, h);
        setMaskTick((n) => n + 1);
      }
      void (async () => {
        const auto = await readAutosave();
        if (auto?.edited && auto.source === sourceStencil) {
          const restored = new Image();
          restored.onload = () => {
            ectx.clearRect(0, 0, w, h);
            ectx.drawImage(restored, 0, 0);
          };
          restored.src = auto.edited;
          if (auto.inkColorId) setInkColorId(auto.inkColorId);
          if (auto.customHex) setCustomHex(auto.customHex);
        }
      })();
    };
    img.onerror = () => toast.error("That stencil image could not be opened.");
    img.src = sourceStencil;
  }, [sourceStencil]);

  const refreshMaskOverlay = useCallback(() => {
    const ctx = maskCanvasRef.current?.getContext("2d");
    const mask = exclusionRef.current;
    if (!ctx || !mask) return;
    renderMaskOverlay(ctx, mask);
  }, []);

  useEffect(() => {
    refreshMaskOverlay();
  }, [maskTick, refreshMaskOverlay]);

  const refreshHistoryButtons = useCallback(() => {
    const e = engineRef.current;
    setCanUndo(!!e?.canUndo());
    setCanRedo(!!e?.canRedo());
  }, []);

  /* ---------------- pointer plumbing ---------------- */
  function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = e.currentTarget.width / rect.width;
    const scaleY = e.currentTarget.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function strokeCfg(): StrokeConfig {
    const mode =
      tool === "erase" || tool === "lighten" || tool === "darken" || tool === "brush" ? tool : "brush";
    return { mode, size, opacity };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointersRef.current.size > 1) return;
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
        setInkColorId("custom");
        toast.success(`Ink sampled: ${hex}`);
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
    engine.strokeAt(p.x, p.y, p.x, p.y, strokeCfg(), pressure, activeHex);
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
    engine.strokeAt(p.x, p.y, lastPointRef.current.x, lastPointRef.current.y, strokeCfg(), pressure, activeHex);
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
      pinchRef.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        scale: camRef.current.scale,
      };
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

  /* ---------------- actions ---------------- */
  function undo() {
    engineRef.current?.undo();
    refreshHistoryButtons();
    persistAutosave();
  }
  function redo() {
    engineRef.current?.redo();
    refreshHistoryButtons();
    persistAutosave();
  }

  function resetToOriginal() {
    const base = baseCanvasRef.current,
      edit = editCanvasRef.current,
      engine = engineRef.current;
    if (!base || !edit || !engine) return;
    engine.beginStroke();
    const ctx = edit.getContext("2d")!;
    ctx.clearRect(0, 0, edit.width, edit.height);
    ctx.drawImage(base, 0, 0);
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

  function applyCurve(nodes: CurveNode[]) {
    const edit = editCanvasRef.current;
    const engine = engineRef.current;
    if (!edit || !engine) return;
    const ctx = edit.getContext("2d")!;
    engine.beginStroke();
    const cur = ctx.getImageData(0, 0, edit.width, edit.height);
    ctx.putImageData(applyLutToAlpha(cur, buildToneCurveLUT(nodes)), 0, 0);
    refreshHistoryButtons();
    persistAutosave();
    toast.success("Tone curve applied");
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
    const paperSel = PAPER_SIZES.find((p) => p.id === paperId) ?? PAPER_SIZES[0];
    const page = composePrintCanvas(edit, edit.width, edit.height, { dpi, paper: paperSel, mirror });
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
  const stencilOpacity = view === "photo" ? 0 : view === "overlay" ? overlayOpacity : 1;
  const showPhoto = !!photoUrl && view !== "stencil";
  const showMask = tool === "smart-erase";

  /* ---------------- empty state ---------------- */
  if (!sourceStencil) {
    return (
      <div className="min-h-screen bg-[#0d0d0f] text-white flex flex-col items-center gap-5 p-6">
        <div className="w-full max-w-md flex items-center justify-between">
          <Link to="/create" className="flex items-center gap-1 text-sm text-white/60 hover:text-white">
            <X size={18} /> Close
          </Link>
          <span className="font-script text-lg">Touch-Up Studio</span>
          <span className="w-10" />
        </div>
        {booting ? (
          <Loader2 className="animate-spin text-primary mt-10" size={26} />
        ) : (
          <>
            <p className="text-white/60 text-sm max-w-xs text-center">
              Pick a saved stencil, upload an image, or generate a new one to start touching up.
            </p>
            <div className="w-full max-w-md space-y-3">
              <label className="block w-full rounded-full bg-gradient-primary text-primary-foreground px-4 py-3 text-sm font-bold text-center cursor-pointer">
                Upload an image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files?.[0])}
                />
              </label>
              <Link
                to="/create"
                className="block w-full rounded-full border border-white/15 hover:border-primary/60 px-4 py-3 text-sm font-semibold text-center text-white/70 hover:text-white transition"
              >
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
                      <button
                        key={doc.id}
                        onClick={() => loadStencil(url, doc.originalAIImage ?? null)}
                        className="rounded-xl overflow-hidden border border-white/10 hover:border-primary bg-white aspect-square"
                        title={doc.name}
                      >
                        <img src={doc.thumbnail || url} alt={doc.name} className="h-full w-full object-contain" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  const tools: { id: Tool; label: string; icon: typeof Paintbrush }[] = [
    { id: "brush", label: "Brush", icon: Paintbrush },
    { id: "erase", label: "Eraser", icon: Eraser },
    { id: "lighten", label: "Lighten", icon: Sun },
    { id: "darken", label: "Darken", icon: Moon },
    { id: "remove-fill", label: "Fills", icon: PaintBucket },
    { id: "smart-erase", label: "Smart", icon: ImageMinus },
    { id: "eyedropper", label: "Sample", icon: Pipette },
    { id: "pan", label: "Pan", icon: Hand },
  ];

  const chip = "h-9 w-9 grid place-items-center rounded-full text-white/80 hover:text-white transition";

  return (
    <div ref={containerRef} className="fixed inset-0 bg-[#0d0d0f] text-white overflow-hidden select-none">
      {/* Canvas stage — 100% of the viewport, UI floats above it */}
      <div
        ref={stageRef}
        className="absolute inset-0 grid place-items-center bg-[#0d0d0f]"
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
      >
        <div
          className="relative max-h-full max-w-full"
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
            className="block max-h-[100vh] max-w-[100vw] h-auto w-auto touch-none bg-white"
            style={{
              opacity: stencilOpacity,
              filter: `brightness(${stencilFilter.brightness}) contrast(${stencilFilter.contrast})`,
              cursor: tool === "pan" ? "grab" : "crosshair",
              backgroundColor: showPhoto ? "transparent" : "#ffffff",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          <canvas
            ref={maskCanvasRef}
            className="absolute inset-0 h-full w-full pointer-events-none"
            style={{ display: showMask ? "block" : "none" }}
          />
          {showCompare ? (
            <img
              src={sourceStencil}
              alt="Original (before edits)"
              className="absolute inset-0 h-full w-full object-contain pointer-events-none"
            />
          ) : null}
        </div>
        {regenState === "running" ? (
          <div className="absolute inset-0 bg-black/60 grid place-items-center">
            <Loader2 className="animate-spin text-primary" size={30} />
          </div>
        ) : null}
      </div>

      {/* Top-left close */}
      <Link
        to="/create"
        className="absolute top-3 left-3 h-9 w-9 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white/80 hover:text-white"
        aria-label="Close Touch-Up Studio"
      >
        <X size={17} />
      </Link>

      {/* Top-center history capsule */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-1">
        <button onClick={undo} disabled={!canUndo} className={`${chip} disabled:opacity-30`} aria-label="Undo">
          <Undo2 size={17} />
        </button>
        <button onClick={redo} disabled={!canRedo} className={`${chip} disabled:opacity-30`} aria-label="Redo">
          <Redo2 size={17} />
        </button>
        <button onClick={resetToOriginal} className={chip} aria-label="Reset to original">
          <Trash2 size={17} />
        </button>
      </div>

      {/* Top-right actions */}
      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-1">
        <button onClick={() => setPanel(panel === "print" ? null : "print")} className={chip} aria-label="Print settings">
          <Printer size={17} />
        </button>
        <button
          onClick={() => setPanel(panel === "color" ? null : "color")}
          className="h-9 w-9 grid place-items-center rounded-full"
          aria-label="Ink color"
        >
          <span className="h-5 w-5 rounded-full border-2 border-white/70" style={{ backgroundColor: activeHex }} />
        </button>
        <button onClick={() => setPanel(panel === "layers" ? null : "layers")} className={chip} aria-label="Layers">
          <Layers size={17} />
        </button>
        <button onClick={toggleTattooMode} className={chip} aria-label="Tattoo Mode">
          <Maximize size={17} />
        </button>
        <button
          onClick={saveToVault}
          className="h-9 w-9 grid place-items-center rounded-full bg-gradient-primary text-primary-foreground"
          aria-label="Save to Vault"
        >
          {saveState === "saving" ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} />}
        </button>
      </div>

      {/* Layer chips (Photo / Stencil / Overlay) */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[188px] flex items-end gap-2">
        {(["photo", "stencil", "overlay"] as ViewMode[]).map((v) => {
          const disabled = v !== "stencil" && !photoUrl;
          const thumb = v === "photo" ? photoUrl : sourceStencil;
          return (
            <button
              key={v}
              disabled={disabled}
              onClick={() => setView(v)}
              className={`w-12 rounded-lg overflow-hidden border-2 transition disabled:opacity-30 ${view === v ? "border-primary" : "border-white/20"}`}
            >
              <span className="block h-12 w-full bg-white">
                {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : null}
              </span>
              <span className="block bg-black/70 text-[9px] py-0.5 capitalize">{v}</span>
            </button>
          );
        })}
        <button
          onClick={downloadPNG}
          className="w-12 h-[62px] rounded-lg border-2 border-dashed border-white/25 grid place-items-center text-white/60 hover:text-white"
          aria-label="Download PNG"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Size / Opacity capsule */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[132px] w-[min(560px,94vw)] flex items-center gap-3 rounded-full bg-black/70 backdrop-blur px-4 py-2 text-[11px]">
        <span className="text-white/60">Size</span>
        <input
          type="range"
          min={1}
          max={120}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className="w-6 tabular-nums">{size}</span>
        <span className="text-white/60">Opacity</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <span className="w-8 tabular-nums">{Math.round(opacity * 100)}%</span>
      </div>

      {/* Tool dock */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 w-[min(620px,96vw)] rounded-3xl bg-black/75 backdrop-blur px-2 py-2">
        <div className="grid grid-cols-5 sm:grid-cols-9 gap-1">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id);
                setPanel(null);
                if (t.id === "smart-erase" && photoUrl) setView("overlay");
              }}
              className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[9px] font-semibold transition ${tool === t.id ? "bg-gradient-primary text-primary-foreground" : "text-white/70 hover:text-white"}`}
            >
              <t.icon size={17} /> {t.label}
            </button>
          ))}
          <button
            onClick={() => setPanel(panel === "curves" ? null : "curves")}
            className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[9px] font-semibold transition ${panel === "curves" ? "bg-gradient-primary text-primary-foreground" : "text-white/70 hover:text-white"}`}
          >
            <Spline size={17} /> Curves
          </button>
        </div>
        <button
          onPointerDown={() => setShowCompare(true)}
          onPointerUp={() => setShowCompare(false)}
          onPointerLeave={() => setShowCompare(false)}
          className="mt-1 w-full text-center text-[10px] text-white/40 hover:text-white/80"
        >
          Hold to compare with original
        </button>
      </div>

      {/* ---------------- bottom sheets ---------------- */}
      {panel === "curves" ? (
        <Sheet title="Tone curve" onClose={() => setPanel(null)}>
          <p className="text-[11px] text-white/50">
            Drag any point to bend the curve. Tap empty grid space to add a point, double-tap a middle point to remove
            it. Highlights sit top-right, shadows bottom-left.
          </p>
          <CurveEditor nodes={curveNodes} onChange={setCurveNodes} className="w-full max-w-[240px] mx-auto aspect-square touch-none rounded-xl bg-black/50" />
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(CURVE_PRESETS) as Array<keyof typeof CURVE_PRESETS>).map((k) => (
              <button
                key={k}
                onClick={() => setCurveNodes(CURVE_PRESETS[k])}
                className="rounded-xl border border-white/15 py-2 text-[10px] font-semibold hover:border-primary"
              >
                {CURVE_LABELS[k] ?? k}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setCurveNodes(CURVE_PRESETS.standard)}
              className="rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary"
            >
              Reset curve
            </button>
            <button
              onClick={() => applyCurve(curveNodes)}
              className="rounded-xl bg-gradient-primary text-primary-foreground py-2 text-xs font-bold"
            >
              Apply to stencil
            </button>
          </div>
        </Sheet>
      ) : null}

      {panel === "color" ? (
        <Sheet title="Ink color" onClose={() => setPanel(null)}>
          <div className="flex gap-2 flex-wrap">
            {INK_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => applyInkColor(c.hex, c.id)}
                title={c.name}
                className={`h-9 w-9 rounded-full border-2 transition ${inkColorId === c.id ? "border-primary scale-110" : "border-white/20"}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
            <input
              type="color"
              value={customHex}
              onChange={(e) => {
                setCustomHex(e.target.value);
                applyInkColor(e.target.value, "custom");
              }}
              className="h-9 w-9 rounded-full border-2 border-white/20 cursor-pointer bg-transparent"
              title="Custom color"
            />
          </div>
          <p className="text-[11px] text-white/50">
            Recolors the ink only — transparent background is preserved for overlays and PNG export.
          </p>
        </Sheet>
      ) : null}

      {panel === "layers" ? (
        <Sheet title="Layer look" onClose={() => setPanel(null)}>
          {view === "overlay" ? (
            <Slider label="Overlay" value={overlayOpacity} min={0} max={1} step={0.01} onChange={setOverlayOpacity} />
          ) : null}
          <Slider
            label="Photo bright"
            value={photoFilter.brightness}
            min={0.4}
            max={1.8}
            step={0.05}
            onChange={(v) => setPhotoFilter((f) => ({ ...f, brightness: v }))}
          />
          <Slider
            label="Photo contrast"
            value={photoFilter.contrast}
            min={0.4}
            max={1.8}
            step={0.05}
            onChange={(v) => setPhotoFilter((f) => ({ ...f, contrast: v }))}
          />
          <Slider
            label="Ink bright"
            value={stencilFilter.brightness}
            min={0.4}
            max={1.8}
            step={0.05}
            onChange={(v) => setStencilFilter((f) => ({ ...f, brightness: v }))}
          />
          <Slider
            label="Ink contrast"
            value={stencilFilter.contrast}
            min={0.4}
            max={1.8}
            step={0.05}
            onChange={(v) => setStencilFilter((f) => ({ ...f, contrast: v }))}
          />
        </Sheet>
      ) : null}

      {panel === "print" ? (
        <Sheet title="True-size print & export" onClose={() => setPanel(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-white/60">
              DPI
              <input
                type="number"
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value) || 300)}
                className="mt-1 w-full bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-sm text-white"
              />
            </label>
            <label className="text-xs text-white/60">
              Paper
              <select
                value={paperId}
                onChange={(e) => setPaperId(e.target.value)}
                className="mt-1 w-full bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-sm text-white"
              >
                {PAPER_SIZES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {physicalIn ? (
            <p className="text-[11px] text-white/50">
              Stencil {physicalIn.w.toFixed(2)} in × {physicalIn.h.toFixed(2)} in (
              {inchesToMm(physicalIn.w).toFixed(0)} mm × {inchesToMm(physicalIn.h).toFixed(0)} mm) at {dpi} DPI ·{" "}
              {paper.name} is {paper.widthIn.toFixed(2)} in × {paper.heightIn.toFixed(2)} in
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror for transfer
            (print/export only)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePrint}
              className="rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary"
            >
              Print on {paper.name}
            </button>
            <button
              onClick={downloadPNG}
              className="rounded-xl bg-gradient-primary text-primary-foreground py-2 text-xs font-bold"
            >
              Download PNG
            </button>
          </div>
        </Sheet>
      ) : null}

      {tool === "smart-erase" ? (
        <Sheet title="Smart Erase" onClose={() => setTool("brush")}>
          <p className="text-[11px] text-white/50">
            Paint over stray hairs, clothing folds, or background on the photo, then regenerate — the source photo is
            never modified. Hold Shift/Alt to un-paint.
          </p>
          {!photoUrl ? (
            <p className="text-[11px] text-destructive">
              This session has no source photo, so regenerate is unavailable. Open Touch-Up from a fresh generation.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={clearExclusion}
                className="rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary"
              >
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
        </Sheet>
      ) : null}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#131316]/95 backdrop-blur-xl p-4 pb-28 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close panel">
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-[11px] text-white/60 w-24">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="text-[11px] w-10 text-right tabular-nums">{value.toFixed(2)}</span>
    </div>
  );
}

/* Plus icon is referenced by the layer strip in future revisions; keep the
   import used so tree-shaking stays predictable. */
void Plus;
