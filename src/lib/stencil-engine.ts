// Core stencil processing engine — additive module. Does NOT modify the
// AI stencil generation pipeline; these are pure client-side post-process
// helpers callable from the vault editor / export flows.

import { applyOtsuThreshold } from "@/lib/otsu";

export type EdgeMode = "threshold" | "sobel" | "combined" | "canny" | "otsu" | "hatch" | "flow-portrait";

export interface StencilOptions {
  threshold: number; // 0-255, default 128
  edgeSensitivity: number; // 0-100, default 50
  edgeMode?: EdgeMode;
  lineThickness: number; // 1-10, default 2
  noiseReduction: number; // 0-10, default 3
  smoothing: number; // 0-10, default 3
  invertColors: boolean; // default false
  preset: StencilPreset;
  /** -5 to +5 (negative = erode / thinner, positive = dilate / thicker). */
  dilateErode?: number;
  /** Close 1-2px gaps between edge segments (morphological close). */
  bridgeGaps?: boolean;
}

export type StencilPreset =
  | "tattoo"
  | "streetart"
  | "fineline"
  | "craft"
  | "bold"
  | "procreate"
  | "watercolor"
  | "sketch"
  | "engraving"
  | "portrait-pro"
  | "custom";

export const STENCIL_PRESETS: Record<StencilPreset, Partial<StencilOptions>> = {
  tattoo: {
    threshold: 140,
    edgeSensitivity: 72,
    edgeMode: "combined",
    lineThickness: 2,
    noiseReduction: 4,
    smoothing: 4,
    bridgeGaps: true,
    dilateErode: 0,
  },
  streetart: {
    threshold: 108,
    edgeSensitivity: 38,
    edgeMode: "threshold",
    lineThickness: 5,
    noiseReduction: 2,
    smoothing: 2,
    bridgeGaps: false,
    dilateErode: 1,
  },
  fineline: {
    threshold: 162,
    edgeSensitivity: 92,
    edgeMode: "sobel",
    lineThickness: 1,
    noiseReduction: 5,
    smoothing: 6,
    bridgeGaps: true,
    dilateErode: 0,
  },
  craft: {
    threshold: 120,
    edgeSensitivity: 50,
    edgeMode: "threshold",
    lineThickness: 4,
    noiseReduction: 3,
    smoothing: 3,
    bridgeGaps: false,
    dilateErode: 1,
  },
  bold: {
    threshold: 98,
    edgeSensitivity: 28,
    edgeMode: "threshold",
    lineThickness: 8,
    noiseReduction: 2,
    smoothing: 1,
    bridgeGaps: false,
    dilateErode: 2,
  },
  procreate: {
    threshold: 152,
    edgeSensitivity: 88,
    edgeMode: "sobel",
    lineThickness: 1,
    noiseReduction: 6,
    smoothing: 7,
    bridgeGaps: true,
    dilateErode: 0,
  },
  watercolor: {
    threshold: 172,
    edgeSensitivity: 58,
    edgeMode: "combined",
    lineThickness: 2,
    noiseReduction: 7,
    smoothing: 8,
    bridgeGaps: true,
    dilateErode: -1,
  },
  sketch: {
    threshold: 128,
    edgeSensitivity: 98,
    edgeMode: "canny",
    lineThickness: 1,
    noiseReduction: 2,
    smoothing: 2,
    bridgeGaps: false,
    dilateErode: 0,
  },
  engraving: {
    threshold: 128,
    edgeSensitivity: 65,
    edgeMode: "hatch",
    lineThickness: 2,
    noiseReduction: 2,
    smoothing: 2,
    bridgeGaps: true,
    dilateErode: 0,
  },
  "portrait-pro": {
    threshold: 128,
    edgeSensitivity: 65,
    edgeMode: "flow-portrait",
    lineThickness: 2,
    noiseReduction: 1,
    smoothing: 1,
    bridgeGaps: true,
    dilateErode: 0,
  },
  custom: {
    threshold: 128,
    edgeSensitivity: 50,
    edgeMode: "combined",
    lineThickness: 2,
    noiseReduction: 3,
    smoothing: 3,
    bridgeGaps: false,
    dilateErode: 0,
  },
};

