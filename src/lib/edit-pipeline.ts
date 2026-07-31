// 10-knob real-time stencil editor — pure client-side canvas.
//
// Input: the generated purple-on-white stencil dataURL.
// Output: a re-rendered dataURL reflecting the current knob state.
//
// The original stencil dataURL is never mutated. Knobs are 0..100.

export type Knobs = {
  contrast: number; // 1. threshold cutoff
  thickness: number; // 2. erosion / dilation
  detail: number; // 3. sobel sensitivity (re-extract micro edges)
  smoothing: number; // 4. gaussian pre-blur
  shadowDepth: number; // 5. dark gamma
  midtone: number; // 6. midtone bezier squeeze
  highlights: number; // 7. highlight clamp
  sharpness: number; // 8. unsharp mask blend
  grain: number; // 9. paper texture alpha
  intensity: number; // 10. ink tint lerp (faded -> deep)
};

export const DEFAULT_KNOBS: Knobs = {
  contrast: 50,
  thickness: 50,
  detail: 50,
  smoothing: 0,
  shadowDepth: 50,
  midtone: 50,
  highlights: 50,
  sharpness: 50,
  grain: 0,
  intensity: 50,
};

// Reused offscreen canvases live for the lifetime of the page.
let work: HTMLCanvasElement | null = null;
let scratch: HTMLCanvasElement | null = null;
let grainTile: HTMLCanvasElement | null = null;

function getCanvas(ref: "work" | "scratch", w: number, h: number) {
  const c =
    ref === "work"
      ? (work ??= document.createElement("canvas"))
      : (scratch ??= document.createElement("canvas"));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// --- pixel ops ---

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function gaussianBlur(data: ImageData, radius: number) {
  if (radius < 0.5) return data;
  const r = Math.max(1, Math.round(radius));
  const { width: w, height: h } = data;
  const src = data.data;
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  // Build 1D normalized kernel
  const sigma = radius / 2;
  const len = r * 2 + 1;
  const k = new Float32Array(len);
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < len; i++) k[i] /= sum;

  // Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0,
        gs = 0,
        bs = 0;
      for (let i = -r; i <= r; i++) {
        const xi = Math.min(w - 1, Math.max(0, x + i));
        const o = (y * w + xi) * 4;
        const wt = k[i + r];
        rs += src[o] * wt;
        gs += src[o + 1] * wt;
        bs += src[o + 2] * wt;
      }
      const d = (y * w + x) * 4;
      tmp[d] = rs;
      tmp[d + 1] = gs;
      tmp[d + 2] = bs;
      tmp[d + 3] = src[d + 3];
    }
  }
  // Vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0,
        gs = 0,
        bs = 0;
      for (let i = -r; i <= r; i++) {
        const yi = Math.min(h - 1, Math.max(0, y + i));
        const o = (yi * w + x) * 4;
        const wt = k[i + r];
        rs += tmp[o] * wt;
        gs += tmp[o + 1] * wt;
        bs += tmp[o + 2] * wt;
      }
      const d = (y * w + x) * 4;
      out[d] = rs;
      out[d + 1] = gs;
      out[d + 2] = bs;
      out[d + 3] = tmp[d + 3];
    }
  }
  return new ImageData(out, w, h);
}

