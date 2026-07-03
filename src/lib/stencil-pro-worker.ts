/// <reference lib="webworker" />
/**
 * Pro stencil pipeline — additive to editor-worker.ts. Runs in its own Web
 * Worker so heavy TF.js / Canny / stipple work never blocks the main thread.
 *
 * Ops:
 *   remove-bg | smooth | sobel | canny | adaptive-threshold | ml-segment |
 *   stencil  | stencil-otsu | stencil-tonal | combined
 *
 * All ML deps are lazy-loaded so the worker starts instantly and pages that
 * never call ML paths never pay the download cost.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let tf: Any = null;
let cannyEdgeDetector: Any = null;
let bodySegmentation: Any = null;
let segmentationModel: Any = null;
let customMlModel: Any | undefined = undefined;

async function loadTF() {
  if (tf) return tf;
  tf = await import("@tensorflow/tfjs");
  try {
    await tf.setBackend("webgl");
    tf.env().set("WEBGL_FORCE_F16_TEXTURES", false);
    tf.env().set("WEBGL_PACK", true);
  } catch {
    await tf.setBackend("cpu");
  }
  await tf.ready();
  return tf;
}

async function loadCanny() {
  if (cannyEdgeDetector) return cannyEdgeDetector;
  const mod: Any = await import("canny-edge-detector");
  cannyEdgeDetector = mod.default ?? mod;
  return cannyEdgeDetector;
}

async function loadSegmentationModel() {
  if (segmentationModel) return segmentationModel;
  bodySegmentation = await import("@tensorflow-models/body-segmentation");
  await loadTF();
  segmentationModel = await bodySegmentation.createSegmenter(
    bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation,
    { runtime: "tfjs", modelType: "landscape", enableSmoothing: true }
  );
  return segmentationModel;
}

async function loadCustomModel() {
  if (customMlModel !== undefined) return customMlModel;
  const _tf = await loadTF();
  const modelPath = (self as Any).__MODEL_PATH__ ?? "/models/stencil_model/model.json";
  try {
    customMlModel = await _tf.loadGraphModel(modelPath);
  } catch {
    customMlModel = null;
  }
  return customMlModel;
}

// ─── Color palette ──────────────────────────────────────────────────────────
const STENCIL_COLORS = {
  purple:     { r: 112, g: 0,   b: 200 },
  deepPurple: { r: 75,  g: 0,   b: 150 },
  violet:     { r: 148, g: 0,   b: 211 },
  black:      { r: 20,  g: 0,   b: 20  },
  blue:       { r: 0,   g: 40,  b: 180 },
} as const;

type ColorKey = keyof typeof STENCIL_COLORS;
type Style = "edge" | "tonal";
type RGB = { r: number; g: number; b: number };

// ─── Message router ─────────────────────────────────────────────────────────
self.onmessage = async (event: MessageEvent) => {
  const {
    id, op, data,
    colorKey = "purple", customColor, style = "edge", useML = true,
    ...params
  } = event.data as Any;

  try {
    let result: ImageData = data;

    switch (op) {
      case "remove-bg":
        result = await mlRemoveBackground(data, params.tolerance ?? 30, useML);
        break;
      case "smooth":
        result = applyGaussianBlur(data, params.iterations ?? 1, params.sigma ?? 1.0);
        break;
      case "sobel":
        result = colorizeStencil(applySobel(data), colorKey, customColor);
        break;
      case "canny":
        result = colorizeStencil(
          await applyCanny(data, params.lowThreshold ?? 50, params.highThreshold ?? 150),
          colorKey, customColor
        );
        break;
      case "adaptive-threshold":
        result = colorizeStencil(
          applyAdaptiveThreshold(data, params.blockSize ?? 15, params.C ?? 10, params.smooth ?? true),
          colorKey, customColor
        );
        break;
      case "ml-segment":
        result = colorizeStencil(await applyMLSegmentation(data), colorKey, customColor);
        break;
      case "stencil": {
        const s = applyGaussianBlur(data, params.blurIterations ?? 1, params.sigma ?? 1.0);
        const e = applySobel(s);
        result = colorizeStencil(
          applyAdaptiveThreshold(e, params.blockSize ?? 11, params.C ?? 8, params.smooth ?? true),
          colorKey, customColor
        );
        break;
      }
      case "stencil-otsu": {
        const s = applyGaussianBlur(data, 1, 1.0);
        result = colorizeStencil(applyOtsu(applySobel(s)), colorKey, customColor);
        break;
      }
      case "stencil-tonal": {
        const bg = await mlRemoveBackground(data, params.tolerance ?? 30, useML);
        const s = applyGaussianBlur(bg, params.blurIterations ?? 1, params.sigma ?? 1.0);
        const g = toGrayscale(s);
        const t = applyStippleTexture(
          g, params.stippleDensity ?? 0.5, params.hatchAngle ?? 45, params.useErrorDiff ?? true
        );
        result = colorizeStencil(t, colorKey, customColor);
        break;
      }
      case "combined":
        result = await runFullPipeline({ data, colorKey, customColor, style, useML, ...params });
        break;
      default:
        result = data;
    }

    (self as unknown as Worker).postMessage(
      { id, ok: true, data: result },
      [result.data.buffer]
    );
  } catch (err: Any) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err?.message ?? String(err) });
  }
};

// ─── Full 5-phase pipeline ──────────────────────────────────────────────────
async function runFullPipeline(p: Any): Promise<ImageData> {
  const { data, colorKey, customColor, style, useML } = p;

  // 1. BG removal
  const bg = await mlRemoveBackground(data, p.tolerance ?? 30, useML);

  // 2. Denoise
  const smoothed = applyGaussianBlur(bg, p.blurIterations ?? 1, p.sigma ?? 1.0);

  // 3. Edge or tonal
  let processed: ImageData;
  if (style === "tonal") {
    const g = toGrayscale(smoothed);
    processed = applyStippleTexture(
      g, p.stippleDensity ?? 0.5, p.hatchAngle ?? 45, p.useErrorDiff ?? true
    );
  } else {
    const toned = applyToneMapping(smoothed, p.toneStrength ?? 1.2);
    const sob = applySobel(toned);
    let combined = sob;
    try {
      const can = await applyCanny(toned, p.lowThreshold ?? 40, p.highThreshold ?? 120);
      combined = combineEdges(sob, can, 0.4, 0.6);
    } catch { /* canny optional */ }
    processed = applyAdaptiveThreshold(
      combined, p.blockSize ?? 11, p.C ?? 8, p.smooth ?? true
    );
  }

  // 4. Optional ML refinement
  let refined = processed;
  if (useML) {
    const model = await loadCustomModel();
    if (model) {
      try { refined = await applyCustomMLModel(processed, model); } catch { /* silent */ }
    }
  }

  // 5. Colorize
  return colorizeStencil(refined, colorKey, customColor);
}

