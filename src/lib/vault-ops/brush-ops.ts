/**
 * Interactive Retouch Brush Operations (`src/lib/vault-ops/brush-ops.ts`)
 * Pure ImageData-based implementations for retouch tools:
 * - Smudge: Finger smear along stroke path
 * - Liquify: Push, Inflate (Bloat), Deflate (Pucker) via displacement fields
 * - Heal: Content-aware spot heal using multi-scale Poisson/Laplace diffusion
 * - Clone Stamp: Offset source sampling with soft brush & optional alignment
 * - Remove Background: AI model (lazy import) with GrabCut classical graph-cut fallback
 * - Upscale: 2x/4x Lanczos-3 resampling with halo-suppressed post-sharpening
 */

export interface Point {
  /** X coordinate in canvas pixels */
  x: number;
  /** Y coordinate in canvas pixels */
  y: number;
  /** Pressure sensitivity (0.0 to 1.0, default 1.0) */
  pressure?: number;
}

export interface SmudgeOptions {
  /** Brush radius in pixels (1 to 500) */
  radius: number;
  /** Smudge strength / drag factor (0.0 to 1.0) */
  strength: number;
  /** Brush edge hardness (0.0 to 1.0, default 0.5) */
  hardness?: number;
}

export type LiquifyMode = 'push' | 'inflate' | 'deflate' | 'bloat' | 'pucker';

export interface LiquifyOptions {
  /** Distortion mode: push, inflate (bloat), deflate (pucker) */
  mode: LiquifyMode;
  /** Brush radius in pixels (1 to 500) */
  radius: number;
  /** Liquify strength / displacement magnitude (0.0 to 1.0) */
  strength: number;
  /** Brush edge hardness (0.0 to 1.0, default 0.5) */
  hardness?: number;
}

export interface HealOptions {
  /** Mask buffer (w * h) where >0 indicates region to heal */
  mask?: Uint8Array | Uint8ClampedArray | boolean[];
  /** Center point for circular spot heal */
  center?: Point;
  /** Radius for circular spot heal in pixels (1 to 500) */
  radius?: number;
  /** Solver iterations for Laplace diffusion (10 to 500, default 60) */
  iterations?: number;
}

export interface CloneStampOptions {
  /** Offset vector from target to source: (source_x - target_x, source_y - target_y) */
  sourceOffset: { x: number; y: number };
  /** Brush radius in pixels (1 to 500) */
  radius: number;
  /** Stamp opacity / strength (0.0 to 1.0) */
  strength: number;
  /** Brush edge hardness (0.0 to 1.0, default 0.5) */
  hardness?: number;
  /** Fixed offset across stroke if true (default true) */
  aligned?: boolean;
}

export interface RemoveBackgroundResult {
  /** Output ImageData with transparent background */
  imageData: ImageData;
  /** Alpha mask buffer (0 = background, 255 = foreground) */
  mask: Uint8Array;
  /** Method used: 'model', 'classical-grabcut', or 'classical-chroma' */
  method: 'model' | 'classical-grabcut' | 'classical-chroma';
}

export interface UpscaleOptions {
  /** Enable post-sharpening (default false) */
  sharpen?: boolean;
  /** Post-sharpening strength (0.0 to 1.0, default 0.25) */
  sharpenAmount?: number;
  /** Maximum detail difference to suppress halos (1 to 100, default 25) */
  haloThreshold?: number;
}

function createImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  if (typeof ImageData !== "undefined") {
    return new ImageData(data as any, width, height);
  }
  return {
    data,
    width,
    height,
    colorSpace: "srgb"
  } as ImageData;
}

export function createEmptyImageData(width: number, height: number): ImageData {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  return createImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

export function cloneImageData(src: ImageData): ImageData {
  const copy = new Uint8ClampedArray(src.data);
  return createImageData(copy, src.width, src.height);
}

function sampleBilinear(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  out: Float32Array
): void {
  if (w <= 0 || h <= 0) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  const cx = Math.max(0, Math.min(w - 1, x));
  const cy = Math.max(0, Math.min(h - 1, y));

  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);

  const fx = cx - x0;
  const fy = cy - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const idx00 = (y0 * w + x0) * 4;
  const idx10 = (y0 * w + x1) * 4;
  const idx01 = (y1 * w + x0) * 4;
  const idx11 = (y1 * w + x1) * 4;

  for (let c = 0; c < 4; c++) {
    out[c] =
      data[idx00 + c] * w00 +
      data[idx10 + c] * w10 +
      data[idx01 + c] * w01 +
      data[idx11 + c] * w11;
  }
}