export const DEFAULT_STENCIL_OPTIONS: StencilOptions = {
  threshold: 128,
  edgeSensitivity: 50,
  edgeMode: "combined",
  lineThickness: 2,
  noiseReduction: 3,
  smoothing: 3,
  invertColors: false,
  preset: "custom",
  dilateErode: 0,
  bridgeGaps: false,
};

/** Alias to match the newer public API (`DEFAULT_OPTIONS`). */
export const DEFAULT_OPTIONS = DEFAULT_STENCIL_OPTIONS;

/** Convert an RGB(A) image into pure grayscale (R=G=B=luma). */
export function applyGrayscale(imageData: ImageData): ImageData {
  const d = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  return new ImageData(d, imageData.width, imageData.height);
}

// --- Core pixel ops ---------------------------------------------------------

/** Binary threshold — black ink on transparent. */
export function applyThreshold(imageData: ImageData, threshold: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  for (let i = 0; i < data.length; i += 4) {
    const avg = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const val = avg < threshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = val;
    data[i + 3] = val === 0 ? 255 : 0;
  }
  return new ImageData(data, imageData.width, imageData.height);
}

/*
Add the exact applySobelEdge implementation requested by the prompt.
*/
export function applySobelEdge(imageData: ImageData, sensitivity: number): ImageData {
  const { width, height } = imageData;
  const src = imageData.data;
  const output = new Uint8ClampedArray(src.length).fill(255);
  const scale = 0.3 + (sensitivity / 100) * 2.2;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      const luma = (dx: number, dy: number): number => {
        const i = ((y + dy) * width + (x + dx)) * 4;
        return src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
      };

      const gx =
        -1 * luma(-1, -1) +
        -2 * luma(-1, 0) +
        -1 * luma(-1, 1) +
        1 * luma(1, -1) +
        2 * luma(1, 0) +
        1 * luma(1, 1);

      const gy =
        -1 * luma(-1, -1) +
        -2 * luma(0, -1) +
        -1 * luma(1, -1) +
        1 * luma(-1, 1) +
        2 * luma(0, 1) +
        1 * luma(1, 1);

      const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy) * scale);
      const val = magnitude > 20 ? 0 : 255;

      output[idx] = val;
      output[idx + 1] = val;
      output[idx + 2] = val;
      output[idx + 3] = val === 0 ? 255 : 0;
    }
  }

  return new ImageData(output, width, height);
}

export function applyCombinedEdge(
  imageData: ImageData,
  threshold: number,
  sensitivity: number,
): ImageData {
  const threshResult = applyThreshold(imageData, threshold);
  const sobelResult = applySobelEdge(imageData, sensitivity);
  const output = new Uint8ClampedArray(imageData.data.length).fill(255);

  for (let i = 0; i < output.length; i += 4) {
    const blackFromThreshold = threshResult.data[i] === 0;
    const blackFromSobel = sobelResult.data[i] === 0;
    const isBlack = blackFromThreshold || blackFromSobel;

    output[i] = isBlack ? 0 : 255;
    output[i + 1] = isBlack ? 0 : 255;
    output[i + 2] = isBlack ? 0 : 255;
    output[i + 3] = isBlack ? 255 : 0;
  }

  return new ImageData(output, imageData.width, imageData.height);
}

/** Gaussian blur via native canvas filter — cheap & GPU-accelerated. */
export function applyGaussianBlur(imageData: ImageData, radius: number): ImageData {
  if (radius <= 0) return imageData;
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  const tmp = document.createElement("canvas");
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  const tctx = tmp.getContext("2d")!;
  tctx.filter = `blur(${radius * 0.3}px)`;
  tctx.drawImage(canvas, 0, 0);
  return tctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Removes isolated black pixels (speckle noise). */
export function applyNoiseReduction(imageData: ImageData, strength: number): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = new Uint8ClampedArray(imageData.data);
  const original = imageData.data;
  const radius = Math.max(1, Math.ceil(strength / 3));

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = (y * width + x) * 4;
      if (original[idx] === 0) {
        let blackNeighbors = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ni = ((y + dy) * width + (x + dx)) * 4;
            if (original[ni] === 0) blackNeighbors++;
          }
        }
        if (blackNeighbors < strength) {
          data[idx] = data[idx + 1] = data[idx + 2] = 255;
          data[idx + 3] = 0;
        }
      }
    }
  }
  return new ImageData(data, width, height);
}

