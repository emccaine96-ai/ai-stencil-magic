/**
 * Retouch Studio — Phase 2 (CANVAS), extended in Phase 3 (imperative handle
 * for the topbar) and Phase 4 (tool-driven strokes, remove-fill, curves).
 *
 * Mounts the existing TouchUpCanvasEngine (src/lib/touch-up/canvas-engine.ts,
 * audit-confirmed — nothing rewritten here) onto a canvas element and wires
 * pointer + pressure events to its stroke API. This is the exact interaction
 * model from src/routes/touch-up.tsx's onPointerDown/onPointerMove, ported
 * onto Retouch Studio's five drawing tools (Curves is not a `tool` — see
 * below, it mirrors touch-up.tsx's own split exactly).
 *
 * Engine API used (verified by direct read of canvas-engine.ts):
 *  - new TouchUpCanvasEngine(editCtx)
 *  - beginStroke()                                    — snapshots for undo
 *  - strokeAt(x, y, lastX, lastY, cfg, pressure, inkHex)
 *  - undo() / redo() / canUndo() / canRedo() / discardLastStroke()
 *  - removeFillAt(x, y, sourceImageData): ImageData    — tap-only, no drag
 *  - StrokeConfig.mode: "brush" | "erase" | "lighten" | "darken" (no
 *    "remove-fill" mode — that tool calls removeFillAt directly instead of
 *    going through strokeAt, exactly like touch-up.tsx)
 *
 * Pressure contract (per Phase 2 spec): read pointerEvent.pressure; when it
 * is 0 (mouse / touch / unsupported) use 0.5. touch-up.tsx itself uses 1 as
 * its fallback — Retouch Studio's spec value 0.5 wins here; flagged in the
 * Phase 2 report and unchanged since.
 *
 * Alpha contract: the stencil PNG keeps its alpha channel; the canvas starts
 * fully transparent and drawImage preserves ink=alpha>0 / background=alpha 0.
 *
 * Stale-closure note: tool/size/opacity/inkHex are props that can change on
 * every render, but the pointer listeners are attached once (in an effect
 * that only depends on onHistoryChange) so they don't get torn down and
 * reattached mid-gesture. They're read through refs kept in sync on every
 * render instead of being read directly as props inside the handlers — this
 * is what keeps a tool switch or a slider drag effective on the very next
 * pointer event rather than one event late.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { TouchUpCanvasEngine, type StrokeConfig } from "@/lib/touch-up/canvas-engine";
import { applyLutToAlpha } from "@/lib/touch-up/tone-curve";
import type { TouchUpPayload } from "@/lib/touch-up/session";

/** The five drawing tools. Curves is handled as a separate panel, exactly
 *  like touch-up.tsx — it isn't a member of this union. */
export type RetouchTool = "brush" | "erase" | "lighten" | "darken" | "remove-fill";

/** Project-wide purple ink convention — used until Phase 11 wires real ink-color picking. */
export const DEFAULT_INK = "#A855F7";

export interface RetouchCanvasProps {
  payload: TouchUpPayload | null;
  className?: string;
  tool: RetouchTool;
  size: number;
  opacity: number;
  inkHex?: string;
  /** Called after any action that changes undo/redo availability. */
  onHistoryChange?: () => void;
}

/** Imperative API for RetouchTopBar/ToolRow/RetouchStudio — keeps the engine private to this file. */
export interface RetouchCanvasHandle {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Clears back to the original handed-off stencil. Undoable (one beginStroke snapshot first). */
  resetToOriginal: () => void;
  /** Curves flow — mirrors touch-up.tsx's curveBaseRef pattern exactly. */
  beginCurvesEdit: () => void;
  previewCurveLut: (lut: Uint8Array) => void;
  commitCurve: () => void;
  cancelCurve: () => void;
}