// ─── Grayscale ──────────────────────────────────────────────────────────────
function toGrayscale(img: ImageData): ImageData {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  return new ImageData(d, img.width, img.height);
}

// ─── Separable Gaussian blur (mirror padding, float32, iterations) ─────────
function applyGaussianBlur(img: ImageData, iterations = 1, sigma = 1.0): ImageData {
  const { width, height } = img;
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

  let src = new Float32Array(img.data.length);
  let dst = new Float32Array(img.data.length);
  for (let i = 0; i < img.data.length; i++) src[i] = img.data[i];

  const mirror = (v: number, max: number) =>
    v < 0 ? -v : v >= max ? 2 * (max - 1) - v : v;

  for (let it = 0; it < iterations; it++) {
    // horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < size; k++) {
          const sx = mirror(x + k - radius, width);
          const i = (y * width + sx) * 4;
          const w = kernel[k];
          r += src[i]     * w;
          g += src[i + 1] * w;
          b += src[i + 2] * w;
          a += src[i + 3] * w;
        }
        const o = (y * width + x) * 4;
        dst[o] = r; dst[o + 1] = g; dst[o + 2] = b; dst[o + 3] = a;
      }
    }
    // vertical
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < size; k++) {
          const sy = mirror(y + k - radius, height);
          const i = (sy * width + x) * 4;
          const w = kernel[k];
          r += dst[i]     * w;
          g += dst[i + 1] * w;
          b += dst[i + 2] * w;
          a += dst[i + 3] * w;
        }
        const o = (y * width + x) * 4;
        src[o] = r; src[o + 1] = g; src[o + 2] = b; src[o + 3] = a;
      }
    }
  }

  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < src.length; i++) out[i] = Math.round(src[i]);
  return new ImageData(out, width, height);
}

