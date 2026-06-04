/**
 * Phase 6 Wave 6 — Async stamp pipeline. Pre-bakes brush stamps in an
 * OffscreenCanvas so the main thread never blocks on radial-gradient
 * generation, even with very large brushes. Falls back gracefully.
 */

import { supportsOffscreen, createOffscreen } from "./offscreen";
import type { Brush } from "./advanced-brushes";

const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function key(b: Brush, radius: number, angle: number) {
  return `${b.id}|${radius.toFixed(1)}|${angle.toFixed(2)}|${b.params.color}|${b.params.hardness}|${b.params.texturePattern ?? ""}|${b.params.textureDepth ?? 0}`;
}

function hexRgb(h: string): [number, number, number] {
  const v = h.replace("#", "");
  const n = parseInt(v.length === 3 ? v.split("").map((c) => c + c).join("") : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyTexture(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, w: number, h: number, pattern: string, depth: number) {
  const img = (ctx as any).getImageData(0, 0, w, h) as ImageData;
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      let n = 1;
      if (pattern === "noise_coarse") n = 0.5 + Math.random() * 0.5;
      else if (pattern === "noise_fine") n = 0.75 + Math.random() * 0.25;
      else if (pattern === "rough_grain") n = (Math.sin(x * 0.7) + Math.cos(y * 0.6)) * 0.25 + 0.75 + Math.random() * 0.2;
      else if (pattern === "canvas_weave") n = ((x + y) % 3 === 0) ? 0.6 : 1;
      else if (pattern === "bristle_lines") n = (y % 2 === 0) ? 0.4 + Math.random() * 0.3 : 1;
      else if (pattern === "skin_pore") n = Math.random() < 0.04 ? 0.4 : 1;
      else if (pattern === "ink_bleed") n = 0.5 + Math.random() * 0.5;
      else if (pattern === "soft_cloud") n = 0.7 + Math.random() * 0.3;
      d[i + 3] = Math.max(0, Math.min(255, d[i + 3] * (1 - depth + depth * n)));
    }
  }
  (ctx as any).putImageData(img, 0, 0);
}

export function getStamp(brush: Brush, radius: number, angle: number): HTMLCanvasElement | OffscreenCanvas {
  const k = key(brush, radius, angle);
  const hit = cache.get(k);
  if (hit) return hit;
  const d = Math.max(2, Math.ceil(radius * 2));
  const c = createOffscreen(d, d);
  const ctx = (c.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D)!;
  const cx = d / 2, cy = d / 2;
  const [r, g, b] = hexRgb(brush.params.color);

  if (brush.type === "calligraphy") {
    (ctx as any).translate(cx, cy); (ctx as any).rotate(angle);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    (ctx as any).ellipse(0, 0, radius, Math.max(0.6, radius * 0.32), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (brush.type === "spray") {
    const dots = 16 + Math.floor(radius * 1.4);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    for (let i = 0; i < dots; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * radius;
      ctx.globalAlpha = 0.3 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.4 + Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    const hardness = brush.params.hardness;
    const grad = ctx.createRadialGradient(cx, cy, radius * hardness, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (brush.params.texturePattern && (brush.params.textureDepth ?? 0) > 0) {
    applyTexture(ctx as any, d, d, brush.params.texturePattern, brush.params.textureDepth!);
  }
  cache.set(k, c);
  if (cache.size > 256) {
    // Evict oldest
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return c;
}

export function clearStampCache() { cache.clear(); }
export function stampCacheSize() { return cache.size; }
export const offscreenEnabled = supportsOffscreen();
