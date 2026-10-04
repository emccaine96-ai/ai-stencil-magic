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

export type RetouchMode = "retouch" | "tattoo";

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
  const [panel, setPanel] = useState<null | "curves" | "color" | "export">(null);
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

  function pickInkColor(hex: string) {
    // Recolors existing ink (one undoable step) and sets the color for new strokes.
    canvasRef.current?.applyInkColor(hex);
    setInkHex(hex);
  }

  function toggleSheet(which: "color" | "export") {
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
      <div className="relative flex-1">
        <RetouchCanvas
          ref={canvasRef}
          payload={payload}
          tool={tool}
          size={size}
          opacity={opacity}
          inkHex={inkHex}
          onHistoryChange={refreshHistoryButtons}
        />
        {!payload && (
          <div className="absolute inset-0 flex items-center justify-center text-sm opacity-60 pointer-events-none">
            No stencil handed off yet.
          </div>
        )}
        {showCompare && payload?.stencil ? (
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
