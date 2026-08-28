/**
 * Module 3 — Otsu thresholding.
 * Standard between-class variance maximization. Fills the gap where
 * the codebase had an "otsu" EdgeMode but no dedicated implementation.
 */

export function otsuThreshold(gray: Float32Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++;
  }
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  return threshold;
}

export function applyThreshold(gray: Float32Array, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = gray[i] < threshold ? 0 : 255;
  return out;
}