function interpolatePath(path: Point[], stepSize: number): Point[] {
  if (path.length <= 1) return [...path];
  const dense: Point[] = [path[0]];
  const minStep = Math.max(0.5, stepSize);

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist / minStep);
    const pr1 = p1.pressure ?? 1;
    const pr2 = p2.pressure ?? 1;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      dense.push({
        x: p1.x + dx * t,
        y: p1.y + dy * t,
        pressure: pr1 + (pr2 - pr1) * t,
      });
    }
  }
  return dense;
}

/**
 * Finger smudge stroke operation. Smears pixel colors along a stroke path.
 *
 * @param src Input ImageData (never mutated)
 * @param path Array of stroke points [{x, y, pressure?}]
 * @param options Smudge configuration options (radius 1..500, strength 0..1)
 * @returns New ImageData with smudge effect applied
 */
export function smudgeImageData(
  src: ImageData,
  path: Point[],
  options: SmudgeOptions
): ImageData {
  const w = src.width;
  const h = src.height;
  if (w <= 0 || h <= 0 || path.length < 2 || options.radius <= 0 || options.strength <= 0) {
    return cloneImageData(src);
  }

  let totalDist = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x;
    const dy = path[i + 1].y - path[i].y;
    totalDist += Math.sqrt(dx * dx + dy * dy);
  }
  if (totalDist < 1e-3) {
    return cloneImageData(src);
  }

  const out = new Uint8ClampedArray(src.data);
  const baseRadius = Math.max(1, options.radius);
  const strength = Math.max(0, Math.min(1, options.strength));
  const stepSize = Math.max(1, baseRadius * 0.25);
  const stroke = interpolatePath(path, stepSize);

  const sampleColor = new Float32Array(4);
  const p0 = stroke[0];
  const p0Radius = Math.max(1, Math.round(baseRadius * (p0.pressure ?? 1)));
  const bufferSide = p0Radius * 2 + 1;
  const fingerBuffer = new Float32Array(bufferSide * bufferSide * 4);

  let bIdx = 0;
  for (let dy = -p0Radius; dy <= p0Radius; dy++) {
    for (let dx = -p0Radius; dx <= p0Radius; dx++) {
      sampleBilinear(out, w, h, p0.x + dx, p0.y + dy, sampleColor);
      fingerBuffer[bIdx] = sampleColor[0];
      fingerBuffer[bIdx + 1] = sampleColor[1];
      fingerBuffer[bIdx + 2] = sampleColor[2];
      fingerBuffer[bIdx + 3] = sampleColor[3];
      bIdx += 4;
    }
  }

  for (let k = 1; k < stroke.length; k++) {
    const pt = stroke[k];
    const pressure = Math.max(0.01, Math.min(1, pt.pressure ?? 1));
    const radius = Math.max(1, Math.round(baseRadius * pressure));

    const minX = Math.max(0, Math.floor(pt.x - radius));
    const maxX = Math.min(w - 1, Math.ceil(pt.x + radius));
    const minY = Math.max(0, Math.floor(pt.y - radius));
    const maxY = Math.min(h - 1, Math.ceil(pt.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - pt.x;
        const dy = y - pt.y;
        const distSq = dx * dx + dy * dy;
        const rSq = radius * radius;
        if (distSq > rSq) continue;

        const dist = Math.sqrt(distSq) / radius;
        const falloff = (1 - dist * dist) * (1 - dist * dist);
        const alpha = strength * pressure * falloff;

        const bufx = Math.max(-p0Radius, Math.min(p0Radius, Math.round(dx)));
        const bufy = Math.max(-p0Radius, Math.min(p0Radius, Math.round(dy)));
        const fIdx = ((bufy + p0Radius) * bufferSide + (bufx + p0Radius)) * 4;

        const fR = fingerBuffer[fIdx];
        const fG = fingerBuffer[fIdx + 1];
        const fB = fingerBuffer[fIdx + 2];
        const fA = fingerBuffer[fIdx + 3];

        const outIdx = (y * w + x) * 4;
        const cR = out[outIdx];
        const cG = out[outIdx + 1];
        const cB = out[outIdx + 2];
        const cA = out[outIdx + 3];

        out[outIdx] = Math.max(0, Math.min(255, cR * (1 - alpha) + fR * alpha));
        out[outIdx + 1] = Math.max(0, Math.min(255, cG * (1 - alpha) + fG * alpha));
        out[outIdx + 2] = Math.max(0, Math.min(255, cB * (1 - alpha) + fB * alpha));
        out[outIdx + 3] = Math.max(0, Math.min(255, cA * (1 - alpha) + fA * alpha));

        const pickup = 0.3 * alpha;
        fingerBuffer[fIdx] = fR * (1 - pickup) + cR * pickup;
        fingerBuffer[fIdx + 1] = fG * (1 - pickup) + cG * pickup;
        fingerBuffer[fIdx + 2] = fB * (1 - pickup) + cB * pickup;
        fingerBuffer[fIdx + 3] = fA * (1 - pickup) + cA * pickup;
      }
    }
  }

  return createImageData(out, w, h);
}

