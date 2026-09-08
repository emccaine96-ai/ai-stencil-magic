/**
 * Touch-Up Studio — non-destructive layered retouch canvas.
 * Three canvases, same layering concept as the existing Vault editor for
 * consistency: `base` (the generated stencil, read-only reference), `edit`
 * (user strokes, the only thing that's mutable), `preview` (composite for
 * display). This engine only ever draws to the edit canvas — never mutates
 * base.
 */
// @ts-ignore — standalone JS module (matches classical-pro-integration.ts convention)
import { findConnectedComponent } from "../classical-engine/cleanup.js";

export interface StrokeConfig { mode: "brush" | "erase" | "lighten" | "darken"; size: number; opacity: number; }

export class TouchUpCanvasEngine {
  private history: ImageData[] = [];
  private redoStack: ImageData[] = [];

  constructor(private editCtx: CanvasRenderingContext2D) {}

  private snapshot() {
    const c = this.editCtx.canvas;
    this.history.push(this.editCtx.getImageData(0, 0, c.width, c.height));
    this.redoStack = [];
    if (this.history.length > 50) this.history.shift(); // cap memory
  }

  strokeAt(x: number, y: number, lastX: number, lastY: number, cfg: StrokeConfig, pressure = 1) {
    const ctx = this.editCtx;
    const size = cfg.size * pressure;
    const opacity = cfg.opacity * pressure;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = size; ctx.globalAlpha = opacity;
    switch (cfg.mode) {
      case "erase":   ctx.globalCompositeOperation = "destination-out"; ctx.strokeStyle = "black"; break;
      case "lighten": ctx.globalCompositeOperation = "destination-out"; ctx.strokeStyle = "black"; break; // reduces stencil density non-destructively -- operates on the edit layer's own alpha, never on base
      case "darken":  ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "black"; break;     // adds density to the edit layer
      default:        ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "black"; break;     // brush
    }
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
  }

  beginStroke() { this.snapshot(); }

  undo() {
    if (!this.history.length) return;
    const c = this.editCtx.canvas;
    this.redoStack.push(this.editCtx.getImageData(0, 0, c.width, c.height));
    this.editCtx.putImageData(this.history.pop()!, 0, 0);
  }
  redo() {
    if (!this.redoStack.length) return;
    const c = this.editCtx.canvas;
    this.history.push(this.editCtx.getImageData(0, 0, c.width, c.height));
    this.editCtx.putImageData(this.redoStack.pop()!, 0, 0);
  }

  /**
   * Remove Fill: tap a point, flood-fill the connected ink region under it
   * (by alpha>0, matching this app's ink=opaque/background=alpha-0
   * convention), clear its interior, but keep a 1px boundary ring so the
   * outline survives. Reuses cleanup.ts's findConnectedComponent (the same
   * routine removeSmallInkSpecks uses) instead of a second flood-fill
   * implementation. Returns a new ImageData -- caller puts it on the edit
   * layer; base is never touched.
   */
  removeFillAt(x: number, y: number, sourceImageData: ImageData): ImageData {
    const { width: w, height: h, data } = sourceImageData;
    const n = w * h;
    const startIdx = y * w + x;
    if (x < 0 || x >= w || y < 0 || y >= h || data[startIdx * 4 + 3] === 0) {
      // Nothing to remove at a transparent/background pixel.
      return new ImageData(new Uint8ClampedArray(data), w, h);
    }

    const ink = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) ink[i] = data[i * 4 + 3] > 0 ? 255 : 0;

    const visited = new Uint8Array(n);
    const component = findConnectedComponent(ink, w, h, startIdx, visited);
    const inComponent = new Uint8Array(n);
    for (const i of component) inComponent[i] = 1;

    const out = new ImageData(new Uint8ClampedArray(data), w, h);
    for (const i of component) {
      const cx = i % w, cy = (i / w) | 0;
      const neighbors = [
        cx > 0 ? i - 1 : -1, cx + 1 < w ? i + 1 : -1,
        cy > 0 ? i - w : -1, cy + 1 < h ? i + w : -1,
      ];
      let isBoundary = false;
      for (const ni of neighbors) {
        if (ni < 0 || !inComponent[ni]) { isBoundary = true; break; }
      }
      if (!isBoundary) out.data[i * 4 + 3] = 0; // interior -- clear, keep boundary ring intact
    }
    return out;
  }
}

// Missing from the earlier draft entirely, despite pressure being a stated
// requirement -- reference wiring for the actual pointer event listeners:
//
// canvas.addEventListener("pointerdown", (e: PointerEvent) => { engine.beginStroke(); lastX = e.offsetX; lastY = e.offsetY; });
// canvas.addEventListener("pointermove", (e: PointerEvent) => {
//   if (e.buttons !== 1) return;
//   const pressure = e.pressure > 0 ? e.pressure : 1; // mouse/touch report 0 -- treat as full pressure
//   engine.strokeAt(e.offsetX, e.offsetY, lastX, lastY, currentConfig, pressure);
//   lastX = e.offsetX; lastY = e.offsetY;
// });
