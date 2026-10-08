/**
 * Module 8 — Form-aware directional hatching.
 * Uses structure tensor orientation for per-pixel dominant direction,
 * then renders tone-responsive hatching that follows form.
 *
 * Lower confidence module — treat as correct starting point, tune
 * spacing/sigma against real portrait stencils before shipping.
 */

import { gaussianBlur } from './pyramid';
import { createImageRNG } from '../classical/deterministic-rng.js';

// Iterative, coherence-weighted flow-vector smoothing pass (Edge Tangent
// Flow-style), harvested from stencil-engine.ts's smoothFlowField -- ported
// here 2026-09-05 to strengthen this module's orientation-field quality per
// classical-engine-audit.md items 1c/2d ("lower confidence module... tune
// spacing/sigma against real portrait stencils before shipping"). Unlike a
// single Gaussian blur on the tensor components (what this function did
// before), this propagates a coherent tangent direction across a region by
// averaging each pixel's neighbors, weighted by how anisotropic (coherent)
// each neighbor's own local structure is, and correcting for the 180-degree
// sign ambiguity tangent vectors have (a line has no inherent "forward"
// direction, so a naive average of opposing-but-equivalent vectors would
// cancel out to near-zero instead of reinforcing). Matches
// stencil-engine.ts's algorithm and variable roles exactly; renamed to this
// file's naming conventions.
function smoothOrientationField(
  cos: Float32Array, sin: Float32Array, coherence: Float32Array,
  w: number, h: number, iterations: number,
): { cos: Float32Array; sin: Float32Array } {
  const radius = 2;
  for (let it = 0; it < iterations; it++) {
    const nCos = new Float32Array(w * h);
    const nSin = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let sumX = 0, sumY = 0;
        const tx = cos[i], ty = sin[i];
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const yy = Math.min(h - 1, Math.max(0, y + dy));
            const j = yy * w + xx;
            const nx = cos[j], ny = sin[j];
            const dot = tx * nx + ty * ny;
            const sign = dot >= 0 ? 1 : -1;
            const weight = coherence[j] * sign;
            sumX += weight * nx;
            sumY += weight * ny;
          }
        }
        const len = Math.hypot(sumX, sumY) || 1;
        nCos[i] = sumX / len;
        nSin[i] = sumY / len;
      }
    }
    cos = nCos;
    sin = nSin;
  }
  return { cos, sin };
}

export function structureTensorOrientation(
  gx: Float32Array, gy: Float32Array, w: number, h: number, smoothSigma = 2, etfIterations = 3
): Float32Array {
  const n = w * h;
  const Jxx = new Float32Array(n), Jyy = new Float32Array(n), Jxy = new Float32Array(n);
  for (let i = 0; i < n; i++) { Jxx[i] = gx[i] * gx[i]; Jyy[i] = gy[i] * gy[i]; Jxy[i] = gx[i] * gy[i]; }
  const sJxx = gaussianBlur(Jxx, w, h, smoothSigma);
  const sJyy = gaussianBlur(Jyy, w, h, smoothSigma);
  const sJxy = gaussianBlur(Jxy, w, h, smoothSigma);

  // Tangent direction (cos, sin) + coherence (how anisotropic/reliable the
  // local direction estimate is, 0 = isotropic/no clear direction, 1 = a
  // strong, clean edge) per pixel, from the eigen-decomposition of the
  // smoothed structure tensor. Same formula stencil-engine.ts's
  // computeStructureTensor uses for its own flow field.
  const cos = new Float32Array(n), sin = new Float32Array(n), coherence = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = sJxx[i], b = sJxy[i], c = sJyy[i];
    const trace = a + c;
    const diff = Math.sqrt(Math.max(0, (a - c) * (a - c) + 4 * b * b));
    const l1 = (trace + diff) / 2;
    const l2 = (trace - diff) / 2;
    const tangentAngle = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2;
    cos[i] = Math.cos(tangentAngle);
    sin[i] = Math.sin(tangentAngle);
    coherence[i] = l1 + l2 > 1e-6 ? (l1 - l2) / (l1 + l2) : 0;
  }

  const smoothed = smoothOrientationField(cos, sin, coherence, w, h, etfIterations);

  const orientation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    orientation[i] = Math.atan2(smoothed.sin[i], smoothed.cos[i]);
  }
  return orientation;
}

export interface HatchParams {
  baseAngle: number;
  followForm: boolean;
  minSpacingPx: number;
  maxSpacingPx: number;
  lineWidthPx: number;
  crosshatch: boolean;
  mode?: 'streamline' | 'legacy';
  layers?: { maxTone: number; angleOffset: number }[];
  toneSmoothSigma?: number;
  taper?: boolean;
  minLenPx?: number;
  maxLenPx?: number;
  autoLevels?: boolean;
}