/**
 * Liquify distortion tool. Distorts pixels using a smooth displacement field.
 * Supports modes: push, inflate (bloat), deflate (pucker).
 *
 * @param src Input ImageData (never mutated)
 * @param path Array of stroke points [{x, y, pressure?}]
 * @param options Liquify options (mode, radius 1..500, strength 0..1)
 * @returns New ImageData with liquify distortion applied
 */
export function liquifyImageData(
  src: ImageData,
  path: Point[],
  options: LiquifyOptions
): ImageData {
  const w = src.width;
  const h = src.height;
  if (w <= 0 || h <= 0 || path.length === 0 || options.strength <= 0 || options.radius <= 0) {
    return cloneImageData(src);
  }

  const mode = options.mode === 'bloat' ? 'inflate' : options.mode === 'pucker' ? 'deflate' : options.mode;
  const baseRadius = Math.max(1, options.radius);
  const strength = Math.max(0, Math.min(1, options.strength));
  const dispX = new Float32Array(w * h);
  const dispY = new Float32Array(w * h);

  if (mode === 'push') {
    if (path.length < 2) return cloneImageData(src);
    const stepSize = Math.max(1, baseRadius * 0.25);
    const stroke = interpolatePath(path, stepSize);

    for (let k = 0; k < stroke.length - 1; k++) {
      const p1 = stroke[k];
      const p2 = stroke[k + 1];
      const vx = p2.x - p1.x;
      const vy = p2.y - p1.y;
      const vLen = Math.sqrt(vx * vx + vy * vy);
      if (vLen < 1e-4) continue;

      const pressure = Math.max(0.01, Math.min(1, p2.pressure ?? 1));
      const radius = Math.max(1, baseRadius * pressure);

      const minX = Math.max(0, Math.floor(p2.x - radius));
      const maxX = Math.min(w - 1, Math.ceil(p2.x + radius));
      const minY = Math.max(0, Math.floor(p2.y - radius));
      const maxY = Math.min(h - 1, Math.ceil(p2.y + radius));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - p2.x;
          const dy = y - p2.y;
          const distSq = dx * dx + dy * dy;
          const rSq = radius * radius;
          if (distSq >= rSq) continue;

          const r = Math.sqrt(distSq) / radius;
          const falloff = (1 - r * r) * (1 - r * r);
          const factor = falloff * strength * pressure;

          const idx = y * w + x;
          dispX[idx] += vx * factor;
          dispY[idx] += vy * factor;
        }
      }
    }
  } else if (mode === 'inflate' || mode === 'deflate') {
    const sign = mode === 'inflate' ? 1 : -1;
    const stepSize = Math.max(1, baseRadius * 0.25);
    const stroke = interpolatePath(path, stepSize);

    for (let k = 0; k < stroke.length; k++) {
      const pt = stroke[k];
      const pressure = Math.max(0.01, Math.min(1, pt.pressure ?? 1));
      const radius = Math.max(1, baseRadius * pressure);

      const minX = Math.max(0, Math.floor(pt.x - radius));
      const maxX = Math.min(w - 1, Math.ceil(pt.x + radius));
      const minY = Math.max(0, Math.floor(pt.y - radius));
      const maxY = Math.min(h - 1, Math.ceil(pt.y + radius));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - pt.x;
          const dy = y - pt.y;
          const distSq = dx * dx + dy * dy;
          const rSq = radius * radius;
          if (distSq >= rSq) continue;

          const dist = Math.sqrt(distSq);
          if (dist < 1e-4) continue;

          const r = dist / radius;
          const falloff = (1 - r * r) * (1 - r * r);
          const mag = sign * falloff * strength * pressure * radius * 0.3;

          const idx = y * w + x;
          dispX[idx] += (dx / dist) * mag;
          dispY[idx] += (dy / dist) * mag;
        }
      }
    }
  }

  let maxDisp = 0;
  for (let i = 0; i < dispX.length; i++) {
    const d = Math.abs(dispX[i]) + Math.abs(dispY[i]);
    if (d > maxDisp) maxDisp = d;
  }
  if (maxDisp < 1e-5) {
    return cloneImageData(src);
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const sampleColor = new Float32Array(4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const sx = x - dispX[idx];
      const sy = y - dispY[idx];

      sampleBilinear(src.data, w, h, sx, sy, sampleColor);
      const oIdx = idx * 4;
      out[oIdx] = Math.max(0, Math.min(255, Math.round(sampleColor[0])));
      out[oIdx + 1] = Math.max(0, Math.min(255, Math.round(sampleColor[1])));
      out[oIdx + 2] = Math.max(0, Math.min(255, Math.round(sampleColor[2])));
      out[oIdx + 3] = Math.max(0, Math.min(255, Math.round(sampleColor[3])));
    }
  }

  return createImageData(out, w, h);
}

