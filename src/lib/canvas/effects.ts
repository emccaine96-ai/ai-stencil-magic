/**
 * Pro Effects Engine — in-place ImageData operations.
 * All functions mutate and return the same ImageData for chaining.
 *
 * Included: gaussianBlur, boxBlur, sharpen, unsharpMask, pixelate,
 * vignette, noise, glow (bloom), chromaticAberration, edgeDetect.
 */

export type EffectFn = (img: ImageData, ...args: any[]) => ImageData;

/* ---------- helpers ---------- */

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function cloneData(img: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

/* ---------- Box blur (separable, fast) ---------- */

export function boxBlur(img: ImageData, radius = 3): ImageData {
  if (radius < 1) return img;
  const { width: w, height: h, data } = img;
  const tmp = new Uint8ClampedArray(data.length);
  const out = data;
  const r = radius | 0;
  const size = r * 2 + 1;

  // horizontal
  for (let y = 0; y < h; y++) {
    let rs = 0, gs = 0, bs = 0, as = 0;
    const row = y * w * 4;
    for (let k = -r; k <= r; k++) {
      const xi = Math.max(0, Math.min(w - 1, k));
      const i = row + xi * 4;
      rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; as += data[i + 3];
    }
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      tmp[i] = rs / size; tmp[i + 1] = gs / size; tmp[i + 2] = bs / size; tmp[i + 3] = as / size;
      const xOut = Math.max(0, Math.min(w - 1, x - r));
      const xIn = Math.max(0, Math.min(w - 1, x + r + 1));
      const iO = row + xOut * 4, iI = row + xIn * 4;
      rs += data[iI] - data[iO];
      gs += data[iI + 1] - data[iO + 1];
      bs += data[iI + 2] - data[iO + 2];
      as += data[iI + 3] - data[iO + 3];
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    let rs = 0, gs = 0, bs = 0, as = 0;
    for (let k = -r; k <= r; k++) {
      const yi = Math.max(0, Math.min(h - 1, k));
      const i = (yi * w + x) * 4;
      rs += tmp[i]; gs += tmp[i + 1]; bs += tmp[i + 2]; as += tmp[i + 3];
    }
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      out[i] = rs / size; out[i + 1] = gs / size; out[i + 2] = bs / size; out[i + 3] = as / size;
      const yO = Math.max(0, Math.min(h - 1, y - r));
      const yI = Math.max(0, Math.min(h - 1, y + r + 1));
      const iO = (yO * w + x) * 4, iI = (yI * w + x) * 4;
      rs += tmp[iI] - tmp[iO];
      gs += tmp[iI + 1] - tmp[iO + 1];
      bs += tmp[iI + 2] - tmp[iO + 2];
      as += tmp[iI + 3] - tmp[iO + 3];
    }
  }
  return img;
}

/**
 * Gaussian blur via 3-pass box-blur approximation
 * (Wells 1986 — nearly indistinguishable from true gaussian at r>=2).
 */
export function gaussianBlur(img: ImageData, radius = 4): ImageData {
  if (radius < 1) return img;
  const r = Math.max(1, Math.round(radius / Math.sqrt(3)));
  boxBlur(img, r);
  boxBlur(img, r);
  boxBlur(img, r);
  return img;
}

/* ---------- Convolution helpers ---------- */

function convolve3x3(img: ImageData, k: number[], divisor = 1, offset = 0): ImageData {
  const { width: w, height: h, data } = img;
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let r = 0, g = 0, b = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const i = ((y + ky) * w + (x + kx)) * 4;
          const kv = k[ki++];
          r += src[i] * kv; g += src[i + 1] * kv; b += src[i + 2] * kv;
        }
      }
      const o = (y * w + x) * 4;
      data[o] = clamp8(r / divisor + offset);
      data[o + 1] = clamp8(g / divisor + offset);
      data[o + 2] = clamp8(b / divisor + offset);
    }
  }
  return img;
}

/* ---------- Sharpen ---------- */

export function sharpen(img: ImageData, amount = 1): ImageData {
  const a = Math.max(0, amount);
  const c = 1 + 4 * a;
  return convolve3x3(img, [0, -a, 0, -a, c, -a, 0, -a, 0], 1, 0);
}

/** Unsharp mask — sharpen against a blurred copy for softer, higher-quality edges. */
export function unsharpMask(img: ImageData, radius = 2, amount = 1, threshold = 0): ImageData {
  const blurred = gaussianBlur(cloneData(img), radius);
  const { data } = img;
  const b = blurred.data;
  const t = threshold;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = data[i + c] - b[i + c];
      if (Math.abs(diff) > t) {
        data[i + c] = clamp8(data[i + c] + diff * amount);
      }
    }
  }
  return img;
}

/* ---------- Edge detect (Sobel) ---------- */