/** Morphological dilation — thickens ink lines by `radius` px. */
export function applyLineThickness(imageData: ImageData, radius: number): ImageData {
  if (radius <= 1) return imageData;
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);
  const r = Math.min(10, Math.max(1, Math.round(radius)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = false;
      for (let dy = -r; dy <= r && !hit; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (src[(yy * width + xx) * 4] === 0) {
            hit = true;
            break;
          }
        }
      }
      const o = (y * width + x) * 4;
      const v = hit ? 0 : 255;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = v === 0 ? 255 : 0;
    }
  }
  return new ImageData(out, width, height);
}

// --- Canny-style edge detection --------------------------------------------

export function applyCannyEdge(imageData: ImageData, sensitivity: number): ImageData {
  const { width, height } = imageData;
  const gray = applyGrayscale(imageData);
  const blurred = applyGaussianBlur(gray, 1.4);
  const src = blurred.data;

  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const mag = new Float32Array(width * height);
  let maxMag = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = (dx: number, dy: number) => src[((y + dy) * width + (x + dx)) * 4];
      const sx = -l(-1, -1) - 2 * l(-1, 0) - l(-1, 1) + l(1, -1) + 2 * l(1, 0) + l(1, 1);
      const sy = -l(-1, -1) - 2 * l(0, -1) - l(1, -1) + l(-1, 1) + 2 * l(0, 1) + l(1, 1);
      gx[i] = sx;
      gy[i] = sy;
      const m = Math.sqrt(sx * sx + sy * sy);
      mag[i] = m;
      if (m > maxMag) maxMag = m;
    }
  }

  const thin = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = mag[i];
      if (m === 0) continue;
      let angle = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI;
      if (angle < 0) angle += 180;
      let n1: number, n2: number;
      if (angle < 22.5 || angle >= 157.5) {
        n1 = mag[i - 1];
        n2 = mag[i + 1];
      } else if (angle < 67.5) {
        n1 = mag[i - width + 1];
        n2 = mag[i + width - 1];
      } else if (angle < 112.5) {
        n1 = mag[i - width];
        n2 = mag[i + width];
      } else {
        n1 = mag[i - width - 1];
        n2 = mag[i + width + 1];
      }
      thin[i] = m >= n1 && m >= n2 ? m : 0;
    }
  }

  const highT = maxMag * (0.15 + ((100 - sensitivity) / 100) * 0.35);
  const lowT = highT * 0.4;
  const edge = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] >= highT) {
      edge[i] = 1;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const ni = yy * width + xx;
        if (!edge[ni] && thin[ni] >= lowT) {
          edge[ni] = 1;
          stack.push(ni);
        }
      }
    }
  }

  const out = new Uint8ClampedArray(imageData.data.length).fill(255);
  for (let i = 0; i < edge.length; i++) {
    const v = edge[i] ? 0 : 255;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = v;
    out[o + 3] = v === 0 ? 255 : 0;
  }
  return new ImageData(out, width, height);
}

// --- Dilate / Erode (morphological) ----------------------------------------

/** Positive amount = dilate (thicker lines); negative = erode (thinner). */
export function applyDilateErode(imageData: ImageData, amount: number): ImageData {
  if (!amount) return imageData;
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);
  const r = Math.min(5, Math.abs(Math.round(amount)));
  const dilate = amount > 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = dilate ? false : true;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const isBlack = src[(yy * width + xx) * 4] === 0;
          if (dilate && isBlack) {
            hit = true;
          }
          if (!dilate && !isBlack) {
            hit = false;
          }
        }
      }
      const o = (y * width + x) * 4;
      const v = hit ? 0 : 255;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = v === 0 ? 255 : 0;
    }
  }
  return new ImageData(out, width, height);
}

/** Morphological CLOSE (dilate → erode) to bridge 1-2px broken edges. */
export function bridgeGaps(imageData: ImageData): ImageData {
  return applyDilateErode(applyDilateErode(imageData, 1), -1);
}

export interface HatchOptions {
  /** 0-100: overall shading density / darkness sensitivity. */
  intensity: number;
  /** Pixel spacing between hatch lines at the lightest active tier. */
  baseSpacing: number;
  /** Also draw a light stipple-dot layer in the upper-mid tone tier. */
  stipple: boolean;
}