function renderLegacyHatchLayer(
  toneGray: Float32Array, orientation: Float32Array | null, w: number, h: number, params: HatchParams
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const passes = params.crosshatch ? [0, Math.PI / 2] : [0];

  for (const passOffset of passes) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const tone = toneGray[idx] / 255;
        if (tone > 0.92) continue;

        const angle = (params.followForm && orientation ? orientation[idx] : params.baseAngle) + passOffset;
        const perp = angle + Math.PI / 2;
        const proj = x * Math.cos(perp) + y * Math.sin(perp);

        const localSpacing = params.minSpacingPx + tone * (params.maxSpacingPx - params.minSpacingPx);
        const phase = ((proj % localSpacing) + localSpacing) % localSpacing;

        if (phase < params.lineWidthPx) out[idx] = 255;
      }
    }
  }
  return out;
}


/** Evenly spaced, binary, form-following strokes; legacy is kept verbatim for A/B. */
export function renderHatchLayer(
  toneGray: Float32Array, orientation: Float32Array | null, w: number, h: number, params: HatchParams
): Uint8ClampedArray {
  if (params.mode === 'legacy') return renderLegacyHatchLayer(toneGray, orientation, w, h, params);
  const out = new Uint8ClampedArray(w * h);
  if (w < 2 || h < 2) return out;
  const scale = w * h > 2e6 ? 2 : 1;
  const fw = Math.ceil(w / scale), fh = Math.ceil(h / scale);
  const source = new Float32Array(fw * fh);
  // Double-angle representation preserves the pi-periodic line direction when
  // downsampling and interpolating (ordinary angles wrap at +/-pi).
  const fieldX = new Float32Array(fw * fh), fieldY = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    let tone = 0, vx = 0, vy = 0, count = 0;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const xx = x * scale + dx, yy = y * scale + dy;
      if (xx >= w || yy >= h) continue;
      const i = yy * w + xx;
      const angle = params.followForm && orientation ? orientation[i] : params.baseAngle;
      tone += toneGray[i]; vx += Math.cos(2 * angle); vy += Math.sin(2 * angle); count++;
    }
    const i = y * fw + x;
    source[i] = tone / count; fieldX[i] = vx / count; fieldY[i] = vy / count;
  }
  const tones = gaussianBlur(source, fw, fh, (params.toneSmoothSigma ?? 2) / scale);
  let low = 0, high = 255;
  if (params.autoLevels ?? true) {
    const histogram = new Uint32Array(256);
    for (const t of tones) histogram[Math.max(0, Math.min(255, Math.round(t)))]++;
    let sum = 0, foundLow = false;
    for (let i = 0; i < 256; i++) {
      sum += histogram[i];
      if (!foundLow && sum >= tones.length * 0.02) { low = i; foundLow = true; }
      if (sum >= tones.length * 0.98) { high = i; break; }
    }
    // Flat fields have no exposure range: retain their real tone, not black.
    if (high - low < 1) { low = 0; high = 255; }
  }
  for (let i = 0; i < tones.length; i++) tones[i] = Math.max(0, Math.min(1, (tones[i] - low) / (high - low)));
  const lookup = (field: Float32Array, x: number, y: number): number => {
    const fx = Math.max(0, Math.min(fw - 1, (x - (scale - 1) / 2) / scale));
    const fy = Math.max(0, Math.min(fh - 1, (y - (scale - 1) / 2) / scale));
    const ix = Math.min(fw - 2, Math.floor(fx)), iy = Math.min(fh - 2, Math.floor(fy));
    const tx = fx - ix, ty = fy - iy, i = iy * fw + ix;
    return (field[i] * (1 - tx) + field[i + 1] * tx) * (1 - ty)
      + (field[i + fw] * (1 - tx) + field[i + fw + 1] * tx) * ty;
  };
  const minSp = Math.max(1, params.minSpacingPx), maxSp = Math.max(minSp, params.maxSpacingPx);
  const width = Math.max(0.5, params.lineWidthPx);
  const minLen = params.minLenPx ?? 4 * minSp, maxLen = params.maxLenPx ?? 40 * width;
  const step = 0.5;
  const rng = createImageRNG(w, h);
  const layers = params.layers ?? [
    { maxTone: 0.80, angleOffset: 0 },
    { maxTone: 0.55, angleOffset: Math.PI / 3 },
    { maxTone: 0.32, angleOffset: -Math.PI / 3 },
  ];
  // Same 3x3 area-majority convention as stipple.js drawDot. No gray pixels.
  const stamp = (cx: number, cy: number, radius: number, maxTone: number) => {
    const r2 = radius * radius;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.floor(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(w - 1, Math.floor(cx + radius)); x++) {
        if (out[y * w + x] || lookup(tones, x + 0.5, y + 0.5) >= maxTone) continue;
        let covered = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          const dx = x + (sx + 0.5) / 3 - cx, dy = y + (sy + 0.5) / 3 - cy;
          if (dx * dx + dy * dy <= r2) covered++;
        }
        if (covered >= 5) out[y * w + x] = 255;
      }
    }
  };
  for (const layer of (params.crosshatch ? layers : layers.slice(0, 1))) {
    if (layer.maxTone <= 0) continue;
    const spacing = (x: number, y: number) => {
      const t = Math.min(1, lookup(tones, x, y) / layer.maxTone);
      return minSp + (maxSp - minSp) * t * t * (3 - 2 * t);
    };
    const direction = (x: number, y: number, px: number, py: number): [number, number] => {
      const angle = (params.followForm && orientation
        ? Math.atan2(lookup(fieldY, x, y), lookup(fieldX, x, y)) / 2
        : params.baseAngle) + layer.angleOffset;
      let dx = Math.cos(angle), dy = Math.sin(angle);
      if (dx * px + dy * py < 0) { dx = -dx; dy = -dy; }
      return [dx, dy];
    };
    // Spatial hash stores centerline samples, independent per crosshatch layer.
    const cell = maxSp, cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    const grid: ([number, number][] | undefined)[] = new Array(cols * rows);
    const near = (x: number, y: number, distance: number) => {
      const ix = Math.floor(x / cell), iy = Math.floor(y / cell), r2 = distance * distance;
      for (let gy = Math.max(0, iy - 1); gy <= Math.min(rows - 1, iy + 1); gy++) {
        for (let gx = Math.max(0, ix - 1); gx <= Math.min(cols - 1, ix + 1); gx++) {
          const bucket = grid[gy * cols + gx];
          if (!bucket) continue;
          for (const p of bucket) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < r2) return true;
        }
      }
      return false;
    };
    const seeds: [number, number, number][] = [];
    for (let y = minSp / 2; y < h; y += minSp) for (let x = minSp / 2; x < w; x += minSp) {
      const sx = Math.max(0, Math.min(w - 0.001, x + rng.range(-0.4, 0.4) * minSp));
      const sy = Math.max(0, Math.min(h - 0.001, y + rng.range(-0.4, 0.4) * minSp));
      const t = lookup(tones, sx, sy);
      if (t < layer.maxTone) seeds.push([sx, sy, t]);
    }
    seeds.sort((a, b) => a[2] - b[2]);
    // Jobard-Lefer: accepted lines seed neighbors one dsep away along normals.
    // Exhaust those evenly spaced neighbors before the next jittered fallback.
    const neighbors: [number, number][] = [];
    let seedIndex = 0, neighborIndex = 0;
    while (seedIndex < seeds.length || neighborIndex < neighbors.length) {
      const seed = neighborIndex < neighbors.length ? neighbors[neighborIndex++] : seeds[seedIndex++];
      const [sx, sy] = seed;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h || lookup(tones, sx, sy) >= layer.maxTone) continue;
      if (near(sx, sy, spacing(sx, sy) * 0.95)) continue;
      const trace = (sign: number): [number, number][] => {
        const points: [number, number][] = [];
        let x = sx, y = sy;
        let [px, py] = direction(x, y, 0, 0); px *= sign; py *= sign;
        for (let length = step; length <= maxLen / 2; length += step) {
          const [dx, dy] = direction(x, y, px, py);
          const [mx, my] = direction(x + dx * step / 2, y + dy * step / 2, dx, dy);
          const nx = x + mx * step, ny = y + my * step;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || lookup(tones, nx, ny) >= layer.maxTone) break;
          if (near(nx, ny, spacing(nx, ny) * 0.5)) break;
          // Prevent a closed field orbit from retracing this same stroke.
          if (length > 6 && Math.hypot(nx - sx, ny - sy) < step * 2) break;
          points.push([nx, ny]); x = nx; y = ny; px = mx; py = my;
        }
        return points;
      };
      const points = [...trace(-1).reverse(), [sx, sy] as [number, number], ...trace(1)];
      const length = (points.length - 1) * step;
      if (length < minLen) continue;
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        const end = Math.min(i, points.length - 1 - i) / Math.max(1, (points.length - 1) * 0.15);
        const strokeWidth = (params.taper ?? true) ? 0.5 + (width - 0.5) * Math.min(1, end) : width;
        stamp(x, y, strokeWidth / 2, layer.maxTone);
        if (i % 3 === 0 || i === points.length - 1) {
          const index = Math.floor(y / cell) * cols + Math.floor(x / cell);
          const bucket = grid[index] ?? (grid[index] = []);
          bucket.push([x, y]);
        }
        if (i % Math.max(1, Math.round(maxSp / step)) === 0) {
          const [dx, dy] = direction(x, y, 0, 0), d = spacing(x, y);
          neighbors.push([x - dy * d, y + dx * d], [x + dy * d, y - dx * d]);
        }
      }
    }
  }
  return out;
}
