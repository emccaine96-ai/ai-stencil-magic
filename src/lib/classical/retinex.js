/**
 * Multi-Scale Retinex (Jobson/Rahman/Woodell) — illumination normalization.
 * Runs before CLAHE. Separates lighting from surface reflectance so uneven
 * source lighting doesn't get baked into the final line/tone decisions.
 */

function gaussianBlur1D(src, w, h, sigma) {
  const radius = Math.max(1, Math.round(sigma * 2));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(w * h);
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
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
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

/**
 * Applies Multi-Scale Retinex to a grayscale ImageData (expects R=G=B, as
 * produced by toGrayscale() earlier in the pipeline). Returns a new
 * grayscale ImageData with illumination normalized.
 */
export function applyMultiScaleRetinex(imageData, scales = [15, 80, 250]) {
  const { width: w, height: h, data } = imageData;
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = Math.max(1, data[i]);

  const weight = 1 / scales.length;
  const msr = new Float32Array(n);
  for (const sigma of scales) {
    const blurred = gaussianBlur1D(gray, w, h, sigma);
    for (let i = 0; i < n; i++) {
      msr[i] += weight * (Math.log(gray[i]) - Math.log(Math.max(1, blurred[i])));
    }
  }

  // Percentile stretch back to 0-255 so a few outlier pixels don't crush
  // the whole normalization range.
  const sorted = Float32Array.from(msr).sort();
  const lo = sorted[Math.floor(n * 0.02)];
  const hi = sorted[Math.floor(n * 0.98)];
  const range = Math.max(1e-6, hi - lo);

  const out = new ImageData(w, h);
  const od = out.data;
  for (let i = 0, p = 0; i < od.length; i += 4, p++) {
    const v = Math.max(0, Math.min(255, ((msr[p] - lo) / range) * 255));
    od[i] = od[i + 1] = od[i + 2] = v;
    od[i + 3] = 255;
  }
  return out;
}