export const RetouchCanvas = forwardRef<RetouchCanvasHandle, RetouchCanvasProps>(
  function RetouchCanvas({ payload, className, tool, size, opacity, inkHex = DEFAULT_INK, onHistoryChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<TouchUpCanvasEngine | null>(null);
    const originalImgRef = useRef<HTMLImageElement | null>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const curveBaseRef = useRef<ImageData | null>(null);
    const curveRafRef = useRef<number | null>(null);

    // Kept fresh every render so the pointer listeners (attached once, see
    // below) never read a stale tool/size/opacity/inkHex.
    const toolRef = useRef(tool);
    const sizeRef = useRef(size);
    const opacityRef = useRef(opacity);
    const inkHexRef = useRef(inkHex);
    toolRef.current = tool;
    sizeRef.current = size;
    opacityRef.current = opacity;
    inkHexRef.current = inkHex;

    // Load the handed-off stencil into the canvas (sized to the stencil's
    // natural pixels; CSS stretches it to fill the mount point).
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !payload?.stencil) return;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        engineRef.current = new TouchUpCanvasEngine(ctx);
        originalImgRef.current = img;
      };
      img.src = payload.stencil;
    }, [payload]);

    // Pointer + pressure events → engine stroke API. Attached once; reads
    // current tool/size/opacity/inkHex via the refs above, not the props
    // directly, so it never needs to be torn down and reattached.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const toCanvasCoords = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width;
        const sy = canvas.height / rect.height;
        return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
      };

      const currentStrokeCfg = (): StrokeConfig => {
        const t = toolRef.current;
        const mode = t === "erase" || t === "lighten" || t === "darken" || t === "brush" ? t : "brush";
        return { mode, size: sizeRef.current, opacity: opacityRef.current };
      };

      const onPointerDown = (e: PointerEvent) => {
        const engine = engineRef.current;
        if (!engine) return;
        canvas.setPointerCapture(e.pointerId);
        const { x, y } = toCanvasCoords(e);

        if (toolRef.current === "remove-fill") {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const cur = ctx.getImageData(0, 0, canvas.width, canvas.height);
          engine.beginStroke();
          const result = engine.removeFillAt(Math.round(x), Math.round(y), cur);
          ctx.putImageData(result, 0, 0);
          onHistoryChange?.();
          return; // tap-only — no drag, matches touch-up.tsx
        }

        engine.beginStroke();
        drawingRef.current = true;
        lastRef.current = { x, y };
        // Spec: pressure 0 or unsupported → 0.5.
        const pressure = e.pressure > 0 ? e.pressure : 0.5;
        engine.strokeAt(x, y, x, y, currentStrokeCfg(), pressure, inkHexRef.current);
      };

      const onPointerMove = (e: PointerEvent) => {
        const engine = engineRef.current;
        const last = lastRef.current;
        if (!engine || !drawingRef.current || !last) return;
        const { x, y } = toCanvasCoords(e);
        const pressure = e.pressure > 0 ? e.pressure : 0.5;
        engine.strokeAt(x, y, last.x, last.y, currentStrokeCfg(), pressure, inkHexRef.current);
        lastRef.current = { x, y };
      };

      const endStroke = (e: PointerEvent) => {
        const wasDrawing = drawingRef.current;
        drawingRef.current = false;
        lastRef.current = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (wasDrawing) onHistoryChange?.();
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", endStroke);
      canvas.addEventListener("pointercancel", endStroke);
      return () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", endStroke);
        canvas.removeEventListener("pointercancel", endStroke);
      };
    }, [onHistoryChange]);

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          engineRef.current?.undo();
          onHistoryChange?.();
        },
        redo: () => {
          engineRef.current?.redo();
          onHistoryChange?.();
        },
        canUndo: () => !!engineRef.current?.canUndo(),
        canRedo: () => !!engineRef.current?.canRedo(),
        resetToOriginal: () => {
          const engine = engineRef.current;
          const canvas = canvasRef.current;
          const original = originalImgRef.current;
          if (!engine || !canvas || !original) return;
          engine.beginStroke(); // snapshot current edits so reset is undoable
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(original, 0, 0);
          onHistoryChange?.();
        },
        // Curves — mirrors touch-up.tsx's openCurvesPanel/previewCurve/
        // applyCurve/cancelCurvesPanel exactly, just relocated behind this
        // handle since the canvas + engine live in this file, not the panel.
        beginCurvesEdit: () => {
          const engine = engineRef.current;
          const canvas = canvasRef.current;
          if (!engine || !canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          engine.beginStroke();
          curveBaseRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        },
        previewCurveLut: (lut: Uint8Array) => {
          if (curveRafRef.current) cancelAnimationFrame(curveRafRef.current);
          curveRafRef.current = requestAnimationFrame(() => {
            const canvas = canvasRef.current;
            const base = curveBaseRef.current;
            if (!canvas || !base) return;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;
            const preview = applyLutToAlpha(
              new ImageData(new Uint8ClampedArray(base.data), base.width, base.height),
              lut,
            );
            ctx.putImageData(preview, 0, 0);
          });
        },
        commitCurve: () => {
          // Pixels are already committed on-canvas by the last previewCurveLut
          // call. Verified against touch-up.tsx's applyCurve(): it does not
          // re-paint here either, only clears the base snapshot and refreshes
          // history — the beginStroke() from beginCurvesEdit is the one real
          // undo checkpoint, left in place.
          curveBaseRef.current = null;
          onHistoryChange?.();
        },
        cancelCurve: () => {
          // Verified against touch-up.tsx's cancelCurvesPanel(): it does NOT
          // call refreshHistoryButtons() here either. For canUndo that's
          // correct, not an omission — beginStroke() (+1 to history) and
          // discardLastStroke() (-1 to history) net to zero, so whatever
          // canUndo the UI was already showing before Curves opened is still
          // accurate. canRedo is a separate, pre-existing quirk shared with
          // touch-up.tsx, not introduced here: beginStroke()'s snapshot()
          // always clears the redo stack, so if canRedo was true before
          // opening Curves it silently goes stale (still shown as true) here
          // too, until the next undo/redo/stroke calls onHistoryChange and
          // it self-corrects to false. Flagging it rather than hiding it —
          // fixing it would mean changing when refreshHistoryButtons fires
          // relative to the shared engine, which is a bigger call than this
          // phase should make unilaterally.
          const canvas = canvasRef.current;
          const base = curveBaseRef.current;
          if (canvas && base) {
            const ctx = canvas.getContext("2d");
            ctx?.putImageData(base, 0, 0);
          }
          curveBaseRef.current = null;
          engineRef.current?.discardLastStroke();
        },
      }),
      [onHistoryChange],
    );

    // MISSION line: "full-bleed white canvas, purple stencil" — matches
    // touch-up.tsx's editCanvas backgroundColor: #ffffff. Missing from the
    // Phase 2/3 drafts of this file (the canvas rendered with no backdrop at
    // all); adding it now since without it the ink is invisible against the
    // app's dark shell.
    // touch-none matters as much as bg-white here: without it, a mobile
    // browser can claim the first touch for scroll/zoom instead of handing
    // it to the pointer listeners above — also missing from the Phase 2/3
    // drafts, also copied from touch-up.tsx's editCanvas class.
    return <canvas ref={canvasRef} className={className ?? "absolute inset-0 h-full w-full bg-white touch-none"} />;
  },
);

export default RetouchCanvas;
