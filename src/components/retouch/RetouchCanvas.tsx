/**
 * Retouch Studio — Phase 2 (CANVAS).
 *
 * Mounts the existing TouchUpCanvasEngine (src/lib/touch-up/canvas-engine.ts,
 * audit-confirmed — nothing rewritten here) onto a canvas element and wires
 * pointer + pressure events to its stroke API.
 *
 * Engine API used (verified by direct read of canvas-engine.ts):
 *  - new TouchUpCanvasEngine(editCtx)
 *  - beginStroke()                     — snapshots for undo
 *  - strokeAt(x, y, lastX, lastY, cfg, pressure, inkHex)
 *  - undo() / redo() / canUndo() / canRedo()
 *
 * Pressure contract (per spec): read pointerEvent.pressure; when it is 0
 * (mouse / touch / unsupported) use 0.5. The engine's own header comment
 * suggests 1 — the spec value 0.5 wins; flagged in the Phase 2 report.
 *
 * Alpha contract: the stencil PNG keeps its alpha channel; the canvas starts
 * fully transparent and drawImage preserves ink=alpha>0 / background=alpha 0.
 */
import { useEffect, useRef } from "react";
import { TouchUpCanvasEngine, type StrokeConfig } from "@/lib/touch-up/canvas-engine";
import type { TouchUpPayload } from "@/lib/touch-up/session";

/** Default stroke config until the Size/Opacity settings pill lands (Phase 3+). */
const DEFAULT_STROKE: StrokeConfig = { mode: "brush", size: 24, opacity: 1 };
/** Project-wide purple ink convention. */
const DEFAULT_INK = "#A855F7";

export interface RetouchCanvasProps {
  payload: TouchUpPayload | null;
  className?: string;
}

export function RetouchCanvas({ payload, className }: RetouchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TouchUpCanvasEngine | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

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
    };
    img.src = payload.stencil;
  }, [payload]);

  // Pointer + pressure events → engine stroke API.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const toCanvasCoords = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    };

    const onPointerDown = (e: PointerEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      canvas.setPointerCapture(e.pointerId);
      engine.beginStroke();
      drawingRef.current = true;
      lastRef.current = toCanvasCoords(e);
    };

    const onPointerMove = (e: PointerEvent) => {
      const engine = engineRef.current;
      const last = lastRef.current;
      if (!engine || !drawingRef.current || !last) return;
      const { x, y } = toCanvasCoords(e);
      // Spec: pressure 0 or unsupported → 0.5.
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      engine.strokeAt(x, y, last.x, last.y, DEFAULT_STROKE, pressure, DEFAULT_INK);
      lastRef.current = { x, y };
    };

    const endStroke = (e: PointerEvent) => {
      drawingRef.current = false;
      lastRef.current = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
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
  }, []);

  return <canvas ref={canvasRef} className={className ?? "absolute inset-0 h-full w-full"} />;
}

export default RetouchCanvas;
