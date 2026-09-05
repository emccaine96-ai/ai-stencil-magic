/**
 * Module 8 — Form-aware directional hatching.
 * Uses structure tensor orientation for per-pixel dominant direction,
 * then renders tone-responsive hatching that follows form.
 *
 * Lower confidence module — treat as correct starting point, tune
 * spacing/sigma against real portrait stencils before shipping.
 */

import { gaussianBlur } from './pyramid';

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
}

export function renderHatchLayer(
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