const HATCH_ANGLES = [Math.PI / 4, (Math.PI * 3) / 4, 0, Math.PI / 2]; // 45°, 135°, 0°, 90°

/** Luminance-driven procedural cross-hatch shading — the non-AI counterpart
 *  to the AI engine's 5-tier tonal hatching prompt. Darker regions get more
 *  overlapping hatch directions at tighter spacing; light regions stay bare
 *  paper (or light stipple). Runs on a resolution-capped working canvas and
 *  yields between passes so it never blocks the main thread for long, even
 *  on large source images. */
export async function applyHatchRender(
  imageData: ImageData,
  opts: HatchOptions,
): Promise<ImageData> {
  const MAX_EDGE = 1400; // hatching is a texture fill — full print resolution isn't needed
  const scale = Math.min(1, MAX_EDGE / Math.max(imageData.width, imageData.height));

  let work = imageData;
  if (scale < 1) {
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    srcCanvas.getContext("2d")!.putImageData(imageData, 0, 0);
    const workCanvas = document.createElement("canvas");
    workCanvas.width = Math.max(1, Math.round(imageData.width * scale));
    workCanvas.height = Math.max(1, Math.round(imageData.height * scale));
    const wctx = workCanvas.getContext("2d")!;
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = "high";
    wctx.drawImage(srcCanvas, 0, 0, workCanvas.width, workCanvas.height);
    work = wctx.getImageData(0, 0, workCanvas.width, workCanvas.height);
  }

  const { width, height } = work;
  const grayBlurred = applyGaussianBlur(applyGrayscale(work), 1);
  const lum = grayBlurred.data;

  const out = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 3; i < out.length; i += 4) out[i] = 0; // fully transparent ink layer

  const spacing = Math.max(2, opts.baseSpacing);
  const sensitivity = 1 + (opts.intensity - 50) / 100; // 0.5..1.5

  const tiers = [
    { max: 235, dirs: 0, spacingMul: 1 },
    { max: 190, dirs: 1, spacingMul: 1.6 },
    { max: 145, dirs: 2, spacingMul: 1.1 },
    { max: 95, dirs: 3, spacingMul: 0.85 },
    { max: 45, dirs: 4, spacingMul: 0.65 },
  ];

  function stampInk(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = (y * width + x) * 4;
    out[idx] = out[idx + 1] = out[idx + 2] = 0;
    out[idx + 3] = 255;
  }

  function drawHatchLine(angle: number, offset: number, tierMax: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const diag = Math.hypot(width, height);
    const px = -sin * offset + width / 2 + cos * -diag;
    const py = cos * offset + height / 2 + sin * -diag;
    const steps = Math.round(diag * 2);
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(px + cos * s);
      const y = Math.round(py + sin * s);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const l = lum[(y * width + x) * 4];
      if (l <= tierMax) stampInk(x, y);
    }
  }

  const yieldNow = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  for (let t = 1; t < tiers.length; t++) {
    const tier = tiers[t];
    const lineSpacing = Math.max(1.5, spacing * tier.spacingMul * (1 / sensitivity));
    for (let d = 0; d < tier.dirs; d++) {
      const angle = HATCH_ANGLES[d];
      const diag = Math.hypot(width, height);
      for (let off = -diag; off <= diag; off += lineSpacing) {
        drawHatchLine(angle, off, tier.max);
      }
      await yieldNow();
    }
  }

  if (opts.stipple) {
    const dotTierMax = tiers[1].max;
    const dotTierMin = tiers[2].max;
    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x += 3) {
        const l = lum[(y * width + x) * 4];
        if (l > dotTierMax || l < dotTierMin) continue;
        const p = 1 - (l - dotTierMin) / (dotTierMax - dotTierMin);
        if (Math.random() < p * 0.5) {
          stampInk(
            x + Math.round((Math.random() - 0.5) * 2),
            y + Math.round((Math.random() - 0.5) * 2),
          );
        }
      }
      if (y % 60 === 0) await yieldNow();
    }
  }

  if (scale < 1) {
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = width;
    smallCanvas.height = height;
    smallCanvas.getContext("2d")!.putImageData(new ImageData(out, width, height), 0, 0);
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = imageData.width;
    fullCanvas.height = imageData.height;
    const fctx = fullCanvas.getContext("2d")!;
    fctx.imageSmoothingEnabled = false;
    fctx.drawImage(smallCanvas, 0, 0, imageData.width, imageData.height);
    return fctx.getImageData(0, 0, imageData.width, imageData.height);
  }
  return new ImageData(out, width, height);
}

