/**
 * Module 8 — Form-aware directional hatching.
 * Uses structure tensor orientation for per-pixel dominant direction,
 * then renders tone-responsive hatching that follows form.
 *
 * Lower confidence module — treat as correct starting point, tune
 * spacing/sigma against real portrait stencils before shipping.
 */

import { gaussianBlur } from './pyramid';

export function structureTensorOrientation(
  gx: Float32Array, gy: Float32Array, w: number, h: number, smoothSigma = 2
): Float32Array {
  const n = w * h;
  const Jxx = new Float32Array(n), Jyy = new Float32Array(n), Jxy = new Float32Array(n);
  for (let i = 0; i < n; i++) { Jxx[i] = gx[i] * gx[i]; Jyy[i] = gy[i] * gy[i]; Jxy[i] = gx[i] * gy[i]; }
  const sJxx = gaussianBlur(Jxx, w, h, smoothSigma);
  const sJyy = gaussianBlur(Jyy, w, h, smoothSigma);
  const sJxy = gaussianBlur(Jxy, w, h, smoothSigma);

  const orientation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    orientation[i] = 0.5 * Math.atan2(2 * sJxy[i], sJxx[i] - sJyy[i]) + Math.PI / 2;
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
