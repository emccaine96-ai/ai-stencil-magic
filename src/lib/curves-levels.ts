/**
 * Curves & Levels — LUT builders, presets, and channel-respecting application.
 * Designed for stencil prep: pre-thresholding contrast shaping.
 */

export type CurvePoint = { x: number; y: number }; // both 0..255

export type LevelsParams = {
  inBlack: number;    // 0..255
  inWhite: number;    // 0..255
  gamma: number;      // 0.1..3
  outBlack: number;   // 0..255
  outWhite: number;   // 0..255
};

/** Piecewise-linear LUT through ordered control points. */
export function buildCurveLUT(points: CurvePoint[]): Uint8ClampedArray {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts[0].x > 0) pts.unshift({ x: 0, y: pts[0].y });
  if (pts[pts.length - 1].x < 255) pts.push({ x: 255, y: pts[pts.length - 1].y });
  const lut = new Uint8ClampedArray(256);
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < pts.length - 2 && x > pts[seg + 1].x) seg++;
    const a = pts[seg], b = pts[seg + 1];
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    lut[x] = a.y + (b.y - a.y) * t;
  }
  return lut;
}

export function buildLevelsLUT(p: LevelsParams): Uint8ClampedArray {
  const range = Math.max(1, p.inWhite - p.inBlack);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let n = (i - p.inBlack) / range;
    n = Math.max(0, Math.min(1, n));
    n = Math.pow(n, 1 / Math.max(0.01, p.gamma));
    lut[i] = Math.round(p.outBlack + n * (p.outWhite - p.outBlack));
  }
  return lut;
}

/** Apply an RGB LUT in-place; optional 0..255 soft mask restricts the effect. */
export function applyLUT(img: ImageData, lut: Uint8ClampedArray, mask?: Uint8Array): ImageData {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  const d = out.data;
  if (!mask) {
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i+1] = lut[d[i+1]]; d[i+2] = lut[d[i+2]]; }
  } else {
    for (let i = 0, m = 0; i < d.length; i += 4, m++) {
      const w = mask[m] / 255;
      if (w <= 0) continue;
      d[i]   = d[i]   * (1 - w) + lut[d[i]]   * w;
      d[i+1] = d[i+1] * (1 - w) + lut[d[i+1]] * w;
      d[i+2] = d[i+2] * (1 - w) + lut[d[i+2]] * w;
    }
  }
  return out;
}

/** 256-bin luma histogram, normalized 0..1 for display. */
export function lumaHistogram(img: ImageData): Float32Array {
  const hist = new Uint32Array(256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) | 0;
    hist[y]++;
  }
  let max = 1;
  for (let i = 0; i < 256; i++) if (hist[i] > max) max = hist[i];
  const out = new Float32Array(256);
  for (let i = 0; i < 256; i++) out[i] = hist[i] / max;
  return out;
}

/** Stencil-oriented curve presets. */
export const CURVES_PRESETS: Record<string, CurvePoint[]> = {
  "Linear":         [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  "Stencil Clean":  [{ x: 0, y: 0 }, { x: 95, y: 15 }, { x: 165, y: 240 }, { x: 255, y: 255 }],
  "Line Sharpen":   [{ x: 0, y: 0 }, { x: 64, y: 38 }, { x: 128, y: 128 }, { x: 192, y: 225 }, { x: 255, y: 255 }],
  "High Contrast":  [{ x: 0, y: 0 }, { x: 110, y: 28 }, { x: 145, y: 228 }, { x: 255, y: 255 }],
  "Lift Shadows":   [{ x: 0, y: 28 }, { x: 128, y: 140 }, { x: 255, y: 255 }],
  "Crush Whites":   [{ x: 0, y: 0 }, { x: 180, y: 200 }, { x: 255, y: 255 }],
  "Tattoo Pre-Print":[{ x: 0, y: 0 }, { x: 70, y: 10 }, { x: 110, y: 90 }, { x: 180, y: 245 }, { x: 255, y: 255 }],
};

export const LEVELS_PRESETS: Record<string, LevelsParams> = {
  "Default":        { inBlack: 0,   inWhite: 255, gamma: 1.00, outBlack: 0, outWhite: 255 },
  "Stencil Clean":  { inBlack: 60,  inWhite: 200, gamma: 0.85, outBlack: 0, outWhite: 255 },
  "Line Sharpen":   { inBlack: 40,  inWhite: 220, gamma: 1.10, outBlack: 0, outWhite: 255 },
  "Dark Punch":     { inBlack: 80,  inWhite: 255, gamma: 0.70, outBlack: 0, outWhite: 255 },
  "Faded Reference":{ inBlack: 20,  inWhite: 200, gamma: 1.30, outBlack: 0, outWhite: 240 },
};