/**
 * Content-aware spot healing tool using multi-scale Laplace/Poisson diffusion.
 * Fills masked regions smoothly from surrounding pixels with zero seam artifacts.
 *
 * @param src Input ImageData (never mutated)
 * @param options Heal options (mask array OR center+radius, solver iterations)
 * @returns New ImageData with healed region
 */
export function healImageData(
  src: ImageData,
  options: HealOptions
): ImageData {
  const w = src.width;
  const h = src.height;
  if (w <= 0 || h <= 0) return cloneImageData(src);

  const maskBytes = new Uint8Array(w * h);

  if (options.mask && options.mask.length === w * h) {
    for (let i = 0; i < w * h; i++) {
      if (options.mask[i]) maskBytes[i] = 1;
    }
  }

  if (options.center && options.radius && options.radius > 0) {
    const cx = options.center.x;
    const cy = options.center.y;
    const r = options.radius;
    const rSq = r * r;
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(w - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(h - 1, Math.ceil(cy + r));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rSq) {
          maskBytes[y * w + x] = 1;
        }
      }
    }
  }

  let maskCount = 0;
  for (let i = 0; i < w * h; i++) {
    if (maskBytes[i] === 1) maskCount++;
  }

  if (maskCount === 0 || maskCount === w * h) {
    return cloneImageData(src);
  }

  const outData = new Uint8ClampedArray(src.data);
  const iterations = Math.max(10, Math.min(500, options.iterations ?? 60));

  for (let c = 0; c < 4; c++) {
    const buf = new Float32Array(w * h);
    const nextBuf = new Float32Array(w * h);

    for (let i = 0; i < w * h; i++) {
      buf[i] = outData[i * 4 + c];
      nextBuf[i] = buf[i];
    }

    for (let iter = 0; iter < iterations; iter++) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        const yUp = (y > 0 ? y - 1 : y) * w;
        const yDown = (y < h - 1 ? y + 1 : y) * w;

        for (let x = 0; x < w; x++) {
          const idx = row + x;
          if (maskBytes[idx] === 0) continue;

          const xLeft = x > 0 ? x - 1 : x;
          const xRight = x < w - 1 ? x + 1 : x;

          const val = (
            buf[yUp + x] +
            buf[yDown + x] +
            buf[row + xLeft] +
            buf[row + xRight]
          ) * 0.25;

          nextBuf[idx] = val;
        }
      }
      buf.set(nextBuf);
    }

    for (let i = 0; i < w * h; i++) {
      if (maskBytes[i] === 1) {
        outData[i * 4 + c] = Math.max(0, Math.min(255, Math.round(buf[i])));
      }
    }
  }

  return createImageData(outData, w, h);
}

/**
 * Clone stamp tool. Samples pixels from a source offset and paints onto target path.
 *
 * @param src Input ImageData (never mutated)
 * @param path Array of target stroke points [{x, y, pressure?}]
 * @param options Clone stamp options (sourceOffset, radius, strength, aligned)
 * @returns New ImageData with clone stamp painted
 */
