// Otsu's method — automatic global threshold selection via between-class
// variance maximization. Grayscale-only, no parameters to tune (that's the
// point of Otsu vs. the existing fixed/adaptive thresholds). Shared by both
// stencil engines so there's one implementation to maintain, not two.

/** Computes the optimal threshold (0-255) for a grayscale histogram using Otsu's method. */
export function otsuThreshold(gray: ArrayLike<number>): number {
  const hist = new Array(256).fill(0);
  const total = gray.length;
  for (let i = 0; i < total; i++) {
    const v = Math.max(0, Math.min(255, gray[i] | 0));
    hist[v]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0,
    wB = 0,
    maxVar = 0,
    threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Applies Otsu's method to an ImageData, producing a binary black/white image. */
export function applyOtsuThreshold(img: ImageData): ImageData {
  const { width, height, data } = img;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const t = otsuThreshold(gray);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] > t ? 255 : 0;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = v;
    out[o + 3] = 255;
  }
  return new ImageData(out, width, height);
}