export interface FlowPortraitOptions {
  structureSigma: number;
  edgeSigma: number;
  tau: number;
  phi: number;
  etfIterations: number;
  flowStrength: number;
  hatchIntensity: number;
  lineWeight: number;
}

export const DEFAULT_FLOW_PORTRAIT_OPTIONS: FlowPortraitOptions = {
  structureSigma: 3,
  edgeSigma: 1,
  tau: 0.95,
  phi: 8,
  etfIterations: 3,
  flowStrength: 0.85,
  hatchIntensity: 65,
  lineWeight: 1.5,
};

function flowYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function grayFloat(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function boxBlurField(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const radius = Math.max(1, Math.round(sigma * 1.5));
  const passes = 3;
  let cur = src;
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      let acc = 0;
      const rowStart = y * width;
      for (let x = -radius; x <= radius; x++) {
        acc += cur[rowStart + Math.min(width - 1, Math.max(0, x))];
      }
      for (let x = 0; x < width; x++) {
        tmp[rowStart + x] = acc / (radius * 2 + 1);
        const addX = Math.min(width - 1, x + radius + 1);
        const subX = Math.max(0, x - radius);
        acc += cur[rowStart + addX] - cur[rowStart + subX];
      }
    }
    const tmp2 = new Float32Array(width * height);
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) {
        acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
      }
      for (let y = 0; y < height; y++) {
        tmp2[y * width + x] = acc / (radius * 2 + 1);
        const addY = Math.min(height - 1, y + radius + 1);
        const subY = Math.max(0, y - radius);
        acc += tmp[addY * width + x] - tmp[subY * width + x];
      }
    }
    cur = tmp2;
  }
  return cur;
}

function bilateralSmooth(gray: Float32Array, width: number, height: number, iterations: number): Float32Array {
  const spatialWeights = [1, 0.6, 0.25];
  const rangeSigma = 24;
  let cur = gray;
  for (let it = 0; it < iterations; it++) {
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const center = cur[i];
        let wsum = 0;
        let vsum = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const xx = Math.min(width - 1, Math.max(0, x + dx));
            const yy = Math.min(height - 1, Math.max(0, y + dy));
            const v = cur[yy * width + xx];
            const sw = spatialWeights[Math.min(2, Math.abs(dx))] * spatialWeights[Math.min(2, Math.abs(dy))];
            const rangeDiff = v - center;
            const rw = Math.exp(-(rangeDiff * rangeDiff) / (2 * rangeSigma * rangeSigma));
            const w = sw * rw;
            wsum += w;
            vsum += w * v;
          }
        }
        out[i] = wsum > 0 ? vsum / wsum : center;
      }
    }
    cur = out;
  }
  return cur;
}

interface FlowField {
  cos: Float32Array;
  sin: Float32Array;
  coherence: Float32Array;
}

function computeStructureTensor(gray: Float32Array, width: number, height: number, sigma: number): FlowField {
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = (dx: number, dy: number) => gray[(y + dy) * width + (x + dx)];
      gx[i] = -l(-1, -1) - 2 * l(-1, 0) - l(-1, 1) + l(1, -1) + 2 * l(1, 0) + l(1, 1);
      gy[i] = -l(-1, -1) - 2 * l(0, -1) - l(1, -1) + l(-1, 1) + 2 * l(0, 1) + l(1, 1);
    }
  }
  let sxx: Float32Array = new Float32Array(width * height);
  let sxy: Float32Array = new Float32Array(width * height);
  let syy: Float32Array = new Float32Array(width * height);
  for (let i = 0; i < gx.length; i++) {
    sxx[i] = gx[i] * gx[i];
    sxy[i] = gx[i] * gy[i];
    syy[i] = gy[i] * gy[i];
  }
  sxx = boxBlurField(sxx, width, height, sigma);
  sxy = boxBlurField(sxy, width, height, sigma);
  syy = boxBlurField(syy, width, height, sigma);

  const cos = new Float32Array(width * height);
  const sin = new Float32Array(width * height);
  const coherence = new Float32Array(width * height);
  for (let i = 0; i < sxx.length; i++) {
    const a = sxx[i];
    const b = sxy[i];
    const c = syy[i];
    const trace = a + c;
    const diff = Math.sqrt(Math.max(0, (a - c) * (a - c) + 4 * b * b));
    const l1 = (trace + diff) / 2;
    const l2 = (trace - diff) / 2;
    const gradAngle = 0.5 * Math.atan2(2 * b, a - c);
    const tangentAngle = gradAngle + Math.PI / 2;
    cos[i] = Math.cos(tangentAngle);
    sin[i] = Math.sin(tangentAngle);
    coherence[i] = l1 + l2 > 1e-6 ? (l1 - l2) / (l1 + l2) : 0;
  }
  return { cos, sin, coherence };
}

