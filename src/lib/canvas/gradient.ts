/**
 * Gradient engine — linear + radial fills, and a Gradient Map color grader
 * (maps image luminance through a color ramp, à la Photoshop Gradient Map).
 */

export type RGB = { r: number; g: number; b: number };
export type Stop = { t: number; color: RGB; a?: number }; // t in 0..1
export type Gradient = { stops: Stop[] };

/* ---------- Color helpers ---------- */

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0");
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** Build a 256-entry LUT (RGBA) from a Gradient — used by gradient map. */
export function buildRampLUT(g: Gradient): Uint8ClampedArray {
  const stops = [...g.stops].sort((a, b) => a.t - b.t);
  if (stops.length === 0) stops.push({ t: 0, color: { r: 0, g: 0, b: 0 }, a: 255 });
  if (stops[0].t > 0) stops.unshift({ ...stops[0], t: 0 });
  if (stops[stops.length - 1].t < 1) stops.push({ ...stops[stops.length - 1], t: 1 });
  const lut = new Uint8ClampedArray(256 * 4);
  let si = 0;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    while (si < stops.length - 2 && stops[si + 1].t < t) si++;
    const s0 = stops[si],
      s1 = stops[si + 1];
    const span = Math.max(1e-6, s1.t - s0.t);
    const k = Math.min(1, Math.max(0, (t - s0.t) / span));
    const o = i * 4;
    lut[o] = clamp8(lerp(s0.color.r, s1.color.r, k));
    lut[o + 1] = clamp8(lerp(s0.color.g, s1.color.g, k));
    lut[o + 2] = clamp8(lerp(s0.color.b, s1.color.b, k));
    lut[o + 3] = clamp8(lerp(s0.a ?? 255, s1.a ?? 255, k));
  }
  return lut;
}

/* ---------- Fills (paint over ImageData) ---------- */

/** Alpha-composite a color (a in 0..255) over the pixel at index i. */
function over(dst: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) {
  const ia = a / 255;
  dst[i] = clamp8(dst[i] * (1 - ia) + r * ia);
  dst[i + 1] = clamp8(dst[i + 1] * (1 - ia) + g * ia);
  dst[i + 2] = clamp8(dst[i + 2] * (1 - ia) + b * ia);
  dst[i + 3] = clamp8(Math.max(dst[i + 3], a));
}

export function linearGradientFill(
  img: ImageData,
  g: Gradient,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opacity = 1,
): ImageData {
  const { width: w, height: h, data } = img;
  const dx = x1 - x0,
    dy = y1 - y0;
  const len2 = Math.max(1e-6, dx * dx + dy * dy);
  const lut = buildRampLUT(g);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = ((x - x0) * dx + (y - y0) * dy) / len2;
      const tc = Math.min(1, Math.max(0, t));
      const li = (tc * 255) | 0;
      const i = (y * w + x) * 4;
      over(data, i, lut[li * 4], lut[li * 4 + 1], lut[li * 4 + 2], lut[li * 4 + 3] * opacity);
    }
  }
  return img;
}

export function radialGradientFill(
  img: ImageData,
  g: Gradient,
  cx: number,
  cy: number,
  radius: number,
  opacity = 1,
): ImageData {
  const { width: w, height: h, data } = img;
  const r = Math.max(1, radius);
  const lut = buildRampLUT(g);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      const tc = Math.min(1, Math.max(0, d));
      const li = (tc * 255) | 0;
      const i = (y * w + x) * 4;
      over(data, i, lut[li * 4], lut[li * 4 + 1], lut[li * 4 + 2], lut[li * 4 + 3] * opacity);
    }
  }
  return img;
}

/* ---------- Gradient Map (color grading) ---------- */

/**
 * Photoshop-style Gradient Map: replace pixel color with lut[luma], preserving alpha.
 * Great for duotones, teal-orange, silver, gold, blue-carbon looks.
 */
export function gradientMap(img: ImageData, g: Gradient, mix = 1): ImageData {
  const { data } = img;
  const lut = buildRampLUT(g);
  const m = Math.min(1, Math.max(0, mix));
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
    const li = luma * 4;
    data[i] = clamp8(data[i] * (1 - m) + lut[li] * m);
    data[i + 1] = clamp8(data[i + 1] * (1 - m) + lut[li + 1] * m);
    data[i + 2] = clamp8(data[i + 2] * (1 - m) + lut[li + 2] * m);
  }
  return img;
}

/* ---------- Built-in gradient presets ---------- */

function grad(...pairs: [number, string][]): Gradient {
  return { stops: pairs.map(([t, hex]) => ({ t, color: hexToRgb(hex), a: 255 })) };
}

export const GRADIENT_PRESETS: { id: string; name: string; g: Gradient }[] = [
  { id: "bw", name: "B&W", g: grad([0, "#000000"], [1, "#ffffff"]) },
  {
    id: "purple-ink",
    name: "Purple Ink",
    g: grad([0, "#0d0620"], [0.5, "#7c3aed"], [1, "#f5e6ff"]),
  },
  {
    id: "teal-orange",
    name: "Teal/Orange",
    g: grad([0, "#0b3b52"], [0.5, "#1c8a7a"], [1, "#ffb457"]),
  },
  { id: "sepia", name: "Sepia", g: grad([0, "#2b1a08"], [0.5, "#8a5a2b"], [1, "#f4e2c4"]) },
  { id: "cyanotype", name: "Cyanotype", g: grad([0, "#001a33"], [0.5, "#1e6ba8"], [1, "#e6f2ff"]) },
  { id: "duotone-mag", name: "Magenta Duo", g: grad([0, "#1a012a"], [1, "#ff5fb0"]) },
  { id: "gold", name: "Gold", g: grad([0, "#1a1200"], [0.5, "#c9962a"], [1, "#fff0b3"]) },
  { id: "silver", name: "Silver", g: grad([0, "#0a0a0a"], [0.5, "#8a8f95"], [1, "#f2f5f8"]) },
  {
    id: "sunset",
    name: "Sunset",
    g: grad([0, "#1a0033"], [0.4, "#c02455"], [0.75, "#ff8a3d"], [1, "#ffe37a"]),
  },
  { id: "arctic", name: "Arctic", g: grad([0, "#0a1226"], [0.5, "#4a86e8"], [1, "#eaf6ff"]) },
  {
    id: "blue-carbon",
    name: "Blue Carbon",
    g: grad([0, "#0a0f2e"], [0.5, "#2b3a8c"], [1, "#f0f3ff"]),
  },
  { id: "noir", name: "Noir", g: grad([0, "#000000"], [0.85, "#2c2c30"], [1, "#f5f5f5"]) },
];
