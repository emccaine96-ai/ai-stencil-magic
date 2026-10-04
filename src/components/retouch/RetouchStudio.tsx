/**
 * Retouch Studio — Phase 1 (SHELL), extended in Phase 3 (RetouchTopBar) and
 * Phase 4 (ToolRow, SizeOpacityPill, Curves).
 *
 * Focused post-generation retouch surface. Two modes:
 *  - Retouch Mode: full-bleed white canvas, purple stencil, six tools (this
 *    phase — Tattoo Mode's layered chair reference/filmstrip/per-layer
 *    adjustments are later phases, unchanged scaffold below).
 *
 * Reused (audit-confirmed, nothing rewritten):
 *  - src/lib/touch-up/handoff.ts    — takeHandoff() / writeCurrent()
 *  - src/lib/touch-up/session.ts    — TouchUpPayload type
 *  - src/lib/touch-up/tone-curve.ts — buildToneCurveLUT() / CURVE_PRESETS
 *  - src/components/touch-up/CurveEditor.tsx — unchanged, same props
 *
 * Curves + tool-select interaction is touch-up.tsx's own, ported as-is, with
 * one deliberate, disclosed change: touch-up.tsx's tool buttons call
 * `setPanel(null)` when Curves is open without applying or canceling it,
 * which leaves that edit implicitly-applied (the pixels are already painted,
 * the undo checkpoint is already in history) but skips the bookkeeping
 * `applyCurve()` normally does. Here, switching to a drawing tool while
 * Curves is open explicitly commits it first — same end pixels, no
 * inconsistent state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { takeHandoff, writeCurrent } from "@/lib/touch-up/handoff";
import type { TouchUpPayload } from "@/lib/touch-up/session";
import { buildToneCurveLUT, CURVE_PRESETS, type CurveNode } from "@/lib/touch-up/tone-curve";
import { CurveEditor } from "@/components/touch-up/CurveEditor";
import { RetouchCanvas, DEFAULT_INK, type RetouchCanvasHandle, type RetouchTool } from "./RetouchCanvas";
import { RetouchTopBar } from "./RetouchTopBar";
import { ToolRow } from "./ToolRow";
import { SizeOpacityPill, DEFAULT_SIZE, DEFAULT_OPACITY } from "./SizeOpacityPill";
import { InkColorSheet } from "./InkColorSheet";
import { ExportSheet } from "./ExportSheet";
import { LayerFilmstrip } from "./LayerFilmstrip";
import { LayerAdjustPanel } from "./LayerAdjustPanel";
import { TattooStage } from "./TattooStage";
import {
  addImageLayer,
  createStack,
  getLayer,
  removeLayer,
  resetLook,
  setActive,
  setLocked,
  setVisible,
  updateLook,
  updateTransform,
  type LayerLook,
  type LayerTransform,
  type TattooStack,
} from "@/lib/retouch/layer-state";

export type RetouchMode = "retouch" | "tattoo";

/** Longest edge, in px, a reference photo is downscaled to. Bounds memory on huge phone photos. */
const REFERENCE_MAX_EDGE = 2048;

/** Stand-in used while not in Tattoo Mode; TattooStage with fill=true ignores it. */
const EMPTY_STACK: TattooStack = createStack(1, 1);

const CURVE_LABELS: Record<string, string> = {
  standard: "Standard",
  soft: "Soft",
  highContrast: "Punchy",
  stencilPunch: "Stencil punch",
};

