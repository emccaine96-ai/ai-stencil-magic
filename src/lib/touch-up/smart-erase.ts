/**
 * Smart Erase — a pre-generation exclusion mask.
 *
 * The mask is a separate, additively-stored data layer: source photo pixels
 * are NEVER modified. Painted regions are excluded from line extraction on
 * the next regenerate, using the same "zero the ink" pattern that
 * backgroundMode already applies in both engines.
 */

export interface ExclusionMask {
  width: number;
  height: number;
  data: Uint8Array; // 1 = excluded from generation, 0 = included, one byte per pixel
}

export function createEmptyMask(w: number, h: number): ExclusionMask {
  return { width: w, height: h, data: new Uint8Array(w * h) };
}

export function paintExclusion(
  mask: ExclusionMask,
  cx: number,
  cy: number,
  radius: number,
  erase = false,
) {
  const r = Math.max(1, Math.round(radius));
  const r2 = r * r;
  const x0 = Math.max(0, Math.round(cx) - r);
  const x1 = Math.min(mask.width, Math.round(cx) + r + 1);
  const y0 = Math.max(0, Math.round(cy) - r);
  const y1 = Math.min(mask.height, Math.round(cy) + r + 1);
  const val = erase ? 0 : 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) mask.data[y * mask.width + x] = val;
    }
  }
}

export function maskHasPaint(mask: ExclusionMask): boolean {
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) return true;
  return false;
}

/** Nearest-neighbor resize so a photo-sized mask matches engine workW×workH. */
export function resizeMask(mask: ExclusionMask, dw: number, dh: number): ExclusionMask {
  if (mask.width === dw && mask.height === dh) {
    return { width: dw, height: dh, data: mask.data };
  }
  const out = new Uint8Array(dw * dh);
  const sw = mask.width;
  const sh = mask.height;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      out[y * dw + x] = mask.data[sy * sw + sx];
    }
  }
  return { width: dw, height: dh, data: out };
}

/**
 * Zero ink where the mask is painted. `ink` is a packed 1-byte-per-pixel
 * layer (the same shape backgroundMode already consumes). Mutates in place.
 */
export function applyExclusionToInk(ink: Uint8ClampedArray | Uint8Array, mask: ExclusionMask | Uint8Array): void {
  const data = mask instanceof Uint8Array ? mask : mask.data;
  const n = Math.min(ink.length, data.length);
  for (let i = 0; i < n; i++) {
    if (data[i]) ink[i] = 0;
  }
}

/** Draw the exclusion mask as a translucent red overlay (visual only). */
export function renderMaskOverlay(ctx: CanvasRenderingContext2D, mask: ExclusionMask) {
  const { width: w, height: h, data } = mask;
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  const img = ctx.createImageData(w, h);
  const out = img.data;
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    if (data[i]) {
      out[p] = 214;
      out[p + 1] = 40;
      out[p + 2] = 40;
      out[p + 3] = 110;
    }
  }
  ctx.putImageData(img, 0, 0);
}