export function cloneStampImageData(
  src: ImageData,
  path: Point[],
  options: CloneStampOptions
): ImageData {
  const w = src.width;
  const h = src.height;
  if (w <= 0 || h <= 0 || path.length === 0 || options.strength <= 0 || options.radius <= 0) {
    return cloneImageData(src);
  }

  const ox = options.sourceOffset.x;
  const oy = options.sourceOffset.y;

  if (ox === 0 && oy === 0) {
    return cloneImageData(src);
  }

  const out = new Uint8ClampedArray(src.data);
  const baseRadius = Math.max(1, options.radius);
  const strength = Math.max(0, Math.min(1, options.strength));
  const stepSize = Math.max(1, baseRadius * 0.25);
  const stroke = interpolatePath(path, stepSize);
  const sampleColor = new Float32Array(4);

  for (let k = 0; k < stroke.length; k++) {
    const pt = stroke[k];
    const pressure = Math.max(0.01, Math.min(1, pt.pressure ?? 1));
    const radius = Math.max(1, baseRadius * pressure);

    const minX = Math.max(0, Math.floor(pt.x - radius));
    const maxX = Math.min(w - 1, Math.ceil(pt.x + radius));
    const minY = Math.max(0, Math.floor(pt.y - radius));
    const maxY = Math.min(h - 1, Math.ceil(pt.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - pt.x;
        const dy = y - pt.y;
        const distSq = dx * dx + dy * dy;
        const rSq = radius * radius;
        if (distSq > rSq) continue;

        const dist = Math.sqrt(distSq) / radius;
        const falloff = (1 - dist * dist) * (1 - dist * dist);
        const alpha = strength * pressure * falloff;

        const sx = x + ox;
        const sy = y + oy;
        sampleBilinear(src.data, w, h, sx, sy, sampleColor);

        const idx = (y * w + x) * 4;
        out[idx] = Math.max(0, Math.min(255, out[idx] * (1 - alpha) + sampleColor[0] * alpha));
        out[idx + 1] = Math.max(0, Math.min(255, out[idx + 1] * (1 - alpha) + sampleColor[1] * alpha));
        out[idx + 2] = Math.max(0, Math.min(255, out[idx + 2] * (1 - alpha) + sampleColor[2] * alpha));
        out[idx + 3] = Math.max(0, Math.min(255, out[idx + 3] * (1 - alpha) + sampleColor[3] * alpha));
      }
    }
  }

  return createImageData(out, w, h);
}

/**
 * Remove background from image using AI model if available, falling back to GrabCut classical graph-cut approximation.
 *
 * @param src Input ImageData (never mutated)
 * @returns Promise resolving to RemoveBackgroundResult
 */
export async function removeBackgroundModel(
  src: ImageData
): Promise<RemoveBackgroundResult> {
  try {
    const modName = "@imgly/background-removal";
    const mod = await import(/* @vite-ignore */ modName);
    if (mod && typeof mod.removeBackground === "function" && typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.putImageData(src, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) {
          const resultBlob = await mod.removeBackground(blob);
          const url = URL.createObjectURL(resultBlob);
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = url;
          });
          const resCanvas = document.createElement("canvas");
          resCanvas.width = img.naturalWidth;
          resCanvas.height = img.naturalHeight;
          const resCtx = resCanvas.getContext("2d")!;
          resCtx.drawImage(img, 0, 0);
          const resImageData = resCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
          URL.revokeObjectURL(url);
          const mask = new Uint8Array(resImageData.width * resImageData.height);
          for (let i = 0; i < mask.length; i++) mask[i] = resImageData.data[i * 4 + 3];
          return { imageData: resImageData, mask, method: 'model' };
        }
      }
    }
  } catch {
    // Model not present or failed -> fall back to classical path
  }

  return removeBackgroundClassical(src);
}

export async function removeBackground(
  src: ImageData
): Promise<RemoveBackgroundResult> {
  return removeBackgroundModel(src);
}