// ─── Sobel ──────────────────────────────────────────────────────────────────
function applySobel(img: ImageData): ImageData {
  const { width: w, height: h, data } = img;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const g = (dx: number, dy: number) => gray[(y + dy) * w + (x + dx)];
      const gx =
        -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) +
         g( 1, -1) + 2 * g( 1, 0) + g( 1, 1);
      const gy =
        -g(-1, -1) - 2 * g(0, -1) - g(1, -1) +
         g(-1,  1) + 2 * g(0,  1) + g(1,  1);
      const mag = Math.min(255, Math.hypot(gx, gy));
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = mag;
      out[o + 3] = 255;
    }
  }
  return new ImageData(out, w, h);
}

// ─── Canny via canny-edge-detector ──────────────────────────────────────────
async function applyCanny(
  img: ImageData, lowThreshold: number, highThreshold: number
): Promise<ImageData> {
  const canny = await loadCanny();
  const gray = imageDataToGrayscaleFloat(img);
  // canny-edge-detector expects an Image-like object with getPixelXY / normalize
  const fakeImage: Any = {
    width: img.width,
    height: img.height,
    data: gray,
    channels: 1,
    bitDepth: 8,
    getPixelXY(x: number, y: number) { return [gray[y * img.width + x]]; },
    getValueXY(x: number, y: number) { return gray[y * img.width + x]; },
  };
  let result: Any;
  try {
    result = canny(fakeImage, {
      lowThreshold: lowThreshold / 255,
      highThreshold: highThreshold / 255,
      gaussianBlur: 1.1,
    });
  } catch {
    // Fallback: threshold Sobel magnitude
    return thresholdSobelFallback(img, lowThreshold);
  }
  // canny returns an Image with .data being 0/1 or 0/255
  return booleanArrayToImageData(result.data ?? result, img.width, img.height);
}

function thresholdSobelFallback(img: ImageData, low: number): ImageData {
  const sob = applySobel(img);
  const d = sob.data;
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > low ? 255 : 0;
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return new ImageData(out, img.width, img.height);
}

function imageDataToGrayscaleFloat(img: ImageData): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.width * img.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    out[i / 4] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return out;
}

function booleanArrayToImageData(arr: Any, w: number, h: number): ImageData {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = arr[i] ? 255 : 0;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
  }
  return new ImageData(out, w, h);
}

function combineEdges(a: ImageData, b: ImageData, wa = 0.4, wb = 0.6): ImageData {
  const { width, height, data } = a;
  const bd = b.data;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.min(255, data[i] * wa + bd[i] * wb);
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return new ImageData(out, width, height);
}

