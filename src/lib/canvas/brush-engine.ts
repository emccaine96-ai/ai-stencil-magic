/**
 * Professional brush engine — pressure-aware, interpolated, hardness+flow control.
 * Renders each stroke into an offscreen buffer, then composites into the target
 * canvas on endStroke so intra-stroke opacity doesn't stack per-dab.
 */

import type { BlendMode } from "./blend-modes";

export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
}

export interface BrushSettings {
  size: number;
  opacity: number; // 0-100
  hardness: number; // 0-100
  flow: number; // 0-100
  spacing: number; // 0-100 (% of size)
  pressureSensitivity: boolean;
  pressureOpacity: boolean;
  pressureSize: boolean;
  color: string; // #rrggbb
  blendMode: BlendMode;
}

export class ProfessionalBrush {
  private points: BrushPoint[] = [];
  private lastPoint: BrushPoint | null = null;
  private strokeCanvas: HTMLCanvasElement;
  private strokeCtx: CanvasRenderingContext2D;

  constructor(
    private targetCanvas: HTMLCanvasElement,
    private settings: BrushSettings,
  ) {
    this.strokeCanvas = document.createElement("canvas");
    this.strokeCanvas.width = targetCanvas.width;
    this.strokeCanvas.height = targetCanvas.height;
    this.strokeCtx = this.strokeCanvas.getContext("2d", { willReadFrequently: false })!;
  }

  updateSettings(next: Partial<BrushSettings>) {
    this.settings = { ...this.settings, ...next };
  }

  startStroke(x: number, y: number, pressure = 1) {
    this.points = [];
    this.lastPoint = { x, y, pressure, timestamp: Date.now() };
    this.strokeCtx.clearRect(0, 0, this.strokeCanvas.width, this.strokeCanvas.height);
    this.drawBrushDab(x, y, pressure);
  }

  continueStroke(x: number, y: number, pressure = 1) {
    if (!this.lastPoint) return;
    const point: BrushPoint = { x, y, pressure, timestamp: Date.now() };
    this.points.push(point);

    const dist = Math.hypot(x - this.lastPoint.x, y - this.lastPoint.y);
    const spacing = Math.max(1, (this.settings.size * this.settings.spacing) / 100);
    const steps = Math.max(1, Math.ceil(dist / spacing));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ix = this.lastPoint.x + (x - this.lastPoint.x) * t;
      const iy = this.lastPoint.y + (y - this.lastPoint.y) * t;
      const ip = this.lastPoint.pressure + (pressure - this.lastPoint.pressure) * t;
      this.drawBrushDab(ix, iy, ip);
    }
    this.lastPoint = point;
  }

  private drawBrushDab(x: number, y: number, pressure: number) {
    const ctx = this.strokeCtx;
    let size = this.settings.size;
    let opacity = this.settings.opacity / 100;

    if (this.settings.pressureSensitivity) {
      if (this.settings.pressureSize) size *= 0.3 + pressure * 0.7;
      if (this.settings.pressureOpacity) opacity *= 0.3 + pressure * 0.7;
    }
    opacity *= this.settings.flow / 100;

    const radius = Math.max(0.5, size / 2);
    const hardness = Math.min(1, Math.max(0, this.settings.hardness / 100));
    const color = this.settings.color;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const solid = hexToRgba(color, opacity);
    if (hardness < 1) {
      gradient.addColorStop(0, solid);
      gradient.addColorStop(hardness, solid);
      gradient.addColorStop(1, hexToRgba(color, 0));
    } else {
      gradient.addColorStop(0, solid);
      gradient.addColorStop(1, solid);
    }

    // Buffer is composed with source-over inside the stroke; blend mode
    // applies once when we composite to the target on endStroke.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  endStroke() {
    const targetCtx = this.targetCanvas.getContext("2d")!;
    targetCtx.save();
    targetCtx.globalCompositeOperation = this.settings.blendMode;
    targetCtx.drawImage(this.strokeCanvas, 0, 0);
    targetCtx.restore();
    this.points = [];
    this.lastPoint = null;
    this.strokeCtx.clearRect(0, 0, this.strokeCanvas.width, this.strokeCanvas.height);
  }

  /** Live preview overlay for stroke-in-progress. Draw this above the target canvas. */
  get previewCanvas(): HTMLCanvasElement {
    return this.strokeCanvas;
  }
}

export function getPointerPressure(e: PointerEvent | MouseEvent): number {
  if ("pressure" in e && (e as PointerEvent).pressure > 0) {
    return (e as PointerEvent).pressure;
  }
  return (e as MouseEvent).buttons === 1 ? 1 : 0;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