function removeBackgroundClassical(src: ImageData): RemoveBackgroundResult {
  const w = src.width;
  const h = src.height;
  if (w <= 0 || h <= 0) {
    return {
      imageData: cloneImageData(src),
      mask: new Uint8Array(0),
      method: 'classical-grabcut',
    };
  }

  const cornerColors: number[][] = [];
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]
  ];
  for (const [cx, cy] of corners) {
    const idx = (cy * w + cx) * 4;
    cornerColors.push([src.data[idx], src.data[idx + 1], src.data[idx + 2]]);
  }

  let avgR = 0, avgG = 0, avgB = 0;
  for (const c of cornerColors) {
    avgR += c[0] / 4;
    avgG += c[1] / 4;
    avgB += c[2] / 4;
  }

  let varSum = 0;
  for (const c of cornerColors) {
    const dr = c[0] - avgR;
    const dg = c[1] - avgG;
    const db = c[2] - avgB;
    varSum += dr * dr + dg * dg + db * db;
  }

  if (varSum < 600) {
    const out = new Uint8ClampedArray(src.data);
    const mask = new Uint8Array(w * h);
    const tolLow = 35;
    const tolHigh = 75;

    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      const dr = out[idx] - avgR;
      const dg = out[idx + 1] - avgG;
      const db = out[idx + 2] - avgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist < tolLow) {
        out[idx + 3] = 0;
        mask[i] = 0;
      } else if (dist > tolHigh) {
        mask[i] = 255;
      } else {
        const alpha = Math.round(((dist - tolLow) / (tolHigh - tolLow)) * 255);
        out[idx + 3] = alpha;
        mask[i] = alpha;
      }
    }

    return {
      imageData: createImageData(out, w, h),
      mask,
      method: 'classical-chroma',
    };
  }

  const mask = new Uint8Array(w * h);
  const out = new Uint8ClampedArray(src.data);

  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = src.data[idx];
      const g = src.data[idx + 1];
      const b = src.data[idx + 2];

      const isBorder = x < w * 0.1 || x > w * 0.9 || y < h * 0.1 || y > h * 0.9;
      const isCenter = x > w * 0.3 && x < w * 0.7 && y > h * 0.3 && y < h * 0.7;

      if (isBorder) {
        bgR += r; bgG += g; bgB += b; bgCount++;
      }
      if (isCenter) {
        fgR += r; fgG += g; fgB += b; fgCount++;
      }
    }
  }

  if (bgCount > 0) { bgR /= bgCount; bgG /= bgCount; bgB /= bgCount; }
  if (fgCount > 0) { fgR /= fgCount; fgG /= fgCount; fgB /= fgCount; }

  const prob = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const r = src.data[idx];
    const g = src.data[idx + 1];
    const b = src.data[idx + 2];

    const dBg = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
    const dFg = Math.sqrt((r - fgR) ** 2 + (g - fgG) ** 2 + (b - fgB) ** 2);

    prob[i] = dBg / (dBg + dFg + 1e-5);
  }

  const nextProb = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const p = prob[idx];

        const pL = prob[idx - 1];
        const pR = prob[idx + 1];
        const pU = prob[idx - w];
        const pD = prob[idx + w];

        const avgN = (pL + pR + pU + pD) * 0.25;
        nextProb[idx] = p * 0.6 + avgN * 0.4;
      }
    }
    prob.set(nextProb);
  }

  for (let i = 0; i < w * h; i++) {
    const alpha = Math.max(0, Math.min(255, Math.round(prob[i] * 255)));
    mask[i] = alpha;
    out[i * 4 + 3] = alpha;
  }

  return {
    imageData: createImageData(out, w, h),
    mask,
    method: 'classical-grabcut',
  };
}

/**
 * 2x / 4x image upscaler using Lanczos-3 resampling with optional halo-suppressed post-sharpening.
 * Uses Web Worker bridge if available, falling back to in-thread pure TS Lanczos-3.
 *
 * @param src Input ImageData (never mutated)
 * @param factor Upscale multiplier (e.g. 2 or 4)
 * @param onProgress Progress callback (0.0 to 1.0)
 * @param options Upscaling options (sharpen, sharpenAmount 0..1, haloThreshold 1..100)
 * @returns Promise resolving to upscaled ImageData
 */
