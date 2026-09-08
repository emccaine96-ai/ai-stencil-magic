/**
 * Touch-Up Studio — tone curve LUT (natural cubic spline through control
 * nodes). Taken as-is from the reviewed code bundle — verified correct
 * standard natural-cubic-spline interpolation, no changes needed.
 */
export interface CurveNode { x: number; y: number; }

export function buildToneCurveLUT(nodes: CurveNode[]): Uint8Array {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  const lut = new Uint8Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }

  const h = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) h[i] = sorted[i + 1].x - sorted[i].x;

  const alpha = new Array(n - 1).fill(0);
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (sorted[i + 1].y - sorted[i].y) - (3 / h[i - 1]) * (sorted[i].y - sorted[i - 1].y);
  }
  const l = new Array(n).fill(1), mu = new Array(n).fill(0), z = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (sorted[i + 1].x - sorted[i - 1].x) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  const c = new Array(n).fill(0), b = new Array(n).fill(0), d = new Array(n).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (sorted[j + 1].y - sorted[j].y) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    if (seg < n - 2 && x > sorted[seg + 1].x) seg++;
    const dx = x - sorted[seg].x;
    const v = sorted[seg].y + b[seg] * dx + c[seg] * dx * dx + d[seg] * dx * dx * dx;
    lut[x] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return lut;
}

export const CURVE_PRESETS: Record<string, CurveNode[]> = {
  standard: [{ x: 0, y: 0 }, { x: 127, y: 127 }, { x: 255, y: 255 }],
  soft: [{ x: 0, y: 20 }, { x: 127, y: 130 }, { x: 255, y: 235 }],
  highContrast: [{ x: 0, y: 0 }, { x: 96, y: 60 }, { x: 160, y: 195 }, { x: 255, y: 255 }],
  // Binarization-oriented preset: pushes shadows toward pure black and
  // highlights toward pure white with a steep midtone transition, without
  // being a literal hard step function (that would alias badly on real
  // photos) — near-binary output while staying a smooth curve.
  stencilPunch: [{ x: 0, y: 0 }, { x: 60, y: 8 }, { x: 128, y: 128 }, { x: 195, y: 247 }, { x: 255, y: 255 }],
};

/** Apply a precomputed LUT to ink density (alpha). RGB and transparent bg untouched. */
export function applyLutToAlpha(src: ImageData, lut: Uint8Array): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  for (let i = 3; i < d.length; i += 4) d[i] = lut[d[i]];
  return out;
}
