/**
 * classical-v2 / filters
 * Float-domain building blocks (0..1 luminance in Float32Array, row-major).
 * Real separable Gaussian (true sigma, not a rounded box radius) and a
 * range-aware bilateral filter. Pure functions, no DOM, worker-safe.
 */

export interface Gray {
  data: Float32Array; // 0..1
  w: number;
  h: number;
}

export function makeGray(w: number, h: number): Gray {
  return { data: new Float32Array(w * h), w, h };
}

/** Rec.601 luma from RGBA bytes -> 0..1 */
export function grayFromRGBA(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const g = makeGray(w, h);
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    g.data[p] = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) / 255;
  }
  return g;
}

function gaussKernel(sigma: number): Float32Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

/** Separable Gaussian blur with edge clamping. Works on any w*h Float32Array. */
export function gaussian(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0.01) return src.slice();
  const k = gaussKernel(sigma);
  const r = (k.length - 1) >> 1;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        s += src[row + xx] * k[i + r];
      }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        s += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

/**
 * Bilateral filter. radius = spatial window half-size, sigmaS spatial sigma (px),
 * sigmaR range sigma in 0..1 luminance units (~0.11 == 28/255). Smooths flat
 * areas, keeps hard edges. Range weights come from a LUT for speed.
 */
export function bilateral(
  src: Float32Array, w: number, h: number,
  radius = 4, sigmaS = 5, sigmaR = 0.11,
): Float32Array {
  const out = new Float32Array(w * h);
  const side = 2 * radius + 1;
  const spatial = new Float32Array(side * side);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      spatial[(dy + radius) * side + dx + radius] = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS));
    }
  }
  const LUT_N = 1024;
  const lut = new Float32Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) {
    const d = i / LUT_N; // |diff| in 0..1
    lut[i] = Math.exp(-(d * d) / (2 * sigmaR * sigmaR));
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = src[y * w + x];
      let wsum = 0, vsum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx;
          const v = src[yy * w + xx];
          const d = Math.abs(v - c);
          const wt = spatial[(dy + radius) * side + dx + radius] * lut[(d * LUT_N) | 0];
          wsum += wt;
          vsum += wt * v;
        }
      }
      out[y * w + x] = wsum > 0 ? vsum / wsum : c;
    }
  }
  return out;
}