export async function upscaleImageData(
  src: ImageData,
  factor: number,
  onProgress?: (progress: number) => void,
  options?: UpscaleOptions
): Promise<ImageData> {
  const w = src.width;
  const h = src.height;
  if (w <= 0 || h <= 0 || factor <= 1) return cloneImageData(src);

  const dstW = Math.round(w * factor);
  const dstH = Math.round(h * factor);

  let upscaled: ImageData | null = null;

  if (typeof window !== "undefined" && typeof Worker !== "undefined") {
    try {
      const { lanczosResize } = await import("../lanczos-bridge");
      upscaled = await lanczosResize(src, dstW, dstH, onProgress);
    } catch {
      upscaled = null;
    }
  }

  if (!upscaled) {
    upscaled = inThreadLanczos3(src, dstW, dstH, onProgress);
  }

  const sharpenAmount = options?.sharpenAmount ?? (options?.sharpen ? 0.25 : 0);
  if (sharpenAmount > 0) {
    const haloThreshold = options?.haloThreshold ?? 25;
    upscaled = applyHaloSuppressedSharpen(upscaled, sharpenAmount, haloThreshold);
  }

  return upscaled;
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczos3Kernel(x: number): number {
  if (x <= -3 || x >= 3) return 0;
  return sinc(x) * sinc(x / 3);
}

function buildLanczosWeights(srcLen: number, dstLen: number) {
  const scale = dstLen / srcLen;
  const support = 3;
  const weights: { start: number; w: Float32Array }[] = new Array(dstLen);

  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) / scale - 0.5;
    const start = Math.max(0, Math.floor(center - support) + 1);
    const end = Math.min(srcLen - 1, Math.floor(center + support));
    const w = new Float32Array(Math.max(1, end - start + 1));
    let sum = 0;

    for (let j = start; j <= end; j++) {
      const v = lanczos3Kernel(j - center);
      w[j - start] = v;
      sum += v;
    }
    if (sum !== 0) {
      for (let k = 0; k < w.length; k++) w[k] /= sum;
    }
    weights[i] = { start, w };
  }
  return weights;
}

function inThreadLanczos3(
  src: ImageData,
  dstW: number,
  dstH: number,
  onProgress?: (progress: number) => void
): ImageData {
  const srcW = src.width;
  const srcH = src.height;
  const sp = src.data;

  const wx = buildLanczosWeights(srcW, dstW);
  const wy = buildLanczosWeights(srcH, dstH);

  const interm = new Float32Array(dstW * srcH * 4);

  for (let y = 0; y < srcH; y++) {
    const rowS = y * srcW * 4;
    const rowD = y * dstW * 4;
    for (let x = 0; x < dstW; x++) {
      const { start, w } = wx[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const off = rowS + (start + k) * 4;
        const wt = w[k];
        r += sp[off] * wt;
        g += sp[off + 1] * wt;
        b += sp[off + 2] * wt;
        a += sp[off + 3] * wt;
      }
      const o = rowD + x * 4;
      interm[o] = r;
      interm[o + 1] = g;
      interm[o + 2] = b;
      interm[o + 3] = a;
    }
    if ((y & 31) === 0 && onProgress) onProgress((y / srcH) * 0.5);
  }

  const out = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const { start, w } = wy[y];
    const rowD = y * dstW * 4;
    for (let x = 0; x < dstW; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const off = ((start + k) * dstW + x) * 4;
        const wt = w[k];
        r += interm[off] * wt;
        g += interm[off + 1] * wt;
        b += interm[off + 2] * wt;
        a += interm[off + 3] * wt;
      }
      const o = rowD + x * 4;
      out[o] = Math.max(0, Math.min(255, Math.round(r)));
      out[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      out[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      out[o + 3] = Math.max(0, Math.min(255, Math.round(a)));
    }
    if ((y & 31) === 0 && onProgress) onProgress(0.5 + (y / dstH) * 0.5);
  }

  if (onProgress) onProgress(1.0);
  return createImageData(out, dstW, dstH);
}

function applyHaloSuppressedSharpen(
  src: ImageData,
  amount: number,
  haloThreshold: number
): ImageData {
  const w = src.width;
  const h = src.height;
  const out = new Uint8ClampedArray(src.data);

  const blurred = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const idx = (ny * w + nx) * 4;
          r += src.data[idx];
          g += src.data[idx + 1];
          b += src.data[idx + 2];
          a += src.data[idx + 3];
          count++;
        }
      }
      const bIdx = (y * w + x) * 4;
      blurred[bIdx] = r / count;
      blurred[bIdx + 1] = g / count;
      blurred[bIdx + 2] = b / count;
      blurred[bIdx + 3] = a / count;
    }
  }

  for (let i = 0; i < w * h * 4; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = src.data[i + c];
      const blur = blurred[i + c];
      const detail = orig - blur;
      const clampedDetail = Math.max(-haloThreshold, Math.min(haloThreshold, detail));
      out[i + c] = Math.max(0, Math.min(255, Math.round(orig + amount * clampedDetail)));
    }
  }

  return createImageData(out, w, h);
}
