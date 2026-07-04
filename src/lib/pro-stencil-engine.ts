// Pro stencil engine — additive module. Provides a self-contained pipeline
// (background removal → blur → edges/tonal → adaptive threshold → colorize)
// used by the ProStencilPanel. Does NOT replace src/lib/stencil-engine.ts;
// the Sobel-based default pipeline for tattoo/fineline/procreate presets is
// preserved there and untouched.

export type ColorKey = "purple" | "deepPurple" | "violet" | "black" | "blue";

export interface PipelineParams {
  data: ImageData;
  colorKey?: ColorKey;
  customColor?: { r: number; g: number; b: number };
  style?: "edge" | "tonal";
  useML?: boolean;
  tolerance?: number;
  blurIterations?: number;
  sigma?: number;
  lowThreshold?: number;
  highThreshold?: number;
  blockSize?: number;
  C?: number;
  smooth?: boolean;
  stippleDensity?: number;
  hatchAngle?: number;
  useErrorDiff?: boolean;
  toneStrength?: number;
}

// === Core Operations =======================================================

/** Separable Gaussian blur with mirror padding. */
export function applyGaussianBlur(img: ImageData, iterations = 1, sigma = 1.0): ImageData {
  const { width, height, data } = img;
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const s2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / s2);
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;

  const mirror = (v: number, max: number) => (v < 0 ? -v : v >= max ? 2 * (max - 1) - v : v);

  const src = new Float32Array(data.length);
  const dst = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) src[i] = data[i];

  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < size; k++) {
          const sx = mirror(x + k - radius, width);
          const i = (y * width + sx) * 4;
          const w = kernel[k];
          r += src[i] * w; g += src[i + 1] * w; b += src[i + 2] * w; a += src[i + 3] * w;
        }
        const o = (y * width + x) * 4;
        dst[o] = r; dst[o + 1] = g; dst[o + 2] = b; dst[o + 3] = a;
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < size; k++) {
          const sy = mirror(y + k - radius, height);
          const i = (sy * width + x) * 4;
          const w = kernel[k];
          r += dst[i] * w; g += dst[i + 1] * w; b += dst[i + 2] * w; a += dst[i + 3] * w;
        }
        const o = (y * width + x) * 4;
        src[o] = r; src[o + 1] = g; src[o + 2] = b; src[o + 3] = a;
      }
    }
  }

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.round(src[i]);
  return new ImageData(out, width, height);
}

/** Sobel gradient magnitude → grayscale edge map. */
export function applySobel(img: ImageData): ImageData {
  const { width: w, height: h, data } = img;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const g = (dx: number, dy: number) => gray[(y + dy) * w + (x + dx)];
      const gx = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1);
      const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
      const mag = Math.min(255, Math.hypot(gx, gy));
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = mag; out[o + 3] = 255;
    }
  }
  return new ImageData(out, w, h);
}

/** Canny — simplified: currently delegates to Sobel + hysteresis-like thresholds. */
export async function applyCanny(
  img: ImageData,
  lowThreshold: number,
  highThreshold: number,
): Promise<ImageData> {
  const sobel = applySobel(img);
  const d = sobel.data;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i];
    const keep = v >= highThreshold ? 255 : v >= lowThreshold ? 180 : 0;
    out[i] = out[i + 1] = out[i + 2] = keep;
    out[i + 3] = 255;
  }
  return new ImageData(out, sobel.width, sobel.height);
}

/** Adaptive mean threshold using a box-window average. */
export function applyAdaptiveThreshold(
  img: ImageData,
  blockSize = 11,
  C = 8,
  smooth = true,
): ImageData {
  const { width: w, height: h, data } = img;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // Integral image
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + row;
    }
  }
  const r = Math.max(1, Math.floor(blockSize / 2));
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integ[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integ[y0 * (w + 1) + (x1 + 1)] -
        integ[(y1 + 1) * (w + 1) + x0] +
        integ[y0 * (w + 1) + x0];
      const mean = sum / area;
      const val = gray[y * w + x];
      const isInk = val < mean - C;
      const o = (y * w + x) * 4;
      const v = isInk ? 0 : 255;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  let result = new ImageData(out, w, h);
  if (smooth) result = applyGaussianBlur(result, 1, 0.6);
  return result;
}