export function RetouchStudio() {
  const [mode, setMode] = useState<RetouchMode>("retouch");
  const [payload, setPayload] = useState<TouchUpPayload | null>(null);
  const canvasRef = useRef<RetouchCanvasHandle>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [tool, setToolState] = useState<RetouchTool>("brush");
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [panel, setPanel] = useState<null | "curves" | "color" | "export" | "layer">(null);
  // Tattoo Mode only. null until the stencil's pixel size is known; Retouch Mode never reads it.
  const [stack, setStack] = useState<TattooStack | null>(null);
  const [stageBox, setStageBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [filmstripOpen, setFilmstripOpen] = useState(true);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inkHex, setInkHex] = useState(DEFAULT_INK);
  const [curveNodes, setCurveNodes] = useState<CurveNode[]>(CURVE_PRESETS.standard);
  const [showCompare, setShowCompare] = useState(false);

  const refreshHistoryButtons = useCallback(() => {
    setCanUndo(!!canvasRef.current?.canUndo());
    setCanRedo(!!canvasRef.current?.canRedo());
  }, []);

  // On mount: promote the pending handoff to the current session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await takeHandoff();
      if (cancelled) return;
      if (pending) {
        await writeCurrent(pending);
        setPayload(pending);
        if (pending.inkColor && /^#[0-9a-fA-F]{6}$/.test(pending.inkColor)) setInkHex(pending.inkColor);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectTool(next: RetouchTool) {
    if (panel === "curves") {
      // Commit rather than silently discard — see file header.
      canvasRef.current?.commitCurve();
    }
    setToolState(next);
    setPanel(null);
  }

  function toggleCurves() {
    if (panel === "curves") {
      canvasRef.current?.cancelCurve();
      setPanel(null);
    } else {
      canvasRef.current?.beginCurvesEdit();
      setPanel("curves");
    }
  }

  function handleCurveNodesChange(nodes: CurveNode[]) {
    setCurveNodes(nodes);
    canvasRef.current?.previewCurveLut(buildToneCurveLUT(nodes));
  }

  function applyPreset(nodes: CurveNode[]) {
    setCurveNodes(nodes);
    canvasRef.current?.previewCurveLut(buildToneCurveLUT(nodes));
  }

  // Tattoo Mode: build the stack once the stencil's pixel size is known (the
  // artboard = the stencil). Reads the same payload.stencil RetouchCanvas loads,
  // so no engine code is touched. Retouch Mode never creates a stack.
  useEffect(() => {
    if (mode !== "tattoo" || stack || !payload?.stencil) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setStack(createStack(img.naturalWidth, img.naturalHeight));
      }
    };
    img.src = payload.stencil;
    return () => {
      cancelled = true;
    };
  }, [mode, stack, payload]);

  // Track the mount area so the artboard can be fitted inside it at its true aspect ratio.
  useEffect(() => {
    const el = stageHostRef.current;
    if (!el || mode !== "tattoo") return;
    const measure = () => setStageBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, stack]);

  // Free object URLs we created for reference layers when the studio unmounts.
  const objectUrlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    },
    [],
  );

  /** Decode a picked image, downscale to REFERENCE_MAX_EDGE, and add it as a reference layer. */
  async function addReferenceFromFile(file: File) {
    if (!stack || !file.type.startsWith("image/")) return;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, REFERENCE_MAX_EDGE / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k));
      const h = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.push(url);
      setStack((cur) =>
        cur ? addImageLayer(cur, { kind: "reference", name: file.name.replace(/\.[^.]+$/, "") || "Reference", src: url, width: w, height: h }) : cur,
      );
    } catch {
      /* unreadable file: leave the stack unchanged */
    }
  }

  const activeLayer = stack ? getLayer(stack, stack.activeId) : undefined;
  const stageDisplayWidth =
    stack && stageBox.w > 0 && stageBox.h > 0
      ? Math.min(stageBox.w, (stageBox.h * stack.artboard.width) / stack.artboard.height)
      : 0;

  const inTattoo = mode === "tattoo" && !!stack && stageDisplayWidth > 0;
  // Retouch Mode (or Tattoo Mode before the stack/measurements exist) uses a
  // placeholder single-layer stack and fill=true, which renders no reference layers.
  const stageStack: TattooStack = inTattoo && stack ? stack : EMPTY_STACK;
  const stageWidth = inTattoo ? stageDisplayWidth : 0;

  function pickInkColor(hex: string) {
    // Recolors existing ink (one undoable step) and sets the color for new strokes.
    canvasRef.current?.applyInkColor(hex);
    setInkHex(hex);
  }

  function toggleSheet(which: "color" | "export" | "layer") {
    if (panel === "curves") canvasRef.current?.commitCurve();
    setPanel((cur) => (cur === which ? null : which));
  }

  function applyCurve() {
    canvasRef.current?.commitCurve();
    setPanel(null);
  }

  return (
    <div className="fixed inset-0 bg-background text-foreground flex flex-col">
      {/* Mode switch — scaffold only, no tool logic yet */}
      <div className="flex items-center justify-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setMode("retouch")}
          className={mode === "retouch" ? "font-bold" : "opacity-60"}
        >
          Retouch Mode
        </button>
        <button
          type="button"
          onClick={() => setMode("tattoo")}
          className={mode === "tattoo" ? "font-bold" : "opacity-60"}
        >
          Tattoo Mode
        </button>
      </div>

      {/* Canvas mount point */}
      <div className="relative flex-1" ref={stageHostRef}>
        {/*
          RetouchCanvas is rendered at ONE fixed position in the tree in both
          modes (TattooStage is always the parent; only its props change), so
          switching modes never unmounts it. Unmounting would discard the
          TouchUpCanvasEngine and the whole undo history. In Retouch Mode the
          stage is absolutely positioned to fill the mount exactly like before.
        */}
        <div
          className={inTattoo ? "absolute inset-0 flex items-center justify-center" : "absolute inset-0"}
          data-mode={mode}
        >
          <TattooStage
            stack={stageStack}
            displayWidth={stageWidth}
            fill={!inTattoo}
            overlay={
              inTattoo && showCompare && payload?.stencil ? (
                <img
                  src={payload.stencil}
                  alt="Original stencil"
                  className="absolute inset-0 h-full w-full object-fill pointer-events-none"
                />
              ) : null
            }
          >
            <RetouchCanvas
              ref={canvasRef}
              payload={payload}
              tool={tool}
              size={size}
              opacity={opacity}
              inkHex={inkHex}
              onHistoryChange={refreshHistoryButtons}
              className={
                inTattoo
                  ? "absolute inset-0 h-full w-full touch-none"
                  : "absolute inset-0 h-full w-full bg-white touch-none"
              }
            />
          </TattooStage>
        </div>
        {!payload && (
          <div className="absolute inset-0 flex items-center justify-center text-sm opacity-60 pointer-events-none">
            No stencil handed off yet.
          </div>
        )}
        {showCompare && payload?.stencil && !inTattoo ? (
          <img
            src={payload.stencil}
            alt="Original stencil"
            className="absolute inset-0 h-full w-full object-contain pointer-events-none"
          />
        ) : null}

        <RetouchTopBar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => canvasRef.current?.undo()}
          onRedo={() => canvasRef.current?.redo()}
          onReset={() => canvasRef.current?.resetToOriginal()}
          inkHex={inkHex}
          onInkColor={() => toggleSheet("color")}
          onPrint={() => toggleSheet("export")}
          onCommit={() => toggleSheet("export")}
          onLayers={() => {
            // The filmstrip only exists in Tattoo Mode; tapping Layers from Retouch Mode switches over.
            if (mode !== "tattoo") setMode("tattoo");
            else setFilmstripOpen((v) => !v);
          }}
          layersOpen={mode === "tattoo" && filmstripOpen}
        />

        <SizeOpacityPill size={size} opacity={opacity} onSizeChange={setSize} onOpacityChange={setOpacity} />

        <ToolRow
          tool={tool}
          curvesOpen={panel === "curves"}
          onSelectTool={selectTool}
          onToggleCurves={toggleCurves}
          onCompareStart={() => setShowCompare(true)}
          onCompareEnd={() => setShowCompare(false)}
        />

        {panel === "curves" ? (
          <div className="absolute inset-x-0 bottom-24 z-20 mx-auto w-[90%] max-w-sm rounded-2xl bg-black/40 backdrop-blur-md p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/80">Tone curve</span>
              <button
                onClick={() => {
                  canvasRef.current?.cancelCurve();
                  setPanel(null);
                }}
                className="text-white/50 hover:text-white"
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>
            <CurveEditor
              nodes={curveNodes}
              onChange={handleCurveNodesChange}
              className="w-full aspect-[2.2/1] touch-none rounded-xl bg-black/40"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(CURVE_PRESETS) as Array<keyof typeof CURVE_PRESETS>).map((k) => (
                <button
                  key={k}
                  onClick={() => applyPreset(CURVE_PRESETS[k])}
                  className="rounded-lg border border-white/15 py-1.5 text-[9px] font-semibold hover:border-primary"
                >
                  {CURVE_LABELS[k] ?? k}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => applyPreset(CURVE_PRESETS.standard)}
                className="rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary"
              >
                Reset curve
              </button>
              <button
                onClick={applyCurve}
                className="rounded-xl bg-gradient-primary text-primary-foreground py-2 text-xs font-bold"
              >
                Apply to stencil
              </button>
            </div>
          </div>
        ) : null}

        {inTattoo && stack && filmstripOpen ? (
          <LayerFilmstrip
            stack={stack}
            stencilThumb={payload?.stencil ?? null}
            onSelect={(id) => {
              // Tapping the already-active layer opens its adjust sheet; otherwise just select it.
              if (id === stack.activeId) setPanel((cur) => (cur === "layer" ? null : "layer"));
              else setStack((cur) => (cur ? setActive(cur, id) : cur));
            }}
            onToggleVisible={(id) => {
              const l = getLayer(stack, id);
              if (l) setStack((cur) => (cur ? setVisible(cur, id, !l.visible) : cur));
            }}
            onAdd={() => fileInputRef.current?.click()}
          />
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void addReferenceFromFile(f);
          }}
        />

        {inTattoo && stack && panel === "layer" && activeLayer ? (
          <LayerAdjustPanel
            layer={activeLayer}
            onLook={(patch: Partial<LayerLook>) => setStack((cur) => (cur ? updateLook(cur, activeLayer.id, patch) : cur))}
            onTransform={(patch: Partial<LayerTransform>) =>
              setStack((cur) => (cur ? updateTransform(cur, activeLayer.id, patch) : cur))
            }
            onResetLook={() => setStack((cur) => (cur ? resetLook(cur, activeLayer.id) : cur))}
            onToggleLock={() => setStack((cur) => (cur ? setLocked(cur, activeLayer.id, !activeLayer.locked) : cur))}
            onRemove={
              activeLayer.kind === "stencil"
                ? undefined
                : () => {
                    setStack((cur) => (cur ? removeLayer(cur, activeLayer.id) : cur));
                    setPanel(null);
                  }
            }
            onClose={() => setPanel(null)}
          />
        ) : null}

        {panel === "color" ? (
          <InkColorSheet inkHex={inkHex} onPick={pickInkColor} onClose={() => setPanel(null)} />
        ) : null}

        {panel === "export" ? (
          <ExportSheet
            getCanvas={() => canvasRef.current?.getEditedCanvas() ?? null}
            photo={payload?.photo ?? null}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

export default RetouchStudio;
