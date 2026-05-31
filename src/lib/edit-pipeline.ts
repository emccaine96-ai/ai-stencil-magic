// 10-knob real-time stencil editor — pure client-side canvas.
//
// Input: the generated purple-on-white stencil dataURL.
// Output: a re-rendered dataURL reflecting the current knob state.
//
// The original stencil dataURL is never mutated. Knobs are 0..100.

export type Knobs = {
  contrast: number;       // 1. threshold cutoff
  thickness: number;      // 2. erosion / dilation
  detail: number;         // 3. sobel sensitivity (re-extract micro edges)
  smoothing: number;      // 4. gaussian pre-blur
  shadowDepth: number;    // 5. dark gamma
  midtone: number;        // 6. midtone bezier squeeze
  highlights: number;     // 7. highlight clamp
  sharpness: number;      // 8. unsharp mask blend
  grain: number;          // 9. paper texture alpha
  intensity: number;      // 10. ink tint lerp (faded -> deep)
};

export const DEFAULT_KNOBS: Knobs = {
  contrast: 50, thickness: 50, detail: 50, smoothing: 0,
  shadowDepth: 50, midtone: 50, highlights: 50, sharpness: 50,
  grain: 0, intensity: 50,
};

// Reused offscreen canvases live for the lifetime of the page.
let work: HTMLCanvasElement | null = null;
let scratch: HTMLCanvasElement | null = null;
let grainTile: HTMLCanvasElement | null = null;

function getCanvas(ref: "work" | "scratch", w: number, h: number) {
  const c = ref === "work" ? (work ??= document.createElement("canvas")) : (scratch ??= document.createElement("canvas"));
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

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

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
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; sum += v; }
  for (let i = 0; i < len; i++) k[i] /= sum;

  // Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0;
      for (let i = -r; i <= r; i++) {
        const xi = Math.min(w - 1, Math.max(0, x + i));
        const o = (y * w + xi) * 4;
        const wt = k[i + r];
        rs += src[o] * wt; gs += src[o + 1] * wt; bs += src[o + 2] * wt;
      }
      const d = (y * w + x) * 4;
      tmp[d] = rs; tmp[d + 1] = gs; tmp[d + 2] = bs; tmp[d + 3] = src[d + 3];
    }
  }
  // Vertical
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0;
      for (let i = -r; i <= r; i++) {
        const yi = Math.min(h - 1, Math.max(0, y + i));
        const o = (yi * w + x) * 4;
        const wt = k[i + r];
        rs += tmp[o] * wt; gs += tmp[o + 1] * wt; bs += tmp[o + 2] * wt;
      }
      const d = (y * w + x) * 4;
      out[d] = rs; out[d + 1] = gs; out[d + 2] = bs; out[d + 3] = tmp[d + 3];
    }
  }
  return new ImageData(out, w, h);
}