export function edgeDetect(img: ImageData): ImageData {
  const { width: w, height: h, data } = img;
  const src = new Uint8ClampedArray(data);
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] + gray[i - w + 1]
        - 2 * gray[i - 1] + 2 * gray[i + 1]
        - gray[i + w - 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
        + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      const m = clamp8(Math.hypot(gx, gy));
      const o = i * 4;
      data[o] = data[o + 1] = data[o + 2] = m;
      data[o + 3] = 255;
    }
  }
  return img;
}

/* ---------- Pixelate ---------- */

export function pixelate(img: ImageData, size = 8): ImageData {
  const { width: w, height: h, data } = img;
  const s = Math.max(2, size | 0);
  for (let by = 0; by < h; by += s) {
    for (let bx = 0; bx < w; bx += s) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const yEnd = Math.min(h, by + s), xEnd = Math.min(w, bx + s);
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const i = (y * w + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
        }
      }
      r /= n; g /= n; b /= n; a /= n;
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const i = (y * w + x) * 4;
          data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
        }
      }
    }
  }
  return img;
}

/* ---------- Vignette ---------- */

export function vignette(
  img: ImageData,
  strength = 0.6,      // 0..1
  radius = 0.75,       // 0..1 (relative to half-diagonal)
  softness = 0.5,      // 0..1
): ImageData {
  const { width: w, height: h, data } = img;
  const cx = w / 2, cy = h / 2;
  const maxD = Math.hypot(cx, cy);
  const inner = radius * maxD;
  const outer = maxD;
  const range = Math.max(1, (outer - inner) * (1 - softness * 0.5));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const t = Math.min(1, Math.max(0, (d - inner) / range));
      const f = 1 - t * strength;
      const i = (y * w + x) * 4;
      data[i] = data[i] * f;
      data[i + 1] = data[i + 1] * f;
      data[i + 2] = data[i + 2] * f;
    }
  }
  return img;
}

/* ---------- Noise ---------- */

export function noise(img: ImageData, amount = 20, monochrome = true): ImageData {
  const { data } = img;
  const a = Math.max(0, amount);
  for (let i = 0; i < data.length; i += 4) {
    if (monochrome) {
      const n = (Math.random() - 0.5) * 2 * a;
      data[i] = clamp8(data[i] + n);
      data[i + 1] = clamp8(data[i + 1] + n);
      data[i + 2] = clamp8(data[i + 2] + n);
    } else {
      data[i] = clamp8(data[i] + (Math.random() - 0.5) * 2 * a);
      data[i + 1] = clamp8(data[i + 1] + (Math.random() - 0.5) * 2 * a);
      data[i + 2] = clamp8(data[i + 2] + (Math.random() - 0.5) * 2 * a);
    }
  }
  return img;
}

/* ---------- Glow (bloom) ---------- */

/**
 * Additive bloom — blurred copy screen-blended onto the original.
 * Great for neon glow, dreamy portraits, tattoo stencil emphasis.
 */
export function glow(img: ImageData, radius = 12, strength = 0.6, threshold = 128): ImageData {
  const bright = cloneData(img);
  const bd = bright.data;
  // extract highlights
  for (let i = 0; i < bd.length; i += 4) {
    const luma = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
    if (luma < threshold) {
      bd[i] = bd[i + 1] = bd[i + 2] = 0;
    }
  }
  gaussianBlur(bright, radius);
  const dst = img.data;
  const s = Math.max(0, Math.min(2, strength));
  for (let i = 0; i < dst.length; i += 4) {
    // screen blend: 1 - (1-a)(1-b)
    const br = bd[i] * s, bg = bd[i + 1] * s, bb = bd[i + 2] * s;
    dst[i] = clamp8(255 - ((255 - dst[i]) * (255 - br)) / 255);
    dst[i + 1] = clamp8(255 - ((255 - dst[i + 1]) * (255 - bg)) / 255);
    dst[i + 2] = clamp8(255 - ((255 - dst[i + 2]) * (255 - bb)) / 255);
  }
  return img;
}

/* ---------- Chromatic aberration ---------- */

export function chromaticAberration(img: ImageData, offset = 6): ImageData {
  const { width: w, height: h, data } = img;
  const src = new Uint8ClampedArray(data);
  const o = offset | 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rx = Math.max(0, Math.min(w - 1, x - o));
      const bx = Math.max(0, Math.min(w - 1, x + o));
      const ri = (y * w + rx) * 4;
      const bi = (y * w + bx) * 4;
      data[i] = src[ri];         // R shifted left
      data[i + 1] = src[i + 1];  // G untouched
      data[i + 2] = src[bi + 2]; // B shifted right
    }
  }
  return img;
}

/* ---------- Registry (for UI wiring) ---------- */

export const EFFECTS = {
  gaussianBlur, boxBlur, sharpen, unsharpMask, edgeDetect,
  pixelate, vignette, noise, glow, chromaticAberration,
} as const;

export type EffectName = keyof typeof EFFECTS;