function smoothFlowField(field: FlowField, width: number, height: number, iterations: number): FlowField {
  let { cos, sin } = field;
  const coherence = field.coherence;
  const radius = 2;
  for (let it = 0; it < iterations; it++) {
    const nCos = new Float32Array(width * height);
    const nSin = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        let sumX = 0;
        let sumY = 0;
        const tx = cos[i];
        const ty = sin[i];
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = Math.min(width - 1, Math.max(0, x + dx));
            const yy = Math.min(height - 1, Math.max(0, y + dy));
            const j = yy * width + xx;
            const nx = cos[j];
            const ny = sin[j];
            const dot = tx * nx + ty * ny;
            const sign = dot >= 0 ? 1 : -1;
            const w = coherence[j] * sign;
            sumX += w * nx;
            sumY += w * ny;
          }
        }
        const len = Math.hypot(sumX, sumY) || 1;
        nCos[i] = sumX / len;
        nSin[i] = sumY / len;
      }
    }
    cos = nCos;
    sin = nSin;
  }
  return { cos, sin, coherence };
}

function applyXDoGField(
  gray: Float32Array,
  width: number,
  height: number,
  sigma: number,
  tau: number,
  phi: number,
): Float32Array {
  const g1 = boxBlurField(gray, width, height, sigma);
  const g2 = boxBlurField(gray, width, height, sigma * 1.6);
  const out = new Float32Array(width * height);
  for (let i = 0; i < g1.length; i++) {
    const d = g1[i] - tau * g2[i];
    const u = g1[i] > 1e-3 ? d / g1[i] : 0;
    out[i] = u >= 0 ? 1 : 1 + Math.tanh(phi * u);
  }
  return out;
}

function drawFlowHatch(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  baseLum: Float32Array,
  flow: FlowField,
  opts: FlowPortraitOptions,
) {
  const sensitivity = 1 + (opts.hatchIntensity - 50) / 100;
  const tiers = [
    { max: 230, density: 0 },
    { max: 185, density: 0.15 },
    { max: 140, density: 0.35 },
    { max: 95, density: 0.6 },
    { max: 45, density: 1 },
  ];
  const cellSize = 6;
  const strokeLen = 10;
  const stampR = Math.max(1, opts.lineWeight / 2);
  const fixedAngles = [Math.PI / 4, (Math.PI * 3) / 4];

  function stampInk(x: number, y: number) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dy = -stampR; dy <= stampR; dy++) {
      for (let dx = -stampR; dx <= stampR; dx++) {
        const xx = xi + Math.round(dx);
        const yy = yi + Math.round(dy);
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        if (dx * dx + dy * dy > stampR * stampR + 0.5) continue;
        const idx = (yy * width + xx) * 4;
        out[idx] = out[idx + 1] = out[idx + 2] = 0;
        out[idx + 3] = 255;
      }
    }
  }

  for (let cy = 0; cy < height; cy += cellSize) {
    for (let cx = 0; cx < width; cx += cellSize) {
      const px = Math.min(width - 1, cx + Math.floor(Math.random() * cellSize));
      const py = Math.min(height - 1, cy + Math.floor(Math.random() * cellSize));
      const i = py * width + px;
      const lum = baseLum[i];
      let tier = -1;
      for (let t = tiers.length - 1; t >= 0; t--) {
        if (lum <= tiers[t].max) {
          tier = t;
          break;
        }
      }
      if (tier <= 0) continue;
      const prob = tiers[tier].density * sensitivity;
      const strandCount = prob >= 1 ? 2 : Math.random() < prob ? 1 : 0;
      for (let s = 0; s < strandCount; s++) {
        const coh = flow.coherence[i];
        const flowAngle = Math.atan2(flow.sin[i], flow.cos[i]);
        const useFixed = fixedAngles[s % fixedAngles.length];
        const blend = Math.min(1, coh * 2) * opts.flowStrength;
        const angle =
          blend > 0.5
            ? flowAngle + (Math.random() - 0.5) * 0.25 * (1 - blend)
            : useFixed + (Math.random() - 0.5) * 0.3;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const half = strokeLen / 2;
        for (let t2 = -half; t2 <= half; t2 += 1) {
          stampInk(px + cosA * t2, py + sinA * t2);
        }
      }
    }
  }
}

