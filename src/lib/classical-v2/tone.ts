/**
 * classical-v2 / tone
 * Tile CLAHE in the float domain plus a "gentle" blend that keeps shadows from
 * being lifted (fixes washed-out dark regions such as the tiger's chin).
 */
import { bilateral, gaussian } from "./filters";

/** Tile-based CLAHE with bilinear tile blending. Input/output 0..1. */
export function clahe(src: Float32Array, w: number, h: number, grid = 8, clip = 2.0): Float32Array {
  const bins = 256;
  const tw = Math.ceil(w / grid), th = Math.ceil(h / grid);
  const maps: Float32Array[] = [];
  for (let ty = 0; ty < grid; ty++) {
    for (let tx = 0; tx < grid; tx++) {
      const hist = new Float32Array(bins);
      const x0 = tx * tw, y0 = ty * th;
      const x1 = Math.min(w, x0 + tw), y1 = Math.min(h, y0 + th);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[Math.min(bins - 1, (src[y * w + x] * (bins - 1) + 0.5) | 0)]++;
          count++;
        }
      }
      const map = new Float32Array(bins);
      if (count === 0) { for (let i = 0; i < bins; i++) map[i] = i / (bins - 1); maps.push(map); continue; }
      const limit = Math.max(1, (count / bins) * clip);
      let excess = 0;
      for (let i = 0; i < bins; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
      const add = excess / bins;
      let cum = 0;
      for (let i = 0; i < bins; i++) { cum += hist[i] + add; map[i] = cum / count; }
      maps.push(map);
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y - th / 2) / th;
    const ty0 = Math.max(0, Math.min(grid - 1, Math.floor(fy)));
    const ty1 = Math.min(grid - 1, ty0 + 1);
    const wy = Math.max(0, Math.min(1, fy - ty0));
    for (let x = 0; x < w; x++) {
      const fx = (x - tw / 2) / tw;
      const tx0 = Math.max(0, Math.min(grid - 1, Math.floor(fx)));
      const tx1 = Math.min(grid - 1, tx0 + 1);
      const wx = Math.max(0, Math.min(1, fx - tx0));
      const b = Math.min(bins - 1, (src[y * w + x] * (bins - 1) + 0.5) | 0);
      const top = maps[ty0 * grid + tx0][b] * (1 - wx) + maps[ty0 * grid + tx1][b] * wx;
      const bot = maps[ty1 * grid + tx0][b] * (1 - wx) + maps[ty1 * grid + tx1][b] * wx;
      out[y * w + x] = top * (1 - wy) + bot * wy;
    }
  }
  return out;
}

export interface PrepOptions {
  clip: number;        // CLAHE clip limit
  mix: number;         // 0..1 share of equalised tone blended in
  protectShadows: boolean; // lean on the un-equalised value where tone < ~0.27
}

/** Dark-keyed photos (median < ~110/255) get the shadow-protecting blend; light art keeps full CLAHE. */
export function prepOptionsFor(gray: Float32Array): PrepOptions {
  const s = Float32Array.from(gray).sort();
  const median = s[s.length >> 1];
  return median < 110 / 255
    ? { clip: 1.4, mix: 0.5, protectShadows: true }
    : { clip: 2.0, mix: 1.0, protectShadows: false };
}

export function prepTone(gray: Float32Array, w: number, h: number, o: PrepOptions): Float32Array {
  const b = bilateral(gray, w, h, 4, 5, 28 / 255);
  const c = clahe(b, w, h, 8, o.clip);
  const wt = new Float32Array(w * h);
  for (let i = 0; i < wt.length; i++) wt[i] = o.protectShadows && b[i] < 70 / 255 ? o.mix * 0.35 : o.mix;
  const ws = o.protectShadows ? gaussian(wt, w, h, 6) : wt;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = b[i] * (1 - ws[i]) + c[i] * ws[i];
  return out;
}
