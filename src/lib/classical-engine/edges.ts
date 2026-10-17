/**
 * Module 4 — Multi-detector edge system with classification.
 * Runs Sobel on each frequency band, then classifies edges as
 * primary contour, form edge, texture edge, or micro detail.
 */

export interface EdgeField {
  magnitude: Float32Array;
  direction: Float32Array;
}

const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

export function sobel(gray: Float32Array, w: number, h: number): EdgeField {
  const magnitude = new Float32Array(w * h);
  const direction = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0, k = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const v = gray[(y + j) * w + (x + i)];
          gx += v * SOBEL_X[k]; gy += v * SOBEL_Y[k]; k++;
        }
      }
      const idx = y * w + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, direction };
}

export type EdgeClassId = 0 | 1 | 2 | 3 | 4 | 5;

export interface ClassifiedEdges {
  classMap: Uint8Array;
  combinedMagnitude: Float32Array;
}

export function classifyEdges(
  lowMag: Float32Array, midMag: Float32Array, highMag: Float32Array,
  w: number, h: number,
  direction: Float32Array,
  opts: { primaryPct?: number; formPct?: number; texturePct?: number } = {}
): ClassifiedEdges {
  const { primaryPct = 0.97, formPct = 0.93, texturePct = 0.85 } = opts;
  const n = w * h;
  const combinedRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) combinedRaw[i] = lowMag[i] * 0.5 + midMag[i] * 0.35 + highMag[i] * 0.15;

  // Non-maximum suppression: thin the combined edge response to a single-pixel
  // ridge along the local gradient direction, so real edges become thin lines
  // instead of wide bands that render as solid merged blobs.
  const combined = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = combinedRaw[i];
      if (m === 0) continue;
      let angle = (direction[i] * 180) / Math.PI;
      if (angle < 0) angle += 180;
      let n1: number, n2: number;
      if (angle < 22.5 || angle >= 157.5) {
        n1 = combinedRaw[i - 1]; n2 = combinedRaw[i + 1];
      } else if (angle < 67.5) {
        n1 = combinedRaw[i - w + 1]; n2 = combinedRaw[i + w - 1];
      } else if (angle < 112.5) {
        n1 = combinedRaw[i - w]; n2 = combinedRaw[i + w];
      } else {
        n1 = combinedRaw[i - w - 1]; n2 = combinedRaw[i + w + 1];
      }
      combined[i] = m >= n1 && m >= n2 ? m : 0;
    }
  }

  // Percentiles computed only over the already-thinned nonzero pixels — most
  // pixels are now legitimately zero after NMS, and including them would push
  // the thresholds back toward being too permissive.
  const sorted = Float32Array.from(combined).sort();
  let firstNonZero = 0;
  while (firstNonZero < n && sorted[firstNonZero] === 0) firstNonZero++;
  const pct = (p: number) => {
    if (firstNonZero >= n) return Infinity;
    const idx = firstNonZero + Math.floor(p * Math.max(0, n - 1 - firstNonZero));
    return sorted[Math.min(n - 1, idx)];
  };
  const tPrimary = pct(primaryPct), tForm = pct(formPct), tTexture = pct(texturePct);

  const classMap = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (combined[i] === 0) { classMap[i] = 0; continue; }
    const lowStrong = lowMag[i] > tForm;
    const midStrong = midMag[i] > tForm;
    const highStrong = highMag[i] > tTexture;

    if (combined[i] > tPrimary && lowStrong) classMap[i] = 1;
    else if (midStrong) classMap[i] = 2;
    else if (highStrong && !lowStrong) classMap[i] = 4;
    else if (combined[i] > tTexture) classMap[i] = 5;
    else classMap[i] = 0;
  }
  return { classMap, combinedMagnitude: combined };
}