// ─── Adaptive threshold (SAT + multi-scale + variance-aware) ────────────────
function applyAdaptiveThreshold(
  img: ImageData, blockSize = 11, C = 8, smooth = true
): ImageData {
  const { width, height, data } = img;
  const bs = blockSize % 2 === 0 ? blockSize + 1 : blockSize;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const w = width + 1, h = height + 1;
  const integ = new Float64Array(w * h);
  const sq = new Float64Array(w * h);
  for (let y = 1; y < h; y++) {
    let rs = 0, rq = 0;
    for (let x = 1; x < w; x++) {
      const v = gray[(y - 1) * width + (x - 1)];
      rs += v; rq += v * v;
      integ[y * w + x] = rs + integ[(y - 1) * w + x];
      sq[y * w + x]    = rq + sq[(y - 1) * w + x];
    }
  }
  const fh = Math.max(3, Math.floor(bs * 0.5));
  const ch = Math.max(10, Math.floor(bs * 1.5));
  const out = new Uint8ClampedArray(data.length);

  const box = (arr: Float64Array, x1: number, y1: number, x2: number, y2: number) =>
    arr[(y2 + 1) * w + (x2 + 1)] - arr[(y2 + 1) * w + x1] - arr[y1 * w + (x2 + 1)] + arr[y1 * w + x1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = gray[y * width + x];
      const fx1 = Math.max(0, x - fh), fy1 = Math.max(0, y - fh);
      const fx2 = Math.min(width - 1, x + fh), fy2 = Math.min(height - 1, y + fh);
      const fArea = (fx2 - fx1 + 1) * (fy2 - fy1 + 1);
      const fMean = box(integ, fx1, fy1, fx2, fy2) / fArea;

      const cx1 = Math.max(0, x - ch), cy1 = Math.max(0, y - ch);
      const cx2 = Math.min(width - 1, x + ch), cy2 = Math.min(height - 1, y + ch);
      const cArea = (cx2 - cx1 + 1) * (cy2 - cy1 + 1);
      const cMean = box(integ, cx1, cy1, cx2, cy2) / cArea;

      const sq2 = box(sq, fx1, fy1, fx2, fy2);
      const variance = sq2 / fArea - fMean * fMean;
      const stdDev = Math.sqrt(Math.max(0, variance));
      const aC = C * (1 - Math.min(1, stdDev / 40));
      const th = fMean * 0.6 + cMean * 0.4 - aC;

      let v: number;
      if (smooth) {
        const spread = Math.max(1, stdDev * 0.3);
        v = Math.min(255, Math.max(0, 127.5 + ((px - th) / spread) * 127.5));
      } else v = px > th ? 255 : 0;

      const o = (y * width + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
    }
  }
  return new ImageData(out, width, height);
}

// ─── Otsu ───────────────────────────────────────────────────────────────────
function applyOtsu(img: ImageData): ImageData {
  const { data, width, height } = img;
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[i / 4] = g; hist[g]++;
  }
  const total = width * height;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxVar = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; th = t; }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] > th ? 255 : 0;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = v; out[o + 3] = 255;
  }
  return new ImageData(out, width, height);
}

// ─── Tone mapping (S-curve) ─────────────────────────────────────────────────
function applyToneMapping(img: ImageData, strength = 1.2): ImageData {
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c] / 255;
      const t = v < 0.5
        ? 0.5 * Math.pow(2 * v, strength)
        : 1 - 0.5 * Math.pow(2 * (1 - v), strength);
      d[i + c] = Math.round(t * 255);
    }
  }
  return new ImageData(d, img.width, img.height);
}

// ─── Algorithmic BG removal (fallback) ──────────────────────────────────────
function removeBackground(img: ImageData, tolerance = 30): ImageData {
  const { data, width, height } = img;
  const out = new Uint8ClampedArray(data);
  // Sample corners for BG color
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4];
  let br = 0, bg = 0, bb = 0;
  for (const c of corners) { br += data[c]; bg += data[c + 1]; bb += data[c + 2]; }
  br /= 4; bg /= 4; bb /= 4;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < tolerance) out[i + 3] = 0;
  }
  return new ImageData(out, width, height);
}

// ─── ML BG removal wrapper ──────────────────────────────────────────────────
async function mlRemoveBackground(img: ImageData, tolerance: number, useML: boolean): Promise<ImageData> {
  if (!useML) return removeBackground(img, tolerance);
  try { return await applyMLSegmentation(img); }
  catch { return removeBackground(img, tolerance); }
}