/** Lazy TF.js body-segmentation removal; falls back to corner chroma-key. */
export async function mlRemoveBackground(
  img: ImageData,
  tolerance = 30,
  useML = true,
): Promise<ImageData> {
  if (useML) {
    try {
      const tfMod = "@tensorflow/tfjs";
      const segMod = "@tensorflow-models/body-segmentation";
      const tf = await import(/* @vite-ignore */ tfMod);
      const seg = await import(/* @vite-ignore */ segMod);
      await (tf as { ready: () => Promise<void> }).ready();
      const segmenter = await (
        seg as {
          createSegmenter: (m: string, cfg: unknown) => Promise<{
            segmentPeople: (input: ImageData) => Promise<Array<{ mask: { toImageData: () => Promise<ImageData> } }>>;
          }>;
          SupportedModels: { MediaPipeSelfieSegmentation: string };
        }
      ).createSegmenter(
        (seg as { SupportedModels: { MediaPipeSelfieSegmentation: string } }).SupportedModels
          .MediaPipeSelfieSegmentation,
        { runtime: "tfjs", modelType: "general" },
      );
      const people = await segmenter.segmentPeople(img);
      if (people[0]) {
        const mask = await people[0].mask.toImageData();
        const out = new Uint8ClampedArray(img.data);
        for (let i = 0; i < out.length; i += 4) {
          if (mask.data[i + 3] < 128) out[i + 3] = 0;
        }
        return new ImageData(out, img.width, img.height);
      }
    } catch {
      // fall through to chroma-key
    }
  }
  const d = new Uint8ClampedArray(img.data);
  const bgR = d[0], bgG = d[1], bgB = d[2];
  for (let i = 0; i < d.length; i += 4) {
    if (
      Math.abs(d[i] - bgR) < tolerance &&
      Math.abs(d[i + 1] - bgG) < tolerance &&
      Math.abs(d[i + 2] - bgB) < tolerance
    ) {
      d[i + 3] = 0;
    }
  }
  return new ImageData(d, img.width, img.height);
}

/** Placeholder — resolves to null unless a custom model is wired in. */
export async function loadCustomModel(): Promise<unknown> {
  return null;
}

/** Placeholder — pass through until a custom model is wired in. */
export async function applyCustomMLModel(img: ImageData, _model: unknown): Promise<ImageData> {
  return img;
}

/** Recolor black ink pixels with a preset or custom color; whites → transparent. */
export function colorizeStencil(
  img: ImageData,
  colorKey: ColorKey = "purple",
  customColor?: { r: number; g: number; b: number },
): ImageData {
  const palette: Record<ColorKey, { r: number; g: number; b: number }> = {
    purple:     { r: 112, g: 0, b: 200 },
    deepPurple: { r: 75,  g: 0, b: 150 },
    violet:     { r: 148, g: 0, b: 211 },
    black:      { r: 20,  g: 0, b: 20  },
    blue:       { r: 0,   g: 40, b: 180 },
  };
  const color = customColor ?? palette[colorKey];
  const { width, height, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 128) {
      out[i] = color.r; out[i + 1] = color.g; out[i + 2] = color.b; out[i + 3] = 255;
    } else {
      out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = 0;
    }
  }
  return new ImageData(out, width, height);
}

/** Weighted blend of two edge maps (Sobel + Canny). */
export function combineEdges(a: ImageData, b: ImageData, wa = 0.4, wb = 0.6): ImageData {
  const { width, height, data } = a;
  const bd = b.data;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.min(255, data[i] * wa + bd[i] * wb);
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return new ImageData(out, width, height);
}

