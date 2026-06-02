export type SymmetryMode = "none" | "x" | "y" | "xy" | "radial";

export interface SymmetryConfig {
  mode: SymmetryMode;
  radialCount: number; // 2..16
}

export const DEFAULT_SYMMETRY: SymmetryConfig = { mode: "none", radialCount: 6 };

export interface SymPoint { x: number; y: number; }

export function mirroredPoints(p: SymPoint, sym: SymmetryConfig, w: number, h: number): SymPoint[] {
  const cx = w / 2, cy = h / 2;
  switch (sym.mode) {
    case "none": return [p];
    case "x":   return [p, { x: 2 * cx - p.x, y: p.y }];
    case "y":   return [p, { x: p.x, y: 2 * cy - p.y }];
    case "xy":  return [
      p,
      { x: 2 * cx - p.x, y: p.y },
      { x: p.x, y: 2 * cy - p.y },
      { x: 2 * cx - p.x, y: 2 * cy - p.y },
    ];
    case "radial": {
      const n = Math.max(2, Math.min(16, sym.radialCount | 0));
      const out: SymPoint[] = [];
      const dx = p.x - cx, dy = p.y - cy;
      for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n;
        const c = Math.cos(a), s = Math.sin(a);
        out.push({ x: cx + dx * c - dy * s, y: cy + dx * s + dy * c });
      }
      return out;
    }
  }
}

export function drawSymmetryGuides(
  ctx: CanvasRenderingContext2D, sym: SymmetryConfig, w: number, h: number,
) {
  if (sym.mode === "none") return;
  ctx.save();
  ctx.strokeStyle = "rgba(168,85,247,0.55)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  const cx = w / 2, cy = h / 2;
  if (sym.mode === "x" || sym.mode === "xy") {
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
  }
  if (sym.mode === "y" || sym.mode === "xy") {
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
  }
  if (sym.mode === "radial") {
    const n = Math.max(2, Math.min(16, sym.radialCount | 0));
    const r = Math.hypot(cx, cy);
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI) / n;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
  }
  ctx.restore();
}