// ─── MediaPipe segmentation ─────────────────────────────────────────────────
async function applyMLSegmentation(img: ImageData): Promise<ImageData> {
  const segmenter = await loadSegmentationModel();
  const MAX = 512;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const mw = Math.round(img.width * scale);
  const mh = Math.round(img.height * scale);

  let input: ImageData = img;
  if (scale < 1) {
    const c = new OffscreenCanvas(mw, mh);
    const cx = c.getContext("2d")!;
    const bmp = await createImageBitmap(img);
    cx.drawImage(bmp, 0, 0, mw, mh);
    bmp.close();
    input = cx.getImageData(0, 0, mw, mh);
  }
  const seg = await segmenter.segmentPeople(input, { multiSegmentation: false, segmentBodyParts: false });
  if (!seg || seg.length === 0) return removeBackground(img, 30);

  const raw = await bodySegmentation.toBinaryMask(
    seg,
    { r: 255, g: 255, b: 255, a: 255 },
    { r: 0,   g: 0,   b: 0,   a: 255 },
    false, 0.5
  );

  const mc = new OffscreenCanvas(img.width, img.height);
  const mx = mc.getContext("2d")!;
  if (scale < 1) {
    const t = new OffscreenCanvas(mw, mh);
    t.getContext("2d")!.putImageData(raw, 0, 0);
    mx.imageSmoothingEnabled = true;
    mx.imageSmoothingQuality = "high";
    mx.drawImage(t, 0, 0, img.width, img.height);
  } else mx.putImageData(raw, 0, 0);
  const scaled = mx.getImageData(0, 0, img.width, img.height);

  const conf = new Float32Array(img.width * img.height);
  for (let i = 0; i < scaled.data.length; i += 4) conf[i / 4] = scaled.data[i] / 255;

  const cleaned = morphologicalClean(conf, img.width, img.height, 2);
  const feathered = featherMaskEdges(cleaned, img.width, img.height, 4);

  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = feathered[i / 4];
    if (a > 0.02) {
      out[i] = img.data[i]; out[i + 1] = img.data[i + 1]; out[i + 2] = img.data[i + 2];
      out[i + 3] = Math.round(a * 255);
    } else {
      out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 0;
    }
  }
  return new ImageData(out, img.width, img.height);
}

function morphologicalClean(mask: Float32Array, w: number, h: number, r = 2) {
  return morphOp(morphOp(mask, w, h, r, "erode"), w, h, r + 1, "dilate");
}
function morphOp(mask: Float32Array, w: number, h: number, r: number, op: "erode" | "dilate") {
  const out = new Float32Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ext = op === "erode" ? 1 : 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(Math.max(x + dx, 0), w - 1);
          const ny = Math.min(Math.max(y + dy, 0), h - 1);
          const v = mask[ny * w + nx];
          ext = op === "erode" ? Math.min(ext, v) : Math.max(ext, v);
        }
      }
      out[y * w + x] = ext;
    }
  }
  return out;
}
function featherMaskEdges(mask: Float32Array, w: number, h: number, r = 4) {
  const sigma = r / 2, size = r * 2 + 1;
  const k = new Float32Array(size); const s2 = 2 * sigma * sigma; let sum = 0;
  for (let i = 0; i < size; i++) { const x = i - r; k[i] = Math.exp(-(x * x) / s2); sum += k[i]; }
  for (let i = 0; i < size; i++) k[i] /= sum;
  const tmp = new Float32Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = 0; i < size; i++) {
      const sx = Math.min(Math.max(x + i - r, 0), w - 1);
      s += mask[y * w + sx] * k[i];
    }
    tmp[y * w + x] = s;
  }
  const out = new Float32Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = 0; i < size; i++) {
      const sy = Math.min(Math.max(y + i - r, 0), h - 1);
      s += tmp[sy * w + x] * k[i];
    }
    out[y * w + x] = s;
  }
  return out;
}

// ─── Custom TF.js refinement ────────────────────────────────────────────────
async function applyCustomMLModel(img: ImageData, model: Any): Promise<ImageData> {
  const _tf = await loadTF();
  return _tf.tidy(() => {
    const input = _tf.browser.fromPixels(img).toFloat().div(255).expandDims(0);
    const pred = model.predict(input) as Any;
    const out = pred.squeeze().mul(255).clipByValue(0, 255).toInt();
    const arr = out.dataSync();
    const chan = out.shape.length === 3 ? out.shape[2] : 1;
    const w = img.width, h = img.height;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const r = chan >= 3 ? arr[i * chan]     : arr[i];
      const g = chan >= 3 ? arr[i * chan + 1] : arr[i];
      const b = chan >= 3 ? arr[i * chan + 2] : arr[i];
      const o = i * 4;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
    }
    return new ImageData(buf, w, h);
  });
}

