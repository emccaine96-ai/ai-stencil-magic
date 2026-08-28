/**
 * Module 2 — Multi-scale frequency decomposition.
 * Separates structure vs. form vs. detail using difference of Gaussians.
 */

function gaussianKernel1D(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function convolveSeparable(src: Float32Array, w: number, h: number, kernel: Float32Array): Float32Array {
  const radius = (kernel.length - 1) / 2;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += src[y * w + xx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[yy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

export function gaussianBlur(gray: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return gray.slice();
  return convolveSeparable(gray, w, h, gaussianKernel1D(sigma));
}

export interface FrequencyBands {
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
}

export function buildFrequencyBands(
  gray: Float32Array, w: number, h: number,
  sigmas: { low: number; mid: number; high: number } = { low: 8, mid: 3, high: 1 }
): FrequencyBands {
  const blurLow = gaussianBlur(gray, w, h, sigmas.low);
  const blurMid = gaussianBlur(gray, w, h, sigmas.mid);
  const blurHigh = gaussianBlur(gray, w, h, sigmas.high);

  const mid = new Float32Array(w * h);
  const high = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mid[i] = blurMid[i] - blurLow[i];
    high[i] = blurHigh[i] - blurMid[i];
  }
  return { low: blurLow, mid, high };
}