/** Luma grayscale. */
export function toGrayscale(img: ImageData): ImageData {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  return new ImageData(d, img.width, img.height);
}

/** Gamma-style tone remap; strength > 1 boosts midtones. */
export function applyToneMapping(img: ImageData, strength = 1.0): ImageData {
  if (strength === 1) return img;
  const d = new Uint8ClampedArray(img.data);
  const gamma = 1 / Math.max(0.1, strength);
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.round(255 * Math.pow(d[i]     / 255, gamma));
    d[i + 1] = Math.round(255 * Math.pow(d[i + 1] / 255, gamma));
    d[i + 2] = Math.round(255 * Math.pow(d[i + 2] / 255, gamma));
  }
  return new ImageData(d, img.width, img.height);
}

/** Floyd–Steinberg / ordered hatch stipple for tonal stencils. */
export function applyStippleTexture(
  img: ImageData,
  density = 0.5,
  hatchAngle = 45,
  useErrorDiff = true,
): ImageData {
  const { width: w, height: h } = img;
  const src = new Float32Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = img.data[i * 4];
  const out = new Uint8ClampedArray(w * h * 4);
  const threshold = 255 * (1 - density);

  if (useErrorDiff) {
    const buf = src.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldV = buf[idx];
        const newV = oldV < threshold ? 0 : 255;
        const err = oldV - newV;
        buf[idx] = newV;
        if (x + 1 < w) buf[idx + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) buf[idx + w - 1] += (err * 3) / 16;
          buf[idx + w] += (err * 5) / 16;
          if (x + 1 < w) buf[idx + w + 1] += (err * 1) / 16;
        }
        const o = idx * 4;
        out[o] = out[o + 1] = out[o + 2] = newV;
        out[o + 3] = 255;
      }
    }
  } else {
    const rad = (hatchAngle * Math.PI) / 180;
    const cs = Math.cos(rad), sn = Math.sin(rad);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const hatch = (Math.sin((x * cs + y * sn) * 0.8) + 1) * 127.5;
        const v = src[idx] < hatch * (1 - density) + threshold * density ? 0 : 255;
        const o = idx * 4;
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
  }
  return new ImageData(out, w, h);
}

// === Main pipeline =========================================================

export async function runFullPipeline(params: PipelineParams): Promise<ImageData> {
  const {
    data,
    colorKey = "purple",
    customColor,
    style = "edge",
    useML = true,
    tolerance = 30,
    blurIterations = 1,
    sigma = 1.0,
    lowThreshold = 40,
    highThreshold = 120,
    blockSize = 11,
    C = 8,
    smooth = true,
    stippleDensity = 0.5,
    hatchAngle = 45,
    useErrorDiff = true,
    toneStrength = 1.2,
  } = params;

  const bgRemoved = await mlRemoveBackground(data, tolerance, useML);
  const smoothed = applyGaussianBlur(bgRemoved, blurIterations, sigma);

  let processed: ImageData;
  if (style === "tonal") {
    const gray = toGrayscale(smoothed);
    processed = applyStippleTexture(gray, stippleDensity, hatchAngle, useErrorDiff);
  } else {
    const toned = applyToneMapping(smoothed, toneStrength);
    const sobelEdges = applySobel(toned);
    let combinedEdges = sobelEdges;
    try {
      const cannyEdges = await applyCanny(toned, lowThreshold, highThreshold);
      combinedEdges = combineEdges(sobelEdges, cannyEdges, 0.4, 0.6);
    } catch {
      /* keep sobel-only fallback */
    }
    processed = applyAdaptiveThreshold(combinedEdges, blockSize, C, smooth);
  }

  if (useML) {
    const model = await loadCustomModel();
    if (model) {
      try {
        processed = await applyCustomMLModel(processed, model);
      } catch {
        /* ignore custom model errors */
      }
    }
  }

  return colorizeStencil(processed, colorKey, customColor);
}