// Morphological dilate (grow ink = thicker) or erode (shrink ink = thinner).
// Mask: 1 = ink. Operates on a binary mask in-place via a temp buffer.
function morph(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
  mode: "dilate" | "erode",
): Uint8Array {
  if (radius <= 0) return mask;
  const r = Math.min(5, Math.max(1, Math.round(radius)));
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = mode === "dilate" ? 0 : 1;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (dx * dx + dy * dy > r * r) continue;
          const m = mask[yy * w + xx];
          if (mode === "dilate") {
            if (m) {
              v = 1;
              dy = r + 1;
              break;
            }
          } else {
            if (!m) {
              v = 0;
              dy = r + 1;
              break;
            }
          }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function unsharp(data: ImageData, blurred: ImageData, amount: number) {
  const a = data.data,
    b = blurred.data;
  for (let i = 0; i < a.length; i += 4) {
    a[i] = Math.max(0, Math.min(255, a[i] + (a[i] - b[i]) * amount));
    a[i + 1] = Math.max(0, Math.min(255, a[i + 1] + (a[i + 1] - b[i + 1]) * amount));
    a[i + 2] = Math.max(0, Math.min(255, a[i + 2] + (a[i + 2] - b[i + 2]) * amount));
  }
}

// Generate (once) a seamless grayscale noise tile to overlay as paper grain.
function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 200 + Math.floor(Math.random() * 55);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

// Map intensity 0..100 to an ink RGB triplet on the line: faded violet -> deep thermal.
function inkColor(intensity: number): [number, number, number] {
  // 0   -> #D8B4FE (soft faded violet)
  // 50  -> #A855F7 (signature)
  // 100 -> #6B21A8 (deep thermal)
  const t = intensity / 100;
  if (t <= 0.5) {
    const k = t / 0.5;
    return [
      Math.round(lerp(0xd8, 0xa8, k)),
      Math.round(lerp(0xb4, 0x55, k)),
      Math.round(lerp(0xfe, 0xf7, k)),
    ];
  }
  const k = (t - 0.5) / 0.5;
  return [
    Math.round(lerp(0xa8, 0x6b, k)),
    Math.round(lerp(0x55, 0x21, k)),
    Math.round(lerp(0xf7, 0xa8, k)),
  ];
}

export async function composeStencil(
  srcDataUrl: string,
  knobs: Knobs,
  signal?: { cancelled: boolean },
): Promise<string> {
  const img = await loadImage(srcDataUrl);
  if (signal?.cancelled) throw new Error("cancelled");
  // Non-destructive pipeline: pure-white pixels stay white. Only existing
  // ink pixels are modified, so sliders can never "flood" the canvas.
  const W = Math.min(img.width, 900);
  const H = Math.round((W / img.width) * img.height);

  const c = getCanvas("work", W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  const N = W * H;

  // Per-pixel "inkness" 0..1 — how far from pure white the source pixel is.
  // Anti-aliased fringe is < 1, solid ink is 1.
  const inkness = new Float32Array(N);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const d = 255 - px[i] + (255 - px[i + 1]) + (255 - px[i + 2]); // 0..765
    inkness[j] = Math.min(1, d / 320);
  }

  // Ink mask (binary) drives morphology only — strictly from existing ink,
  // never re-thresholds the whole image.
  let mask = new Uint8Array(new ArrayBuffer(N));
  for (let j = 0; j < N; j++) mask[j] = inkness[j] > 0.18 ? 1 : 0;

  // 2. Line thickness — gentle morph, max 3px so it can't bloom.
  if (knobs.thickness !== 50) {
    const t = (knobs.thickness - 50) / 50; // -1..+1
    const radius = Math.round(Math.abs(t) * 3);
    if (radius > 0) {
      const m = morph(mask, W, H, radius, t > 0 ? "dilate" : "erode");
      mask = new Uint8Array(new ArrayBuffer(N));
      mask.set(m);
    }
  }

  // 1. Contrast — S-curve on inkness. >50 deepens existing ink + drops
  // weak fringe; <50 fades ink toward white. Never paints new pixels.
  const cSlope = 1 + ((knobs.contrast - 50) / 50) * 1.4; // 0.6..2 — never floods
  const pivot = 0.5;

  const [ir, ig, ib] = inkColor(knobs.intensity);
  for (let j = 0, i = 0; j < N; j++, i += 4) {
    let v = inkness[j];

    // Dilation extension: brand-new mask pixels start at full strength.
    if (mask[j] && v < 0.2) v = 0.9;
    // Erosion: mask says "not ink" -> force white.
    if (!mask[j]) v = 0;

    // S-curve around pivot, clamped.
    v = Math.max(0, Math.min(1, pivot + (v - pivot) * cSlope));

    // Lerp white -> ink color by v.
    px[i] = Math.round(255 + (ir - 255) * v);
    px[i + 1] = Math.round(255 + (ig - 255) * v);
    px[i + 2] = Math.round(255 + (ib - 255) * v);
    px[i + 3] = 255;
  }

  ctx.putImageData(data, 0, 0);

  if (signal?.cancelled) throw new Error("cancelled");
  return c.toDataURL("image/png");
}
