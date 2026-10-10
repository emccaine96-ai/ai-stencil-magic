/**
 * classical-v2 / xdog
 * Extended Difference of Gaussians (Winnemoeller) with a soft tanh ramp.
 *   D = (1+p)*G(sigma) - p*G(k*sigma)
 *   T = 1 if D >= epsilon, else 1 + tanh(phi * (D - epsilon))
 * Returns soft INK in 0..1 (1 = full ink), not a 1-bit mask.
 */
import { gaussian } from "./filters";

export interface XDoGParams {
  sigma: number;   // detail scale (px)
  k: number;       // sigma ratio, ~1.6
  p: number;       // sharpening strength
  epsilon: number; // edge sensitivity (threshold)
  phi: number;     // soft-edge steepness
  gamma: number;   // output sharpness curve; 1 = linear
}

// p=19 (not the textbook 18): calibrated so this float-domain port matches the tuned OpenCV prototype
// within ~1% on contour coverage across the 4 reference photos.
export const DEFAULT_XDOG: XDoGParams = { sigma: 1.2, k: 1.6, p: 19, epsilon: 0, phi: 10, gamma: 1 };

/** Local-contrast normalised response: boosts faint edges in quiet regions (never damps busy ones). */
export function xdogInk(
  tone: Float32Array, w: number, h: number,
  params: Partial<XDoGParams> = {}, localAmount = 0.5, win = 25,
): Float32Array {
  const q = { ...DEFAULT_XDOG, ...params };
  const g1 = gaussian(tone, w, h, q.sigma);
  const g2 = gaussian(tone, w, h, q.sigma * q.k);
  const n = w * h;
  const D = new Float32Array(n);
  for (let i = 0; i < n; i++) D[i] = (1 + q.p) * g1[i] - q.p * g2[i];

  let gainField: Float32Array | null = null;
  if (localAmount > 0) {
    const sq = new Float32Array(n);
    for (let i = 0; i < n; i++) sq[i] = D[i] * D[i];
    const e = gaussian(sq, w, h, win / 3);
    for (let i = 0; i < n; i++) e[i] = Math.sqrt(e[i]) + 1e-3;
    const sorted = Float32Array.from(e).sort();
    const ref = sorted[Math.floor(n * 0.75)];
    gainField = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const gain = Math.min(4, Math.max(1, ref / e[i]));
      gainField[i] = 1 + (gain - 1) * localAmount;
    }
  }

  const ink = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = gainField ? D[i] * gainField[i] : D[i];
    const t = d >= q.epsilon ? 1 : 1 + Math.tanh(q.phi * (d - q.epsilon));
    let v = 1 - Math.min(1, Math.max(0, t));
    if (q.gamma !== 1) v = Math.pow(v, q.gamma);
    ink[i] = v;
  }
  return ink;
}
