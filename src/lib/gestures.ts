/**
 * Gesture registry — central place to map multi-touch gestures to commands
 * without each call site reimplementing pinch/two-finger-tap detection.
 * Works alongside PointerRouter (which handles palm rejection).
 */

import { distance, midpoint } from "./pointer";

export type GestureHandlers = {
  onPinchStart?: (info: PinchInfo) => void;
  onPinch?: (info: PinchInfo) => void;
  onPinchEnd?: () => void;
  onTwoFingerTap?: () => void; // quick two-finger tap = undo
  onThreeFingerTap?: () => void; // three-finger tap = redo
  onTwoFingerSwipe?: (dx: number, dy: number) => void; // panning
};

export type PinchInfo = {
  scale: number; // multiplier relative to start
  rotation: number; // radians
  center: { x: number; y: number };
};

export class GestureRecognizer {
  private active = new Map<number, PointerEvent>();
  private startPinch: { dist: number; angle: number; center: { x: number; y: number } } | null =
    null;
  private firstDownAt = 0;

  constructor(private handlers: GestureHandlers) {}

  down(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    this.active.set(e.pointerId, e);
    if (this.active.size === 1) this.firstDownAt = performance.now();
    if (this.active.size === 2) {
      const [a, b] = [...this.active.values()];
      this.startPinch = {
        dist: distance(a, b),
        angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX),
        center: midpoint(a, b),
      };
      this.handlers.onPinchStart?.({ scale: 1, rotation: 0, center: this.startPinch.center });
    }
  }

  move(e: PointerEvent) {
    if (e.pointerType !== "touch" || !this.active.has(e.pointerId)) return;
    this.active.set(e.pointerId, e);
    if (this.active.size === 2 && this.startPinch) {
      const [a, b] = [...this.active.values()];
      const d = distance(a, b);
      const ang = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
      this.handlers.onPinch?.({
        scale: d / this.startPinch.dist,
        rotation: ang - this.startPinch.angle,
        center: midpoint(a, b),
      });
    }
  }

  up(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    const wasN = this.active.size;
    this.active.delete(e.pointerId);
    if (wasN === 2 && this.active.size < 2) {
      this.startPinch = null;
      this.handlers.onPinchEnd?.();
      const dt = performance.now() - this.firstDownAt;
      if (dt < 220) this.handlers.onTwoFingerTap?.();
    }
    if (wasN === 3 && this.active.size < 3) {
      const dt = performance.now() - this.firstDownAt;
      if (dt < 260) this.handlers.onThreeFingerTap?.();
    }
  }

  cancel() {
    this.active.clear();
    this.startPinch = null;
  }
}