/** Flow-guided classical portrait engine: bilateral pre-smoothing -> structure
 *  tensor -> Edge Tangent Flow -> XDoG outline layer + flow-guided tonal hatch
 *  layer, composited together. Resolution-capped and yields between stages so
 *  it never blocks the main thread. Parameter surface is deliberately small
 *  (8 values) so it stays practical to calibrate against a small reference set. */
export async function applyFlowPortraitEngine(
  imageData: ImageData,
  opts: FlowPortraitOptions = DEFAULT_FLOW_PORTRAIT_OPTIONS,
): Promise<ImageData> {
  const MAX_EDGE = 1200;
  const scale = Math.min(1, MAX_EDGE / Math.max(imageData.width, imageData.height));

  let work = imageData;
  if (scale < 1) {
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    srcCanvas.getContext("2d")!.putImageData(imageData, 0, 0);
    const workCanvas = document.createElement("canvas");
    workCanvas.width = Math.max(1, Math.round(imageData.width * scale));
    workCanvas.height = Math.max(1, Math.round(imageData.height * scale));
    const wctx = workCanvas.getContext("2d")!;
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = "high";
    wctx.drawImage(srcCanvas, 0, 0, workCanvas.width, workCanvas.height);
    work = wctx.getImageData(0, 0, workCanvas.width, workCanvas.height);
  }

  const { width, height } = work;
  const rawGray = grayFloat(work);
  await flowYield();

  const smoothed = bilateralSmooth(rawGray, width, height, 2);
  await flowYield();

  let flow = computeStructureTensor(smoothed, width, height, opts.structureSigma);
  await flowYield();
  flow = smoothFlowField(flow, width, height, opts.etfIterations);
  await flowYield();

  const xdog = applyXDoGField(smoothed, width, height, opts.edgeSigma, opts.tau, opts.phi);
  await flowYield();

  const out = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 3; i < out.length; i += 4) out[i] = 0;

  for (let i = 0, p = 0; p < xdog.length; i += 4, p++) {
    if (xdog[p] < 0.5) {
      out[i] = out[i + 1] = out[i + 2] = 0;
      out[i + 3] = 255;
    }
  }
  await flowYield();

  drawFlowHatch(out, width, height, smoothed, flow, opts);
  await flowYield();

  let result = new ImageData(out, width, height);
  result = bridgeGaps(result);

  if (scale < 1) {
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = width;
    smallCanvas.height = height;
    smallCanvas.getContext("2d")!.putImageData(result, 0, 0);
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = imageData.width;
    fullCanvas.height = imageData.height;
    const fctx = fullCanvas.getContext("2d")!;
    fctx.imageSmoothingEnabled = false;
    fctx.drawImage(smallCanvas, 0, 0, imageData.width, imageData.height);
    return fctx.getImageData(0, 0, imageData.width, imageData.height);
  }
  return result;
}

// --- Pipeline ---------------------------------------------------------------

