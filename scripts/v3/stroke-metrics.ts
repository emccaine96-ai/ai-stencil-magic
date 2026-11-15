// A second, robust stroke-width measure to sit beside the repo's scorePair.widthMedian (which is NOT modified).
// scorePair.widthMedian = median of (2*dt - 1) over every distance-transform local maximum, so each tiny fragment
// contributes a width-1 sample and many specks drag the median to 1.0 whatever the real strokes look like.
//   robustWidth  = ink area / skeleton length, over components of at least MIN_COMP pixels (dust cannot dominate)
//   skelDtWidth  = median of (2*dt - 1) sampled ONLY on the skeleton of components of at least MIN_COMP pixels
// Both use the same normalised masks as scorePair (normalisePair) so they are directly comparable.
import { normalisePair } from '../../src/lib/calibration/engine-metrics.js';

export const MIN_COMP = 12;

/** Zhang-Suen thinning on a 0/1 mask. Deterministic, in place on a copy. */
export function skeletonize(mask: Uint8Array, w: number, h: number): Uint8Array {
  const m = Uint8Array.from(mask);
  const idx = (x: number, y: number) => y * w + x;
  let changed = true;
  const toClear: number[] = [];
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      toClear.length = 0;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y); if (!m[i]) continue;
        const p2 = m[idx(x, y - 1)], p3 = m[idx(x + 1, y - 1)], p4 = m[idx(x + 1, y)], p5 = m[idx(x + 1, y + 1)];
        const p6 = m[idx(x, y + 1)], p7 = m[idx(x - 1, y + 1)], p8 = m[idx(x - 1, y)], p9 = m[idx(x - 1, y - 1)];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
        const A = (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) + (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
        if (A !== 1) continue;
        if (pass === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) toClear.push(i);
      }
      if (toClear.length) { changed = true; for (const i of toClear) m[i] = 0; }
    }
  }
  return m;
}

/** Chamfer distance to the nearest background pixel (borders count as background), 3-4 style with sqrt2 diagonals. */
function distance(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9, D = 1, DD = Math.SQRT2; const dt = new Float32Array(w * h);
  for (let i = 0; i < dt.length; i++) dt[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!dt[i]) continue; dt[i] = Math.min(dt[i], (x > 0 ? dt[i - 1] : 0) + D, (y > 0 ? dt[i - w] : 0) + D, (x > 0 && y > 0 ? dt[i - w - 1] : 0) + DD, (x < w - 1 && y > 0 ? dt[i - w + 1] : 0) + DD, x === 0 || y === 0 ? D : INF); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!dt[i]) continue; dt[i] = Math.min(dt[i], (x < w - 1 ? dt[i + 1] : 0) + D, (y < h - 1 ? dt[i + w] : 0) + D, (x < w - 1 && y < h - 1 ? dt[i + w + 1] : 0) + DD, (x > 0 && y < h - 1 ? dt[i + w - 1] : 0) + DD, x === w - 1 || y === h - 1 ? D : INF); }
  return dt;
}

/** Keep only 8-connected components with at least `min` pixels. */
export function dropSmall(mask: Uint8Array, w: number, h: number, min = MIN_COMP): Uint8Array {
  const out = new Uint8Array(mask.length), seen = new Uint8Array(mask.length), stack = new Int32Array(mask.length), mem = new Int32Array(mask.length);
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue; let sp = 0, n = 0; stack[sp++] = s; seen[s] = 1;
    while (sp) { const i = stack[--sp]; mem[n++] = i; const x = i % w, y = (i / w) | 0; for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w || (!dx && !dy)) continue; const j = yy * w + xx; if (mask[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; } } } }
    if (n >= min) for (let k = 0; k < n; k++) out[mem[k]] = 1;
  }
  return out;
}

export type Stroke = { robust: number; skelDt: number; skelLen: number; inkArea: number };
export function robustStroke(mask: Uint8Array, w: number, h: number): Stroke {
  const big = dropSmall(mask, w, h, MIN_COMP);
  let area = 0; for (let i = 0; i < big.length; i++) area += big[i];
  const sk = skeletonize(big, w, h); let len = 0; for (let i = 0; i < sk.length; i++) len += sk[i];
  const dt = distance(big, w, h); const v: number[] = []; for (let i = 0; i < sk.length; i++) if (sk[i]) v.push(2 * dt[i] - 1);
  v.sort((a, b) => a - b);
  return { robust: len ? area / len : 0, skelDt: v.length ? v[(v.length - 1) >> 1] : 0, skelLen: len, inkArea: area };
}

/** Masks exactly as scorePair builds them, then both robust measures for prediction and reference. */
export function strokeBoth(pred: any, ref: any, source: any = null) {
  const { w, h, predMask, refMask } = normalisePair(pred, ref);
  return { pred: robustStroke(predMask as Uint8Array, w, h), ref: robustStroke(refMask as Uint8Array, w, h), w, h };
}
