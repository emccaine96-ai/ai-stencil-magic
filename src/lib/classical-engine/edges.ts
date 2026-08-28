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
  opts: { primaryPct?: number; formPct?: number; texturePct?: number } = {}
): ClassifiedEdges {
  const { primaryPct = 0.9, formPct = 0.75, texturePct = 0.5 } = opts;
  const n = w * h;
  const combined = new Float32Array(n);
  for (let i = 0; i < n; i++) combined[i] = lowMag[i] * 0.5 + midMag[i] * 0.35 + highMag[i] * 0.15;

  const sorted = Float32Array.from(combined).sort();
  const pct = (p: number) => sorted[Math.floor(p * (n - 1))];
  const tPrimary = pct(primaryPct), tForm = pct(formPct), tTexture = pct(texturePct);

  const classMap = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
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
