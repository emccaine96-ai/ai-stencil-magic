/**
 * Module 11 — Stencil Inspector + Tattooability score.
 * Pure raster metrics — no ML, no guessing. Every number is directly
 * computable from the output image.
 */

export interface StencilMetrics {
  blackAreaPct: number;
  whiteAreaPct: number;
  smallRegionCount: number;
  detailDensity: number;
}

export function computeStencilMetrics(final: Uint8ClampedArray, w: number, h: number): StencilMetrics {
  let black = 0;
  for (let i = 0; i < final.length; i++) if (final[i] > 0) black++;
  const total = final.length;

  let transitions = 0;
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) if (final[y * w + x] !== final[y * w + x - 1]) transitions++;

  return {
    blackAreaPct: (black / total) * 100,
    whiteAreaPct: ((total - black) / total) * 100,
    smallRegionCount: countSmallComponents(final, w, h, 12),
    detailDensity: (transitions / total) * 1000,
  };
}

function countSmallComponents(ink: Uint8ClampedArray, w: number, h: number, maxPx: number): number {
  const n = w * h;
  const visited = new Uint8Array(n);
  let count = 0;
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (ink[start] === 0 || visited[start]) continue;
    let size = 0;
    stack.push(start); visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w, y = (i / w) | 0;
      const neighbors = [x > 0 ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y > 0 ? i - w : -1, y + 1 < h ? i + w : -1];
      for (const ni of neighbors) if (ni >= 0 && ink[ni] !== 0 && !visited[ni]) { visited[ni] = 1; stack.push(ni); }
    }
    if (size <= maxPx) count++;
  }
  return count;
}

export interface TattooabilityResult { score: number; reasons: string[] }

export function computeTattooability(metrics: StencilMetrics): TattooabilityResult {
  let score = 100;
  const reasons: string[] = [];

  if (metrics.blackAreaPct > 45) {
    score -= Math.min(25, (metrics.blackAreaPct - 45) * 1.2);
    reasons.push(`Large solid black area (${metrics.blackAreaPct.toFixed(1)}% of image) — may be hard to tattoo cleanly.`);
  }
  if (metrics.smallRegionCount > 40) {
    score -= Math.min(25, (metrics.smallRegionCount - 40) * 0.4);
    reasons.push(`${metrics.smallRegionCount} small isolated regions — likely to blur together under skin.`);
  }
  if (metrics.detailDensity > 220) {
    score -= Math.min(20, (metrics.detailDensity - 220) * 0.1);
    reasons.push('High overall detail density — consider raising the simplification level.');
  }
  if (metrics.blackAreaPct < 3) {
    score -= 10;
    reasons.push('Very little ink — stencil may be too faint to trace reliably.');
  }

  return { score: Math.max(0, Math.round(score)), reasons };
}
