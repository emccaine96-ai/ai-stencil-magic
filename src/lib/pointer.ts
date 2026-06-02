/**
 * Mobile & touch polish helpers for the canvas.
 * - Normalizes Pointer Events to {x,y,pressure,type}
 * - Palm rejection (wide touches and touches-while-pen-active are dropped)
 * - Pinch-zoom gesture helpers
 */

export type CanvasPoint = {
  x: number; y: number;
  pressure: number;
  type: "pen" | "touch" | "mouse";
  pointerId: number;
};

export type PalmRejectOptions = {
  maxTouchRadius?: number;
  preferPen?: boolean;
};

const DEFAULTS: Required<PalmRejectOptions> = {
  maxTouchRadius: 28,
  preferPen: true,
};

export class PointerRouter {
  private opts: Required<PalmRejectOptions>;
  private penActive = false;
  private activePointers = new Map<number, CanvasPoint>();

  constructor(opts: PalmRejectOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  accept(e: PointerEvent, rect: DOMRect, scale = 1): CanvasPoint | null {
    const type = (e.pointerType as CanvasPoint["type"]) || "mouse";
    if (type === "pen") this.penActive = true;
    if (type === "touch") {
      if (this.opts.preferPen && this.penActive) return null;
      const r = Math.max(e.width || 0, e.height || 0);
      if (r > this.opts.maxTouchRadius) return null;
      if (this.activePointers.size >= 1 && !this.activePointers.has(e.pointerId)) return null;
    }
    const p: CanvasPoint = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
      pressure: e.pressure > 0 ? e.pressure : (type === "pen" ? 0.5 : 1),
      type, pointerId: e.pointerId,
    };
    this.activePointers.set(e.pointerId, p);
    return p;
  }

  release(e: PointerEvent) {
    this.activePointers.delete(e.pointerId);
    if (e.pointerType === "pen" && this.activePointers.size === 0) {
      setTimeout(() => { this.penActive = false; }, 250);
    }
  }
}

export function distance(a: PointerEvent, b: PointerEvent) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
export function midpoint(a: PointerEvent, b: PointerEvent) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}