export async function processStencil(
  sourceCanvas: HTMLCanvasElement,
  options: StencilOptions,
): Promise<HTMLCanvasElement> {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const ctx = outputCanvas.getContext("2d")!;
  ctx.drawImage(sourceCanvas, 0, 0);

  let imageData = ctx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);

  if (options.smoothing > 0) {
    imageData = applyGaussianBlur(imageData, options.smoothing);
  }

  // Edge mode switch — use edgeMode + edgeSensitivity when available
  switch (options.edgeMode) {
    case "sobel":
      imageData = applySobelEdge(imageData, options.edgeSensitivity ?? 65);
      break;

    case "canny":
      imageData = applyCannyEdge(imageData, options.edgeSensitivity ?? 65);
      break;

    case "combined":
      imageData = applyCombinedEdge(
        imageData,
        options.threshold ?? 128,
        options.edgeSensitivity ?? 65,
      );
      break;

    case "otsu":
      imageData = applyOtsuThreshold(imageData);
      break;

    case "hatch":
      imageData = await applyHatchRender(imageData, {
        intensity: options.edgeSensitivity ?? 65,
        baseSpacing: Math.max(2, 12 - options.lineThickness),
        stipple: true,
      });
      break;

    case "flow-portrait":
      imageData = await applyFlowPortraitEngine(imageData);
      break;

    case "threshold":
    default:
      imageData = applyThreshold(imageData, options.threshold ?? 128);
      break;
  }

  if (options.bridgeGaps) {
    imageData = bridgeGaps(imageData);
  }

  if (options.dilateErode && options.dilateErode !== 0) {
    imageData = applyDilateErode(imageData, options.dilateErode);
  }

  if (options.lineThickness > 1) {
    imageData = applyLineThickness(imageData, options.lineThickness);
  }

  if (options.noiseReduction > 0) {
    imageData = applyNoiseReduction(imageData, options.noiseReduction);
  }

  if (options.invertColors) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return outputCanvas;
}

/** Resolve preset + overrides into a full StencilOptions. */
export function resolvePreset(
  preset: StencilPreset,
  overrides: Partial<StencilOptions> = {},
): StencilOptions {
  return { ...DEFAULT_STENCIL_OPTIONS, ...STENCIL_PRESETS[preset], preset, ...overrides };
}

// --- SVG export -------------------------------------------------------------

/** Run-length encode black horizontal spans to SVG rects. */
export function canvasToSVG(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  let paths = "";

  for (let y = 0; y < height; y++) {
    let inBlack = false;
    let startX = 0;
    for (let x = 0; x <= width; x++) {
      const idx = (y * width + x) * 4;
      const isBlack = x < width && data[idx] < 128 && data[idx + 3] > 128;
      if (isBlack && !inBlack) {
        startX = x;
        inBlack = true;
      } else if (!isBlack && inBlack) {
        paths += `<rect x="${startX}" y="${y}" width="${x - startX}" height="1"/>`;
        inBlack = false;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n   <g fill="black">${paths}</g>\n </svg>`;
}

// --- Color layer separation -------------------------------------------------

export function separateColorLayers(imageData: ImageData, maxLayers = 5): ImageData[] {
  const data = imageData.data;
  const colorMap = new Map<string, number>();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = Math.round(data[i] / 32) * 32;
    const g = Math.round(data[i + 1] / 32) * 32;
    const b = Math.round(data[i + 2] / 32) * 32;
    const key = `${r},${g},${b}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  const topColors = [...colorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxLayers)
    .map(([key]) => key.split(",").map(Number));

  return topColors.map(([tr, tg, tb]) => {
    const layerData = new Uint8ClampedArray(data.length).fill(255);
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      if (r === tr && g === tg && b === tb) {
        layerData[i] = layerData[i + 1] = layerData[i + 2] = 0;
        layerData[i + 3] = 255;
      } else {
        layerData[i + 3] = 0;
      }
    }
    return new ImageData(layerData, imageData.width, imageData.height);
  });
}

// --- Physical size ----------------------------------------------------------

export function calculatePhysicalDimensions(
  pixelWidth: number,
  pixelHeight: number,
  dpi: number,
): { widthInches: number; heightInches: number; widthCm: number; heightCm: number } {
  const widthInches = pixelWidth / dpi;
  const heightInches = pixelHeight / dpi;
  return {
    widthInches: Math.round(widthInches * 10) / 10,
    heightInches: Math.round(heightInches * 10) / 10,
    widthCm: Math.round(widthInches * 2.54 * 10) / 10,
    heightCm: Math.round(heightInches * 2.54 * 10) / 10,
  };
}
