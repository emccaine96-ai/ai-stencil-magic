/**
 * Magic Wand selection with contiguous scanline flood, plus Refine Edge
 * (expand/contract + feather) for clean stencil masking.
 */

export type WandResult = {
  mask: Uint8Array; // 0..255 (255 = fully selected)
  w: number;
  h: number;
  bounds: { x0: number; y0: number; x1: number; y1: number };
};

export function magicWand(
  img: ImageData,
  sx: number,
  sy: number,
  tolerance: number,
  contiguous = true,
  sampleAlpha = true,
): WandResult {
  const { width: w, height: h, data } = img;
  sx = Math.max(0, Math.min(w - 1, sx | 0));
  sy = Math.max(0, Math.min(h - 1, sy | 0));
  const mask = new Uint8Array(w * h);
  const at = (x: number, y: number) => (y * w + x) * 4;
  const sI = at(sx, sy);
  const tr = data[sI],
    tg = data[sI + 1],
    tb = data[sI + 2],
    ta = data[sI + 3];
  const tol2 = tolerance * tolerance * 3;

  const match = (i: number) => {
    if (sampleAlpha) {
      const da = data[i + 3] - ta;
      if (Math.abs(da) > tolerance * 2) return false;
    }
    const dr = data[i] - tr,
      dg = data[i + 1] - tg,
      db = data[i + 2] - tb;
    return dr * dr + dg * dg + db * db <= tol2;
  };

  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;

  if (!contiguous) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (match(at(x, y))) {
          mask[y * w + x] = 255;
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
  } else {
    // Scanline flood-fill (iterative, span-based)
    const stack: number[] = [sx, sy];
    while (stack.length) {
      const y = stack.pop()!,
        x = stack.pop()!;
      if (y < 0 || y >= h) continue;
      let lx = x;
      while (lx >= 0 && !mask[y * w + lx] && match(at(lx, y))) lx--;
      lx++;
      let above = false,
        below = false;
      while (lx < w && !mask[y * w + lx] && match(at(lx, y))) {
        mask[y * w + lx] = 255;
        if (lx < x0) x0 = lx;
        if (y < y0) y0 = y;
        if (lx > x1) x1 = lx;
        if (y > y1) y1 = y;
        if (y > 0) {
          const a = match(at(lx, y - 1)) && !mask[(y - 1) * w + lx];
          if (!above && a) {
            stack.push(lx, y - 1);
            above = true;
          } else if (above && !a) above = false;
        }
        if (y < h - 1) {
          const b = match(at(lx, y + 1)) && !mask[(y + 1) * w + lx];
          if (!below && b) {
            stack.push(lx, y + 1);
            below = true;
          } else if (below && !b) below = false;
        }
        lx++;
      }
    }
  }
  if (x1 < x0) {
    x0 = 0;
    y0 = 0;
    x1 = w - 1;
    y1 = h - 1;
  }
  return { mask, w, h, bounds: { x0, y0, x1, y1 } };
}

/** Expand (>0) or contract (<0) selection by N pixels, then feather by `feather` px. */
export function refineMask(r: WandResult, expand: number, feather: number): WandResult {
  let { mask } = r;
  const { w, h } = r;
  if (expand !== 0) mask = morph(mask, w, h, Math.abs(expand) | 0, expand > 0);
  if (feather > 0) mask = boxBlur(mask, w, h, Math.max(1, Math.round(feather)));
  return { mask, w, h, bounds: r.bounds };
}

export function invertMask(r: WandResult): WandResult {
  const out = new Uint8Array(r.mask.length);
  for (let i = 0; i < out.length; i++) out[i] = 255 - r.mask[i];
  return { mask: out, w: r.w, h: r.h, bounds: { x0: 0, y0: 0, x1: r.w - 1, y1: r.h - 1 } };
}

function morph(
  mask: Uint8Array,
  w: number,
  h: number,
  passes: number,
  dilate: boolean,
): Uint8Array {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8Array(cur.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = dilate ? 0 : 255;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const m = cur[yy * w + xx];
            v = dilate ? Math.max(v, m) : Math.min(v, m);
          }
        out[y * w + x] = v;
      }
    cur = out;
  }
  return cur;
}

/** Separable box blur on a single-channel mask. Two passes ≈ gaussian. */
function boxBlur(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const denom = 2 * r + 1;
  // horizontal
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += mask[y * w + Math.max(0, Math.min(w - 1, k))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / denom;
      const lo = Math.max(0, Math.min(w - 1, x - r));
      const hi = Math.max(0, Math.min(w - 1, x + r + 1));
      acc += mask[y * w + hi] - mask[y * w + lo];
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / denom;
      const lo = Math.max(0, Math.min(h - 1, y - r));
      const hi = Math.max(0, Math.min(h - 1, y + r + 1));
      acc += tmp[hi * w + x] - tmp[lo * w + x];
    }
  }
  const o = new Uint8Array(w * h);
  for (let i = 0; i < o.length; i++) o[i] = Math.round(out[i]);
  return o;
}

/** Visual overlay canvas — cyan tint with marching-ants-ready edges. */
export function maskToOverlayCanvas(
  mask: Uint8Array,
  w: number,
  h: number,
  hex = "#00F5D4",
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i];
    if (!a) continue;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(a * 0.35);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Convert mask → grayscale canvas usable as a destination-in alpha mask. */
export function maskToAlphaCanvas(mask: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < mask.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = mask[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
