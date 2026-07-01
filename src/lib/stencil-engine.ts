// Core stencil processing engine — additive module. Does NOT modify the
// AI stencil generation pipeline; these are pure client-side post-process
// helpers callable from the vault editor / export flows.

export interface StencilOptions {
  threshold: number;        // 0-255, default 128
  edgeSensitivity: number;  // 0-100, default 50
  lineThickness: number;    // 1-10, default 2
  noiseReduction: number;   // 0-10, default 3
  smoothing: number;        // 0-10, default 3
  invertColors: boolean;    // default false
  preset: StencilPreset;
}

export type StencilPreset =
  | "tattoo"
  | "streetart"
  | "fineline"
  | "craft"
  | "bold"
  | "procreate"
  | "custom";

export const STENCIL_PRESETS: Record<StencilPreset, Partial<StencilOptions>> = {
  tattoo:    { threshold: 140, edgeSensitivity: 70, lineThickness: 2, noiseReduction: 4, smoothing: 4 },
  streetart: { threshold: 110, edgeSensitivity: 40, lineThickness: 5, noiseReduction: 2, smoothing: 2 },
  fineline:  { threshold: 160, edgeSensitivity: 90, lineThickness: 1, noiseReduction: 5, smoothing: 6 },
  craft:     { threshold: 120, edgeSensitivity: 50, lineThickness: 4, noiseReduction: 3, smoothing: 3 },
  bold:      { threshold: 100, edgeSensitivity: 30, lineThickness: 8, noiseReduction: 2, smoothing: 1 },
  procreate: { threshold: 150, edgeSensitivity: 80, lineThickness: 1, noiseReduction: 6, smoothing: 7 },
  custom:    { threshold: 128, edgeSensitivity: 50, lineThickness: 2, noiseReduction: 3, smoothing: 3 },
};

export const DEFAULT_STENCIL_OPTIONS: StencilOptions = {
  threshold: 128,
  edgeSensitivity: 50,
  lineThickness: 2,
  noiseReduction: 3,
  smoothing: 3,
  invertColors: false,
  preset: "custom",
};

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

/** Sobel edge detector — outline extraction. */
export function applySobelEdge(imageData: ImageData, sensitivity: number): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const output = new Uint8ClampedArray(src.length);
  const scale = sensitivity / 100;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const getGray = (dx: number, dy: number) => {
        const i = ((y + dy) * width + (x + dx)) * 4;
        return src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
      };
      const gx =
        -getGray(-1, -1) - 2 * getGray(-1, 0) - getGray(-1, 1) +
         getGray(1, -1) + 2 * getGray(1, 0) + getGray(1, 1);
      const gy =
        -getGray(-1, -1) - 2 * getGray(0, -1) - getGray(1, -1) +
         getGray(-1, 1) + 2 * getGray(0, 1) + getGray(1, 1);
      const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy) * scale);
      const val = magnitude > 30 ? 0 : 255;
      output[idx] = output[idx + 1] = output[idx + 2] = val;
      output[idx + 3] = val === 0 ? 255 : 0;
    }
  }
  return new ImageData(output, width, height);
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
        const yy = y + dy; if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const xx = x + dx; if (xx < 0 || xx >= width) continue;
          if (src[(yy * width + xx) * 4] === 0) { hit = true; break; }
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

  if (options.edgeSensitivity > 60) {
    imageData = applySobelEdge(imageData, options.edgeSensitivity);
  } else {
    imageData = applyThreshold(imageData, options.threshold);
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
      if (isBlack && !inBlack) { startX = x; inBlack = true; }
      else if (!isBlack && inBlack) {
        paths += `<rect x="${startX}" y="${y}" width="${x - startX}" height="1"/>`;
        inBlack = false;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g fill="black">${paths}</g>
</svg>`;
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