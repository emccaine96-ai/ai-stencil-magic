/**
 * classical-v2 / hatch
 * Flow-following line-screen hatching, supersampled for anti-aliased strokes.
 * Each tone level adds a screen (rotated 60deg per extra layer); stroke width
 * grows with darkness. A light-tone level in the ladder models soft mid-tones
 * (noses, cheeks) that a single dark threshold would treat as blank paper.
 *
 * `orientation` is the per-pixel tangent angle from the EXISTING
 * structureTensorOrientation (classical-engine/hatching.ts) - reused, not rebuilt.
 */
export interface HatchV2Params {
  levels: number[];            // tone thresholds, light -> dark, e.g. [0.55,0.36,0.2]
  spacing: [number, number];   // [darkest-layer spacing, lightest-layer spacing] px
  width: number;               // base stroke width px
  darkBoost: number;           // extra width scaling with darkness (0 = off)
  supersample: number;         // 2 recommended
}

export const HATCH_LADDERS = {
  default: { levels: [0.55, 0.36, 0.2], spacing: [6, 13] as [number, number] },
  darkPhoto: { levels: [0.42, 0.26, 0.14], spacing: [6, 13] as [number, number] },
  portrait: { levels: [0.5, 0.32, 0.18], spacing: [6, 13] as [number, number] },
  softLight: { levels: [0.7, 0.52, 0.34, 0.18], spacing: [6, 15] as [number, number] },
};

/** Returns soft ink 0..1 at the input resolution. */
export function renderHatchV2(
  tone: Float32Array, orientation: Float32Array, w: number, h: number,
  p: HatchV2Params,
): Float32Array {
  const ss = Math.max(1, Math.round(p.supersample));
  const W = w * ss, H = h * ss;
  const out = new Float32Array(W * H);

  // Bilinear sample of tone + doubled-angle vector field (avoids wrap seams).
  const c2 = new Float32Array(w * h), s2 = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { c2[i] = Math.cos(2 * orientation[i]); s2[i] = Math.sin(2 * orientation[i]); }
  const bil = (a: Float32Array, fx: number, fy: number) => {
    const x0 = Math.min(w - 1, Math.max(0, Math.floor(fx))), y0 = Math.min(h - 1, Math.max(0, Math.floor(fy)));
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    return (a[y0 * w + x0] * (1 - tx) + a[y0 * w + x1] * tx) * (1 - ty) + (a[y1 * w + x0] * (1 - tx) + a[y1 * w + x1] * tx) * ty;
  };

  const n = p.levels.length;
  for (let y = 0; y < H; y++) {
    const fy = (y + 0.5) / ss - 0.5;
    for (let x = 0; x < W; x++) {
      const fx = (x + 0.5) / ss - 0.5;
      const L = bil(tone, fx, fy);
      if (L >= p.levels[0]) continue;
      const base = 0.5 * Math.atan2(bil(s2, fx, fy), bil(c2, fx, fy));
      let best = 0;
      for (let li = 0; li < n; li++) {
        const thr = p.levels[li];
        if (L >= thr) continue;
        const sp = (p.spacing[1] - (p.spacing[1] - p.spacing[0]) * (n > 1 ? li / (n - 1) : 0)) * ss;
        const ang = base + (li > 0 ? (li * Math.PI) / 3 : 0);
        const proj = (-Math.sin(ang) * x + Math.cos(ang) * y) / sp;
        const d = Math.abs(proj - Math.round(proj)) * sp;
        const dark = Math.min(1, Math.max(0, (thr - L) / Math.max(thr, 1e-3)));
        const wd = p.width * ss * (Math.min(1.4, dark * 2 + 0.35) + p.darkBoost * Math.pow(dark, 1.5));
        const a = Math.min(1, Math.max(0, wd / 2 - d + 0.5));
        if (a > best) best = a;
      }
      out[y * W + x] = best;
    }
  }
  if (ss === 1) return out;
  // Box downsample (area average) back to w*h.
  const res = new Float32Array(w * h);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) s += out[(y * ss + j) * W + x * ss + i];
      res[y * w + x] = s * inv;
    }
  }
  return res;
}