// ─── Stipple texture (Floyd-Steinberg + hatch + crosshatch) ─────────────────
function applyStippleTexture(
  img: ImageData, density = 0.5, angle = 45, useErrorDiff = true
): ImageData {
  const { data, width, height } = img;
  const out = new Uint8ClampedArray(data.length);
  out.fill(255);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;

  const brightness = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    brightness[i / 4] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  }

  // Layer 1: dot layer (Floyd-Steinberg or grid)
  if (useErrorDiff) {
    const err = new Float32Array(brightness);
    const threshold = 0.5 + (1 - density) * 0.3;
    for (let y = 0; y < height; y++) {
      const l2r = y % 2 === 0;
      const xs = l2r ? 0 : width - 1;
      const xe = l2r ? width : -1;
      const step = l2r ? 1 : -1;
      for (let x = xs; x !== xe; x += step) {
        const i = y * width + x;
        const oldV = err[i];
        const newV = oldV > threshold ? 1 : 0;
        if (newV === 0) {
          const dot = Math.max(1, Math.round((1 - oldV) * 2.5 * density));
          drawDot(out, x, y, dot, width, height);
        }
        const e = oldV - newV;
        // FS distribute
        if (l2r) {
          if (x + 1 < width)              err[i + 1]         += e * 7 / 16;
          if (y + 1 < height && x > 0)    err[i + width - 1] += e * 3 / 16;
          if (y + 1 < height)             err[i + width]     += e * 5 / 16;
          if (y + 1 < height && x + 1 < width) err[i + width + 1] += e * 1 / 16;
        } else {
          if (x - 1 >= 0)                 err[i - 1]         += e * 7 / 16;
          if (y + 1 < height && x + 1 < width) err[i + width + 1] += e * 3 / 16;
          if (y + 1 < height)             err[i + width]     += e * 5 / 16;
          if (y + 1 < height && x - 1 >= 0) err[i + width - 1] += e * 1 / 16;
        }
      }
    }
  } else {
    const step = Math.max(2, Math.round(6 - density * 4));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const b = brightness[y * width + x];
        if (b < 0.7) {
          const dot = Math.max(1, Math.round((1 - b) * 2 * density));
          drawDot(out, x, y, dot, width, height);
        }
      }
    }
  }

  // Layer 2: directional hatching for midtones
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  const hatchStep = Math.max(3, Math.round(8 - density * 6));
  for (let y = 0; y < height; y += hatchStep) {
    for (let x = 0; x < width; x += hatchStep) {
      const b = brightness[y * width + x];
      if (b < 0.6 && b > 0.15) {
        const len = Math.round((1 - b) * hatchStep * 1.4);
        drawLine(out, x, y, x + Math.round(dx * len), y + Math.round(dy * len), width, height);
      }
    }
  }

  // Layer 3: crosshatch for shadows
  const rad2 = ((angle + 90) * Math.PI) / 180;
  const dx2 = Math.cos(rad2), dy2 = Math.sin(rad2);
  const crossStep = Math.max(4, Math.round(10 - density * 6));
  for (let y = 0; y < height; y += crossStep) {
    for (let x = 0; x < width; x += crossStep) {
      const b = brightness[y * width + x];
      if (b < 0.25) {
        const len = Math.round((1 - b) * crossStep * 1.4);
        drawLine(out, x, y, x + Math.round(dx2 * len), y + Math.round(dy2 * len), width, height);
      }
    }
  }

  return new ImageData(out, width, height);
}

function drawDot(out: Uint8ClampedArray, cx: number, cy: number, r: number, w: number, h: number) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = 255;
    }
  }
}

function drawLine(out: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number, w: number, h: number) {
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    if (x >= 0 && y >= 0 && x < w && y < h) {
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = 255;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// ─── Colorize (thermal purple, gamma) ───────────────────────────────────────
function colorizeStencil(img: ImageData, key: ColorKey, custom?: RGB): ImageData {
  const c = custom ?? STENCIL_COLORS[key] ?? STENCIL_COLORS.purple;
  const d = new Uint8ClampedArray(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const t = Math.pow(l, 0.85);
    d[i]     = Math.round(c.r * (1 - t) + 255 * t);
    d[i + 1] = Math.round(c.g * (1 - t) + 255 * t);
    d[i + 2] = Math.round(c.b * (1 - t) + 255 * t);
    // keep alpha as-is (preserves BG removal)
  }
  return new ImageData(d, img.width, img.height);
}

export {};