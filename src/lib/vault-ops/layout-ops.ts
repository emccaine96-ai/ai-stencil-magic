// Pure layout operations for the Vault editor: crop, resize, border, frame.
// Every function takes ImageData and returns a NEW ImageData (never mutates the input).

import { resize as lanczosResize } from "./image-ops";

function make(w: number, h: number): ImageData {
  if (typeof ImageData !== "undefined") return new ImageData(w, h);
  return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: "srgb" } as ImageData;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Fit a rectangle into the image. The requested size is kept where possible: an origin that would
 * push the rectangle off the edge slides it back inside instead of shrinking it to a sliver.
 */
export function clampRect(r: CropRect, srcW: number, srcH: number): CropRect {
  const w = Math.min(Math.max(1, Math.round(r.w) || 1), srcW);
  const h = Math.min(Math.max(1, Math.round(r.h) || 1), srcH);
  const x = Math.min(Math.max(0, Math.round(r.x) || 0), srcW - w);
  const y = Math.min(Math.max(0, Math.round(r.y) || 0), srcH - h);
  return { x, y, w, h };
}

/** Largest centred rectangle with the given aspect ratio (w/h) that fits inside the image. */
export function centeredAspectRect(srcW: number, srcH: number, aspect: number): CropRect {
  let w = srcW;
  let h = Math.round(srcW / aspect);
  if (h > srcH) {
    h = srcH;
    w = Math.round(srcH * aspect);
  }
  return clampRect({ x: (srcW - w) / 2, y: (srcH - h) / 2, w, h }, srcW, srcH);
}

export function cropImageData(src: ImageData, rect: CropRect): ImageData {
  const r = clampRect(rect, src.width, src.height);
  const out = make(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * src.width + r.x) * 4;
    out.data.set(src.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return out;
}

/** Resize with Lanczos. Dimensions are clamped to 1..maxSide (default 8192). */
export function resizeImageData(src: ImageData, w: number, h: number, maxSide = 8192): ImageData {
  const tw = Math.min(maxSide, Math.max(1, Math.round(w)));
  const th = Math.min(maxSide, Math.max(1, Math.round(h)));
  return lanczosResize(src, tw, th, "lanczos3");
}

function parseColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [13, 13, 15];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paint a solid border INSIDE the image bounds (canvas size unchanged). */
export function borderImageData(src: ImageData, thickness: number, color: string): ImageData {
  const out = make(src.width, src.height);
  out.data.set(src.data);
  const t = Math.max(0, Math.min(Math.round(thickness), Math.floor(Math.min(src.width, src.height) / 2)));
  if (!t) return out;
  const [r, g, b] = parseColor(color);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (x < t || y < t || x >= src.width - t || y >= src.height - t) {
        const i = (y * src.width + x) * 4;
        out.data[i] = r;
        out.data[i + 1] = g;
        out.data[i + 2] = b;
        out.data[i + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * Rounded-corner frame: pixels outside a rounded rectangle become transparent, and an
 * optional outline of `thickness` is drawn just inside its edge. Anti-aliased on the curve.
 */
export function frameImageData(src: ImageData, radius: number, thickness: number, color: string): ImageData {
  const w = src.width;
  const h = src.height;
  const out = make(w, h);
  out.data.set(src.data);
  const rad = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
  const t = Math.max(0, thickness);
  const [cr, cg, cb] = parseColor(color);
  // signed distance (negative = inside) to a rounded rect, evaluated at pixel centres
  const dist = (px: number, py: number) => {
    const cx = w / 2;
    const cy = h / 2;
    const qx = Math.abs(px - cx) - (w / 2 - rad);
    const qy = Math.abs(py - cy) - (h / 2 - rad);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dist(x + 0.5, y + 0.5);
      const i = (y * w + x) * 4;
      const inside = Math.min(1, Math.max(0, 0.5 - d)); // 1 well inside, 0 outside, soft on the edge
      if (t > 0 && d > -t) {
        const ink = Math.min(1, Math.max(0, d + t + 0.5)); // blend toward outline colour near the edge
        out.data[i] = Math.round(out.data[i] * (1 - ink) + cr * ink);
        out.data[i + 1] = Math.round(out.data[i + 1] * (1 - ink) + cg * ink);
        out.data[i + 2] = Math.round(out.data[i + 2] * (1 - ink) + cb * ink);
        out.data[i + 3] = Math.max(out.data[i + 3], Math.round(255 * ink));
      }
      out.data[i + 3] = Math.round(out.data[i + 3] * inside);
    }
  }
  return out;
}
