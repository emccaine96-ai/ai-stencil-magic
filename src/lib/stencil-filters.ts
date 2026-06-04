/**
 * Phase 6 Wave 5 — Advanced tattoo-stencil filter library. NOT the AI
 * stencil generation page — these are post-processing filters applied to
 * brushed/painted layers in the studio.
 *
 * All filters operate on ImageData in-place for max throughput.
 */

export type FilterFn = (img: ImageData, params?: Record<string, number>) => ImageData;

const luma = (r: number, g: number, b: number) => 0.2989 * r + 0.587 * g + 0.114 * b;

/** 1-bit thermal stencil — pure black/white, no anti-aliasing. */
export const thermalStencil: FilterFn = (img, p = { threshold: 128 }) => {
  const t = p.threshold ?? 128;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = luma(img.data[i], img.data[i+1], img.data[i+2]) < t ? 0 : 255;
    img.data[i] = img.data[i+1] = img.data[i+2] = v;
    img.data[i+3] = v < 255 ? 255 : 0;
  }
  return img;
};

/** Floyd-Steinberg dithered halftone — preserves gradients in 1-bit. */
export const halftoneDither: FilterFn = (img) => {
  const W = img.width, H = img.height;
  const g = new Float32Array(W * H);
  for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
    g[j] = luma(img.data[i], img.data[i+1], img.data[i+2]);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const old = g[k];
      const nw = old < 128 ? 0 : 255;
      g[k] = nw;
      const err = old - nw;
      if (x + 1 < W) g[k + 1] += err * 7 / 16;
      if (y + 1 < H) {
        if (x > 0) g[k + W - 1] += err * 3 / 16;
        g[k + W] += err * 5 / 16;
        if (x + 1 < W) g[k + W + 1] += err * 1 / 16;
      }
    }
  }
  for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
    const v = g[j] >= 128 ? 255 : 0;
    img.data[i] = img.data[i+1] = img.data[i+2] = v;
    img.data[i+3] = v < 255 ? 255 : 0;
  }
  return img;
};

/** Sobel edge detection — outline-only stencils. */
export const sobelEdges: FilterFn = (img, p = { strength: 1 }) => {
  const W = img.width, H = img.height;
  const src = new Uint8ClampedArray(img.data);
  const s = p.strength ?? 1;
  const at = (x: number, y: number) => luma(src[(y * W + x) * 4], src[(y * W + x) * 4 + 1], src[(y * W + x) * 4 + 2]);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const gx = -at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1) + at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1);
      const gy = -at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1) + at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1);
      const mag = Math.min(255, Math.hypot(gx, gy) * s);
      const v = 255 - mag;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = 255;
    }
  }
  return img;
};

/** Gaussian blur (separable, 3-pass approximation). */
export const gaussianBlur: FilterFn = (img, p = { radius: 4 }) => {
  const r = Math.max(1, Math.round(p.radius ?? 4));
  const W = img.width, H = img.height;
  const tmp = new Uint8ClampedArray(img.data);
  const out = new Uint8ClampedArray(img.data.length);
  // horizontal
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let R = 0, G = 0, B = 0, A = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(W-1, Math.max(0, x+k));
        const i = (y * W + xx) * 4;
        R += tmp[i]; G += tmp[i+1]; B += tmp[i+2]; A += tmp[i+3]; n++;
      }
      const i = (y * W + x) * 4;
      out[i] = R/n; out[i+1] = G/n; out[i+2] = B/n; out[i+3] = A/n;
    }
  }
  // vertical
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let R = 0, G = 0, B = 0, A = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(H-1, Math.max(0, y+k));
        const i = (yy * W + x) * 4;
        R += out[i]; G += out[i+1]; B += out[i+2]; A += out[i+3]; n++;
      }
      const i = (y * W + x) * 4;
      img.data[i] = R/n; img.data[i+1] = G/n; img.data[i+2] = B/n; img.data[i+3] = A/n;
    }
  }
  return img;
};

/** Skin-tone-preserving contrast curve — keeps mid-tone gradients in tattoo previews. */
export const skinToneCurve: FilterFn = (img) => {
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = img.data[i + c] / 255;
      const adj = Math.pow(v, 0.85) * 0.95 + 0.025;
      img.data[i + c] = Math.round(adj * 255);
    }
  }
  return img;
};

export const FILTERS: { id: string; name: string; fn: FilterFn; defaults?: Record<string, number> }[] = [
  { id: "thermal",   name: "Thermal Stencil (1-bit)", fn: thermalStencil, defaults: { threshold: 128 } },
  { id: "halftone",  name: "Halftone Dither",         fn: halftoneDither },
  { id: "edges",     name: "Sobel Edges",             fn: sobelEdges, defaults: { strength: 1 } },
  { id: "blur",      name: "Gaussian Blur",           fn: gaussianBlur, defaults: { radius: 4 } },
  { id: "skin",      name: "Skin Tone Curve",         fn: skinToneCurve },
];