// Morphological dilate (grow ink = thicker) or erode (shrink ink = thinner).
// Mask: 1 = ink. Operates on a binary mask in-place via a temp buffer.
function morph(mask: Uint8Array, w: number, h: number, radius: number, mode: "dilate" | "erode"): Uint8Array {
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
          if (mode === "dilate") { if (m) { v = 1; dy = r + 1; break; } }
          else { if (!m) { v = 0; dy = r + 1; break; } }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function unsharp(data: ImageData, blurred: ImageData, amount: number) {
  const a = data.data, b = blurred.data;
  for (let i = 0; i < a.length; i += 4) {
    a[i]     = Math.max(0, Math.min(255, a[i]     + (a[i]     - b[i])     * amount));
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
    return [Math.round(lerp(0xD8, 0xA8, k)), Math.round(lerp(0xB4, 0x55, k)), Math.round(lerp(0xFE, 0xF7, k))];
  }
  const k = (t - 0.5) / 0.5;
  return [Math.round(lerp(0xA8, 0x6B, k)), Math.round(lerp(0x55, 0x21, k)), Math.round(lerp(0xF7, 0xA8, k))];
}

export async function composeStencil(srcDataUrl: string, knobs: Knobs, signal?: { cancelled: boolean }): Promise<string> {
  const img = await loadImage(srcDataUrl);
  if (signal?.cancelled) throw new Error("cancelled");
  // Work at a stable resolution so the pipeline is fast and consistent.
  const W = Math.min(img.width, 1024);
  const H = Math.round((W / img.width) * img.height);

  const c = getCanvas("work", W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  let data = ctx.getImageData(0, 0, W, H);

  // 4. Pre-smoothing (gaussian) — keeps speckle off subsequent edges.
  if (knobs.smoothing > 0) {
    data = gaussianBlur(data, (knobs.smoothing / 100) * 8);
  }

  // Compute luminance & ink-distance for every pixel.
  const px = data.data;
  const lum = new Float32Array(W * H);
  const dist = new Float32Array(W * H);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    lum[j] = 0.299 * r + 0.587 * g + 0.114 * b;
    dist[j] = (255 - r) + (255 - g) + (255 - b);
  }

  // 5. Shadow depth — push dark pixels harder toward ink.
  //    Gamma curve applied to luminance for shadow band only.
  if (knobs.shadowDepth !== 50) {
    const gamma = 1 + ((50 - knobs.shadowDepth) / 50) * 1.4; // 50 = neutral, 100 = aggressive darken
    for (let j = 0; j < lum.length; j++) {
      if (lum[j] < 76) lum[j] = 255 * Math.pow(lum[j] / 255, gamma);
    }
  }

  // 6. Midtone Bezier squeeze on 33..66% luminance.
  if (knobs.midtone !== 50) {
    const k = (knobs.midtone - 50) / 50; // -1..+1
    for (let j = 0; j < lum.length; j++) {
      const L = lum[j];
      if (L >= 84 && L <= 168) {
        const t = (L - 84) / 84;       // 0..1 across midband
        const bez = t * t * (3 - 2 * t); // smoothstep
        lum[j] = L + (bez - t) * 60 * k;
      }
    }
  }

  // 7. Highlights suppression — compress >80% luminance downward.
  if (knobs.highlights > 50) {
    const k = (knobs.highlights - 50) / 50; // 0..1
    for (let j = 0; j < lum.length; j++) {
      if (lum[j] > 204) lum[j] = lum[j] - (lum[j] - 204) * k * 0.6;
    }
  }

  // 1. Contrast / threshold cutoff -> binary ink mask.
  //    Use distance-from-white (purple ink is luminance ~128 so luminance alone fails).
  const baseCut = 35 - (knobs.contrast - 50) * 0.5; // ~60..10
  const detailBias = (knobs.detail - 50) / 50;       // -1..+1, lowers cutoff to admit more edges
  const cut = Math.max(4, baseCut - detailBias * 18);

  let mask: Uint8Array = new Uint8Array(W * H);
  for (let j = 0; j < mask.length; j++) {
    // Lum modulation: pixels darkened by shadowDepth get a small bonus to ink.
    const lumBonus = lum[j] < 76 ? (76 - lum[j]) * 0.3 : 0;
    mask[j] = dist[j] + lumBonus > cut ? 1 : 0;
  }

  // 2. Line thickness — morphological dilate (>50) or erode (<50) on the mask.
  if (knobs.thickness !== 50) {
    const t = (knobs.thickness - 50) / 50; // -1..+1
    const radius = Math.round(Math.abs(t) * 5);
    if (radius > 0) {
      mask = morph(mask, W, H, radius, t > 0 ? "dilate" : "erode");
    }
  }

  // Paint the mask back as ink-or-white.
  const [ir, ig, ib] = inkColor(knobs.intensity); // 10. thermal intensity
  for (let j = 0, i = 0; j < mask.length; j++, i += 4) {
    if (mask[j]) {
      px[i] = ir; px[i + 1] = ig; px[i + 2] = ib; px[i + 3] = 255;
    } else {
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);

  // 8. Unsharp mask — sharpen the inked output.
  if (knobs.sharpness !== 50) {
    const amount = ((knobs.sharpness - 50) / 50) * 0.9; // -0.9..+0.9
    if (Math.abs(amount) > 0.02) {
      const cur = ctx.getImageData(0, 0, W, H);
      const blurred = gaussianBlur(cur, 1.4);
      unsharp(cur, blurred, amount);
      ctx.putImageData(cur, 0, 0);
    }
  }

  // 9. Paper grain overlay.
  if (knobs.grain > 0) {
    const tile = getGrainTile();
    ctx.save();
    ctx.globalAlpha = (knobs.grain / 100) * 0.4;
    ctx.globalCompositeOperation = "multiply";
    const pat = ctx.createPattern(tile, "repeat");
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  if (signal?.cancelled) throw new Error("cancelled");
  return c.toDataURL("image/png");
}