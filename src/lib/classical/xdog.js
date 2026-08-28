/**
 * XDoG (eXtended Difference of Gaussians) + S-curve contrast/gamma.
 * Extracted from ClassicalProEngine for modularity.
 */
import { fastBlur } from './smoothing.js';
import { adaptiveThreshold } from './threshold.js';

export function applySCurveAndGamma(imageData, contrast = 0.72, gamma = 0.78) {
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;
  const lut = new Uint8ClampedArray(256);

  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    if (v < 0.5) {
      v = 0.5 * Math.pow(2 * v, 1 + contrast * 2.2);
    } else {
      v = 1 - 0.5 * Math.pow(2 * (1 - v), 1 + contrast * 2.2);
    }
    v = Math.pow(Math.max(0, Math.min(1, v)), gamma);
    lut[i] = (v * 255 + 0.5) | 0;
  }

  for (let i = 0; i < data.length; i += 4) {
    const v = lut[data[i]];
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }
  return out;
}

export function applyXDoG(imageData, detailRadius, edgeSensitivity, shadowBlock) {
  const sigma1 = detailRadius;
  const sigma2 = sigma1 * 2.0;

  const g1 = fastBlur(imageData, sigma1);
  const g2 = fastBlur(imageData, sigma2);

  const { width, height } = imageData;
  const out = new ImageData(width, height);
  const d1 = g1.data, d2 = g2.data, o = out.data;

  for (let i = 0; i < d1.length; i += 4) {
    const val = d1[i] - edgeSensitivity * d2[i];
    let v = Math.max(0, Math.min(255, val + 128));
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }

  return adaptiveThreshold(out, shadowBlock);
}
