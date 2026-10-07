/**
 * Streamline hatching (Standard engine, useFormHatching).
 *
 * Replaces the per-pixel `proj % spacing` test for the Standard engine's hatch layer.
 * That test inks a pixel if it lies near a stripe computed from the LOCAL angle and
 * spacing; because both vary pixel to pixel, a stripe does not stay connected and a
 * typical photo yields ~15,000 components, ~94% under 12 px (median 1 px).
 *
 * Here each hatch line is traced as a streamline through the orientation field, so a
 * stroke is connected by construction and runs along the form. Seeds sit on a grid in a
 * fixed pseudo-random order (deterministic: same input => same output). Spacing still
 * tracks tone: lighter areas get wider gaps (minSp..maxSp), and no stroke is drawn
 * above `toneCut` (paper).
 *
 * A stroke stops at: frame edge, light tone, or when it comes closer than
 * `sepFrac * localSpacing` to an earlier stroke. The occupancy test uses stamped pixels
 * (not distance transforms) so cost is O(strokeLength * separationRadius^2).
 */
export interface StreamlineParams {
  minSp: number;       // spacing in the darkest tone, px
  maxSp: number;       // spacing just below `toneCut`, px
  step: number;        // integration step, px
  maxLen: number;      // longest stroke, px
  toneCut: number;     // 0..1; do not hatch lighter than this
  sepFrac: number;     // stroke separation as a fraction of local spacing
  minLen: number;      // drop strokes shorter than this, px
}

export const DEFAULT_STREAMLINE: StreamlineParams = {
  minSp: 3, maxSp: 12, step: 0.7, maxLen: 90, toneCut: 0.92, sepFrac: 0.5, minLen: 8,
};

export function streamlineHatch(
  tone: Float32Array, ori: Float32Array, w: number, h: number,
  params: Partial<StreamlineParams> = {},
): Uint8ClampedArray {
  const { minSp, maxSp, step, maxLen, toneCut, sepFrac, minLen } = { ...DEFAULT_STREAMLINE, ...params };
  const n = w * h;
  const out = new Uint8ClampedArray(n);
  const cx = new Float32Array(n), cy = new Float32Array(n);
  for (let i = 0; i < n; i++) { cx[i] = Math.cos(ori[i]); cy[i] = Math.sin(ori[i]); }

  const toneAt = (x: number, y: number) =>
    tone[Math.min(h - 1, Math.max(0, y | 0)) * w + Math.min(w - 1, Math.max(0, x | 0))] / 255;
  const spAt = (x: number, y: number) => minSp + toneAt(x, y) * (maxSp - minSp);

  // Bilinear field lookup. Orientation is a line (θ ≡ θ+π), so each corner vector is
  // flipped to agree with the incoming direction before blending.
  const dirAt = (x: number, y: number, px: number, py: number): [number, number] => {
    const xi = Math.min(w - 2, Math.max(0, Math.floor(x)));
    const yi = Math.min(h - 2, Math.max(0, Math.floor(y)));
    const fx = x - xi, fy = y - yi;
    let sx = 0, sy = 0;
    const corners: [number, number, number][] = [
      [0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy],
    ];
    for (const [dx, dy, wt] of corners) {
      const j = (yi + dy) * w + xi + dx;
      let vx = cx[j], vy = cy[j];
      if (vx * px + vy * py < 0) { vx = -vx; vy = -vy; }
      sx += wt * vx; sy += wt * vy;
    }
    const l = Math.hypot(sx, sy) || 1;
    return [sx / l, sy / l];
  };

  const near = (x: number, y: number, r: number): boolean => {
    const xi = x | 0, yi = y | 0, R = Math.ceil(r), r2 = r * r;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const xx = xi + i, yy = yi + j;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (out[yy * w + xx] && i * i + j * j <= r2) return true;
    }
    return false;
  };

  // Seed order: grid at minSp, shuffled with a fixed-seed LCG so early strokes don't bias a corner.
  const order: number[] = [];
  for (let y = 0; y < h; y += minSp) for (let x = 0; x < w; x += minSp) order.push(y * w + x);
  let s = 12345;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }

  const maxSteps = Math.floor(maxLen / step);
  for (const seed of order) {
    const sx = seed % w, sy = (seed / w) | 0;
    if (toneAt(sx, sy) > toneCut) continue;
    if (near(sx, sy, spAt(sx, sy) * sepFrac)) continue;

    const pts: [number, number][] = [];
    for (const sgn of [1, -1]) {
      let x = sx, y = sy;
      let px = cx[seed] * sgn, py = cy[seed] * sgn;
      const side: [number, number][] = [];
      for (let k = 0; k < maxSteps; k++) {
        const [dx, dy] = dirAt(x, y, px, py);
        x += dx * step; y += dy * step; px = dx; py = dy;
        if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) break;
        if (toneAt(x, y) > toneCut) break;
        if (k > 2 && near(x, y, spAt(x, y) * sepFrac)) break;
        side.push([x, y]);
      }
      if (sgn === 1) pts.push(...side.reverse());
      else { pts.push([sx, sy]); pts.push(...side); }
    }
    if (pts.length * step < minLen) continue;

    for (let k = 0; k < pts.length; k++) {
      const [x, y] = pts[k];
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && yi >= 0 && xi < w && yi < h) out[yi * w + xi] = 255;
      if (k > 0) { // bridge consecutive samples so the stroke is 8-connected
        const [x0, y0] = pts[k - 1];
        const m = Math.ceil(Math.max(Math.abs(x - x0), Math.abs(y - y0)) * 2);
        for (let t = 0; t <= m; t++) {
          const xx = Math.round(x0 + (x - x0) * t / m), yy = Math.round(y0 + (y - y0) * t / m);
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 255;
        }
      }
    }
  }
  return out;
}
