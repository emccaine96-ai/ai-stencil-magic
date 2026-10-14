/**
 * Vault Image Operations — Pure, well-typed ImageData transformations.
 * Operates on ImageData buffers in pure JavaScript/TypeScript without DOM access
 * so that functions can run seamlessly on the main thread or inside a Web Worker.
 *
 * Every function takes an ImageData and returns a NEW ImageData instance (never mutating input).
 */

/* -------------------------------- Types ----------------------------------- */

export type CurvePoint = { x: number; y: number }; // x: 0..255, y: 0..255

export type LevelsParams = {
  inBlack: number;  // 0..255
  inWhite: number;  // 0..255
  gamma: number;     // 0.1..3.0
  outBlack: number; // 0..255
  outWhite: number; // 0..255
};

export type GradientStop = {
  offset: number; // 0..1
  color: string;  // Hex color string e.g. '#A855F7'
};

export type PresetGradientName =
  | 'thermal-purple'
  | 'thermal-blue'
  | 'red-ink'
  | 'black-ink'
  | 'sepia';

/* ------------------------------- Helpers ---------------------------------- */

/**
 * Creates a new ImageData instance with cloned buffer contents.
 */
export function cloneImageData(img: ImageData): ImageData {
  const data = new Uint8ClampedArray(img.data);
  return new ImageData(data, img.width, img.height);
}

/**
 * Creates a zero-initialized ImageData instance.
 */
export function createImageData(width: number, height: number): ImageData {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
}

// Pre-computed sRGB ↔ Linear lookup tables for color precision & speed
const srgbToLinearLUT = new Float32Array(256);
const linearToSrgbLUT = new Uint8ClampedArray(1024);

for (let i = 0; i < 256; i++) {
  const v = i / 255;
  srgbToLinearLUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

for (let i = 0; i < 1024; i++) {
  const v = i / 1023;
  const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  linearToSrgbLUT[i] = Math.round(Math.max(0, Math.min(1, srgb)) * 255);
}

function linearToSrgbFast(lin: number): number {
  if (lin <= 0) return 0;
  if (lin >= 1) return 255;
  const idx = (lin * 1023) | 0;
  return linearToSrgbLUT[idx];
}

/**
 * Bilinear sampling from ImageData.
 */
function sampleBilinear(
  img: ImageData,
  x: number,
  y: number,
  outRgba: [number, number, number, number] = [0, 0, 0, 0]
): [number, number, number, number] {
  const W = img.width;
  const H = img.height;
  const data = img.data;

  const x0 = Math.max(0, Math.min(W - 1, Math.floor(x)));
  const x1 = Math.max(0, Math.min(W - 1, x0 + 1));
  const y0 = Math.max(0, Math.min(H - 1, Math.floor(y)));
  const y1 = Math.max(0, Math.min(H - 1, y0 + 1));

  const wx = Math.max(0, Math.min(1, x - x0));
  const wy = Math.max(0, Math.min(1, y - y0));

  const i00 = (y0 * W + x0) * 4;
  const i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4;
  const i11 = (y1 * W + x1) * 4;

  const w00 = (1 - wx) * (1 - wy);
  const w10 = wx * (1 - wy);
  const w01 = (1 - wx) * wy;
  const w11 = wx * wy;

  outRgba[0] = data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11;
  outRgba[1] = data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11;
  outRgba[2] = data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11;
  outRgba[3] = data[i00 + 3] * w00 + data[i10 + 3] * w10 + data[i01 + 3] * w01 + data[i11 + 3] * w11;

  return outRgba;
}

/**
 * 1D box blur pass over 4-channel buffer.
 */
function boxBlurPass1D(
  src: Uint8ClampedArray | Float32Array,
  dst: Float32Array,
  W: number,
  H: number,
  r: number,
  horizontal: boolean
) {
  if (r <= 0) {
    dst.set(src);
    return;
  }
  const iarr = 1 / (r + r + 1);

  if (horizontal) {
    for (let y = 0; y < H; y++) {
      const rowOffset = y * W * 4;
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

      for (let i = -r; i <= r; i++) {
        const x = Math.max(0, Math.min(W - 1, i));
        const idx = rowOffset + x * 4;
        rSum += src[idx];
        gSum += src[idx + 1];
        bSum += src[idx + 2];
        aSum += src[idx + 3];
      }

      for (let x = 0; x < W; x++) {
        const outIdx = rowOffset + x * 4;
        dst[outIdx] = rSum * iarr;
        dst[outIdx + 1] = gSum * iarr;
        dst[outIdx + 2] = bSum * iarr;
        dst[outIdx + 3] = aSum * iarr;

        const leftX = Math.max(0, x - r);
        const rightX = Math.min(W - 1, x + r + 1);
        const leftIdx = rowOffset + leftX * 4;
        const rightIdx = rowOffset + rightX * 4;

        rSum += src[rightIdx] - src[leftIdx];
        gSum += src[rightIdx + 1] - src[leftIdx + 1];
        bSum += src[rightIdx + 2] - src[leftIdx + 2];
        aSum += src[rightIdx + 3] - src[leftIdx + 3];
      }
    }
  } else {
    for (let x = 0; x < W; x++) {
      const colOffset = x * 4;
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

      for (let i = -r; i <= r; i++) {
        const y = Math.max(0, Math.min(H - 1, i));
        const idx = (y * W) * 4 + colOffset;
        rSum += src[idx];
        gSum += src[idx + 1];
        bSum += src[idx + 2];
        aSum += src[idx + 3];
      }

      for (let y = 0; y < H; y++) {
        const outIdx = (y * W) * 4 + colOffset;
        dst[outIdx] = rSum * iarr;
        dst[outIdx + 1] = gSum * iarr;
        dst[outIdx + 2] = bSum * iarr;
        dst[outIdx + 3] = aSum * iarr;

        const topY = Math.max(0, y - r);
        const botY = Math.min(H - 1, y + r + 1);
        const topIdx = (topY * W) * 4 + colOffset;
        const botIdx = (botY * W) * 4 + colOffset;

        rSum += src[botIdx] - src[topIdx];
        gSum += src[botIdx + 1] - src[topIdx + 1];
        bSum += src[botIdx + 2] - src[topIdx + 2];
        aSum += src[botIdx + 3] - src[topIdx + 3];
      }
    }
  }
}

/* ------------------------------- Operations ------------------------------- */

/**
 * Separable 3-pass fast Gaussian blur approximation.
 * @param imageData Source ImageData
 * @param radius Blur radius in pixels (default: 4, range: 0..100)
 */
export function gaussianBlur(imageData: ImageData, radius = 4): ImageData {
  const r = Math.max(0, Math.round(radius));
  if (r <= 0) return cloneImageData(imageData);

  const W = imageData.width, H = imageData.height;
  const boxR = Math.max(1, Math.round(r / 2));

  const buf1 = new Float32Array(W * H * 4);
  const buf2 = new Float32Array(W * H * 4);

  // Pass 1
  boxBlurPass1D(imageData.data, buf1, W, H, boxR, true);
  boxBlurPass1D(buf1, buf2, W, H, boxR, false);
  // Pass 2
  boxBlurPass1D(buf2, buf1, W, H, boxR, true);
  boxBlurPass1D(buf1, buf2, W, H, boxR, false);
  // Pass 3
  boxBlurPass1D(buf2, buf1, W, H, boxR, true);
  boxBlurPass1D(buf1, buf2, W, H, boxR, false);

  const out = cloneImageData(imageData);
  const od = out.data;

  for (let i = 0; i < od.length; i++) {
    od[i] = Math.max(0, Math.min(255, Math.round(buf2[i])));
  }

  return out;
}

/**
 * Unsharp mask in linear light space.
 * @param imageData Source ImageData
 * @param amount Sharpening multiplier (default: 1.4, range: 0..10)
 */
export function sharpen(imageData: ImageData, amount = 1.4): ImageData {
  if (amount <= 0) return cloneImageData(imageData);
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  const linData = new Float32Array(W * H * 4);
  for (let i = 0; i < sd.length; i += 4) {
    linData[i] = srgbToLinearLUT[sd[i]];
    linData[i + 1] = srgbToLinearLUT[sd[i + 1]];
    linData[i + 2] = srgbToLinearLUT[sd[i + 2]];
    linData[i + 3] = sd[i + 3];
  }

  const blurLin = new Float32Array(W * H * 4);
  const tmpLin = new Float32Array(W * H * 4);
  const r = 2;
  boxBlurPass1D(linData, tmpLin, W, H, r, true);
  boxBlurPass1D(tmpLin, blurLin, W, H, r, false);

  for (let i = 0; i < sd.length; i += 4) {
    const rLin = linData[i] + amount * (linData[i] - blurLin[i]);
    const gLin = linData[i + 1] + amount * (linData[i + 1] - blurLin[i + 1]);
    const bLin = linData[i + 2] + amount * (linData[i + 2] - blurLin[i + 2]);

    od[i] = linearToSrgbFast(rLin);
    od[i + 1] = linearToSrgbFast(gLin);
    od[i + 2] = linearToSrgbFast(bLin);
    od[i + 3] = sd[i + 3];
  }

  return out;
}

/**
 * Edge detection using Scharr/Sobel gradients with Non-Maximum Suppression.
 * @param imageData Source ImageData
 * @param strength Edge strength multiplier (default: 1.0, range: 0.1..5.0)
 * @param nonMaxSuppression Suppress non-maximum pixels to 1px edge lines (default: true)
 */
export function edgeDetect(
  imageData: ImageData,
  strength = 1.0,
  nonMaxSuppression = true
): ImageData {
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  const luma = new Float32Array(W * H);
  for (let i = 0, j = 0; i < sd.length; i += 4, j++) {
    luma[j] = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
  }

  const mag = new Float32Array(W * H);
  const angle = new Float32Array(W * H);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const p00 = luma[(y - 1) * W + (x - 1)], p01 = luma[(y - 1) * W + x], p02 = luma[(y - 1) * W + (x + 1)];
      const p10 = luma[y * W + (x - 1)],                             p12 = luma[y * W + (x + 1)];
      const p20 = luma[(y + 1) * W + (x - 1)], p21 = luma[(y + 1) * W + x], p22 = luma[(y + 1) * W + (x + 1)];

      const gx = (-3 * p00 + 3 * p02 - 10 * p10 + 10 * p12 - 3 * p20 + 3 * p22) / 32;
      const gy = (-3 * p00 - 10 * p01 - 3 * p02 + 3 * p20 + 10 * p21 + 3 * p22) / 32;

      const m = Math.hypot(gx, gy) * strength * 4;
      mag[idx] = m;
      angle[idx] = Math.atan2(gy, gx);
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const i = idx * 4;

      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        od[i] = od[i + 1] = od[i + 2] = 0;
        od[i + 3] = sd[i + 3];
        continue;
      }

      let m = mag[idx];

      if (nonMaxSuppression && m > 0) {
        let ang = (angle[idx] * 180 / Math.PI) % 180;
        if (ang < 0) ang += 180;

        let n1 = 0, n2 = 0;
        if ((ang >= 0 && ang < 22.5) || (ang >= 157.5 && ang <= 180)) {
          n1 = mag[idx - 1];
          n2 = mag[idx + 1];
        } else if (ang >= 22.5 && ang < 67.5) {
          n1 = mag[(y - 1) * W + (x + 1)];
          n2 = mag[(y + 1) * W + (x - 1)];
        } else if (ang >= 67.5 && ang < 112.5) {
          n1 = mag[(y - 1) * W + x];
          n2 = mag[(y + 1) * W + x];
        } else {
          n1 = mag[(y - 1) * W + (x - 1)];
          n2 = mag[(y + 1) * W + (x + 1)];
        }

        if (m < n1 || m < n2) {
          m = 0;
        }
      }

      const val = Math.max(0, Math.min(255, Math.round(m)));
      od[i] = val;
      od[i + 1] = val;
      od[i + 2] = val;
      od[i + 3] = sd[i + 3];
    }
  }

  return out;
}

/**
 * Vignette effect with smooth falloff.
 * @param imageData Source ImageData
 * @param strength Darkening intensity at corners (default: 0.85, range: 0..1)
 * @param falloff Transition softness (default: 0.5, range: 0.1..2.0)
 */
export function vignette(imageData: ImageData, strength = 0.85, falloff = 0.5): ImageData {
  if (strength <= 0) return cloneImageData(imageData);
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const maxR = Math.hypot(cx, cy) || 1;
  const str = Math.max(0, Math.min(1, strength));
  const fall = Math.max(0.01, falloff);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const r = Math.hypot(x - cx, y - cy) / maxR;
      const inner = Math.max(0, 1 - fall);
      const t = Math.max(0, Math.min(1, (r - inner) / fall));
      const smooth = t * t * (3 - 2 * t);
      const factor = 1 - str * smooth;

      od[idx] = Math.max(0, Math.min(255, Math.round(sd[idx] * factor)));
      od[idx + 1] = Math.max(0, Math.min(255, Math.round(sd[idx + 1] * factor)));
      od[idx + 2] = Math.max(0, Math.min(255, Math.round(sd[idx + 2] * factor)));
      od[idx + 3] = sd[idx + 3];
    }
  }
  return out;
}

/**
 * Film grain with luminance-weighted noise.
 * @param imageData Source ImageData
 * @param intensity Noise strength (default: 18, range: 0..100)
 */
export function filmGrain(imageData: ImageData, intensity = 18, seed = 0x9e3779b9): ImageData {
  if (intensity <= 0) return cloneImageData(imageData);
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;
  // mulberry32: small, fast, seedable. Same seed => same grain, so redo/re-apply is repeatable.
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 0; i < sd.length; i += 4) {
    const luma = (0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2]) / 255;
    const weight = 1.0 - 0.5 * luma;
    const noise = (rand() - 0.5) * 2 * intensity * weight;

    od[i] = Math.max(0, Math.min(255, Math.round(sd[i] + noise)));
    od[i + 1] = Math.max(0, Math.min(255, Math.round(sd[i + 1] + noise)));
    od[i + 2] = Math.max(0, Math.min(255, Math.round(sd[i + 2] + noise)));
    od[i + 3] = sd[i + 3];
  }
  return out;
}

/**
 * Tilt-shift blur with a central focus band.
 * @param imageData Source ImageData
 * @param focusY Normalized focus center (default: 0.5, range: 0..1)
 * @param bandRatio In-focus band height ratio (default: 0.35, range: 0..1)
 * @param blurRadius Blur radius outside focus band (default: 10, range: 0..50)
 */
export function tiltShift(
  imageData: ImageData,
  focusY = 0.5,
  bandRatio = 0.35,
  blurRadius = 10
): ImageData {
  const blurred = gaussianBlur(imageData, blurRadius);
  const out = cloneImageData(imageData);
  const W = imageData.width, H = imageData.height;
  const sd = imageData.data, bd = blurred.data, od = out.data;

  const cy = focusY * H;
  const halfBand = (bandRatio * H) / 2;
  const feather = Math.max(1, H * 0.15);

  for (let y = 0; y < H; y++) {
    const dist = Math.abs(y - cy);
    let blurWeight = 0;
    if (dist > halfBand) {
      const t = Math.max(0, Math.min(1, (dist - halfBand) / feather));
      blurWeight = t * t * (3 - 2 * t);
    }

    const sharpWeight = 1 - blurWeight;
    const rowOffset = y * W * 4;

    for (let x = 0; x < W; x++) {
      const i = rowOffset + x * 4;
      od[i] = Math.max(0, Math.min(255, Math.round(sd[i] * sharpWeight + bd[i] * blurWeight)));
      od[i + 1] = Math.max(0, Math.min(255, Math.round(sd[i + 1] * sharpWeight + bd[i + 1] * blurWeight)));
      od[i + 2] = Math.max(0, Math.min(255, Math.round(sd[i + 2] * sharpWeight + bd[i + 2] * blurWeight)));
      od[i + 3] = sd[i + 3];
    }
  }
  return out;
}

/**
 * Chromatic aberration via radial channel offset with bilinear sampling.
 * @param imageData Source ImageData
 * @param amount Offset displacement distance in pixels (default: 5, range: 0..50)
 */
export function chromaticAberration(imageData: ImageData, amount = 5): ImageData {
  if (amount <= 0) return cloneImageData(imageData);
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const maxR = Math.hypot(cx, cy) || 1;

  const sampleR: [number, number, number, number] = [0, 0, 0, 0];
  const sampleB: [number, number, number, number] = [0, 0, 0, 0];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;

      const rx = x + dx * amount;
      const ry = y + dy * amount;
      const bx = x - dx * amount;
      const by = y - dy * amount;

      sampleBilinear(imageData, rx, ry, sampleR);
      sampleBilinear(imageData, bx, by, sampleB);

      od[i] = Math.max(0, Math.min(255, Math.round(sampleR[0])));
      od[i + 1] = sd[i + 1];
      od[i + 2] = Math.max(0, Math.min(255, Math.round(sampleB[2])));
      od[i + 3] = sd[i + 3];
    }
  }
  return out;
}

/**
 * Glow / bloom filter via thresholded bright-pass and blurred add.
 * @param imageData Source ImageData
 * @param threshold Luminance threshold for glow (default: 180, range: 0..255)
 * @param blurRadius Blur radius for glow bloom (default: 12, range: 0..50)
 * @param intensity Glow brightness multiplier (default: 1.0, range: 0..5)
 */
export function glow(
  imageData: ImageData,
  threshold = 180,
  blurRadius = 12,
  intensity = 1.0
): ImageData {
  const brightPass = cloneImageData(imageData);
  const bpd = brightPass.data;
  const sd = imageData.data;

  for (let i = 0; i < sd.length; i += 4) {
    const luma = 0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2];
    if (luma < threshold) {
      bpd[i] = bpd[i + 1] = bpd[i + 2] = 0;
    }
  }

  const blurred = gaussianBlur(brightPass, blurRadius);
  const bd = blurred.data;
  const out = cloneImageData(imageData);
  const od = out.data;

  for (let i = 0; i < sd.length; i += 4) {
    od[i] = Math.max(0, Math.min(255, Math.round(sd[i] + bd[i] * intensity)));
    od[i + 1] = Math.max(0, Math.min(255, Math.round(sd[i + 1] + bd[i + 1] * intensity)));
    od[i + 2] = Math.max(0, Math.min(255, Math.round(sd[i + 2] + bd[i + 2] * intensity)));
    od[i + 3] = sd[i + 3];
  }

  return out;
}

/**
 * Pixelate effect via block averaging.
 * @param imageData Source ImageData
 * @param blockSize Block size in pixels (default: 12, range: 1..200)
 */
export function pixelate(imageData: ImageData, blockSize = 12): ImageData {
  const bs = Math.max(1, Math.floor(blockSize));
  if (bs <= 1) return cloneImageData(imageData);

  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  for (let y = 0; y < H; y += bs) {
    for (let x = 0; x < W; x += bs) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
      const maxY = Math.min(H, y + bs);
      const maxX = Math.min(W, x + bs);

      for (let by = y; by < maxY; by++) {
        for (let bx = x; bx < maxX; bx++) {
          const i = (by * W + bx) * 4;
          rSum += sd[i];
          gSum += sd[i + 1];
          bSum += sd[i + 2];
          aSum += sd[i + 3];
          count++;
        }
      }

      const avgR = Math.round(rSum / count);
      const avgG = Math.round(gSum / count);
      const avgB = Math.round(bSum / count);
      const avgA = Math.round(aSum / count);

      for (let by = y; by < maxY; by++) {
        for (let bx = x; bx < maxX; bx++) {
          const i = (by * W + bx) * 4;
          od[i] = avgR;
          od[i + 1] = avgG;
          od[i + 2] = avgB;
          od[i + 3] = avgA;
        }
      }
    }
  }

  return out;
}

/**
 * Sepia tone filter.
 * @param imageData Source ImageData
 * @param intensity Sepia mix intensity (default: 1.0, range: 0..1)
 */
export function sepia(imageData: ImageData, intensity = 1.0): ImageData {
  if (intensity <= 0) return cloneImageData(imageData);
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;
  const k = Math.max(0, Math.min(1, intensity));

  for (let i = 0; i < sd.length; i += 4) {
    const r = sd[i], g = sd[i + 1], b = sd[i + 2];
    const sr = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
    const sg = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
    const sb = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);

    od[i] = Math.max(0, Math.min(255, Math.round(r + (sr - r) * k)));
    od[i + 1] = Math.max(0, Math.min(255, Math.round(g + (sg - g) * k)));
    od[i + 2] = Math.max(0, Math.min(255, Math.round(b + (sb - b) * k)));
    od[i + 3] = sd[i + 3];
  }

  return out;
}

/**
 * Lens flare overlay.
 * @param imageData Source ImageData
 * @param centerX Flare origin X coordinate (default: 0.7 * W)
 * @param centerY Flare origin Y coordinate (default: 0.3 * H)
 * @param intensity Flare brightness multiplier (default: 1.0, range: 0..5)
 */
export function lensFlare(
  imageData: ImageData,
  centerX?: number,
  centerY?: number,
  intensity = 1.0
): ImageData {
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  const cx = centerX ?? W * 0.7;
  const cy = centerY ?? H * 0.3;
  const mainR = Math.max(W, H) * 0.45;
  const k = Math.max(0, intensity);

  const axisX = W / 2 - cx;
  const axisY = H / 2 - cy;

  const ghostT = [0.2, 0.45, 0.7, 1.1, 1.5];
  const ghostOrbs = ghostT.map((t, idx) => ({
    gx: cx + axisX * t,
    gy: cy + axisY * t,
    r: (30 + (idx % 3) * 20) * (Math.min(W, H) / 500),
    color: idx % 2 === 0 ? [180, 120, 255] : [255, 200, 160],
  }));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;

      const dMain = Math.hypot(x - cx, y - cy);
      let fR = 0, fG = 0, fB = 0;

      if (dMain < mainR) {
        const fall = Math.pow(1 - dMain / mainR, 2) * k;
        fR += fall * 255;
        fG += fall * 210;
        fB += fall * 160;
      }

      for (const orb of ghostOrbs) {
        const dOrb = Math.hypot(x - orb.gx, y - orb.gy);
        if (dOrb < orb.r) {
          const gFall = (1 - dOrb / orb.r) * 0.35 * k;
          fR += gFall * orb.color[0];
          fG += gFall * orb.color[1];
          fB += gFall * orb.color[2];
        }
      }

      od[i] = Math.max(0, Math.min(255, Math.round(sd[i] + fR)));
      od[i + 1] = Math.max(0, Math.min(255, Math.round(sd[i + 1] + fG)));
      od[i + 2] = Math.max(0, Math.min(255, Math.round(sd[i + 2] + fB)));
      od[i + 3] = sd[i + 3];
    }
  }

  return out;
}

/**
 * Dispersion particle shatter filter.
 * @param imageData Source ImageData
 * @param density Number of particle samples (default: 1200)
 * @param spread Dispersion displacement radius ratio (default: 0.25)
 */
export function dispersion(imageData: ImageData, density = 1200, spread = 0.25): ImageData {
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  let seed = 1234567;
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  for (let n = 0; n < density; n++) {
    const sx = Math.floor((rand() * 0.6 + 0.2) * W);
    const sy = Math.floor(rand() * H);
    const srcIdx = (sy * W + sx) * 4;

    const r = sd[srcIdx], g = sd[srcIdx + 1], b = sd[srcIdx + 2], a = sd[srcIdx + 3];
    if (a < 16) continue;

    const dx = Math.floor(sx + (rand() - 0.3) * W * spread);
    const dy = Math.floor(sy + (rand() - 0.5) * H * spread * 0.5);
    const pRadius = Math.floor(rand() * 3 + 1);

    for (let py = -pRadius; py <= pRadius; py++) {
      for (let px = -pRadius; px <= pRadius; px++) {
        const tx = dx + px;
        const ty = dy + py;
        if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
        if (px * px + py * py > pRadius * pRadius) continue;

        const dstIdx = (ty * W + tx) * 4;
        const alpha = rand() * 0.5 + 0.5;
        od[dstIdx] = Math.max(0, Math.min(255, Math.round(od[dstIdx] * (1 - alpha) + r * alpha)));
        od[dstIdx + 1] = Math.max(0, Math.min(255, Math.round(od[dstIdx + 1] * (1 - alpha) + g * alpha)));
        od[dstIdx + 2] = Math.max(0, Math.min(255, Math.round(od[dstIdx + 2] * (1 - alpha) + b * alpha)));
        od[dstIdx + 3] = 255;
      }
    }
  }

  return out;
}

/**
 * Motion blur filter along a specified angle.
 * @param imageData Source ImageData
 * @param angle Direction angle in degrees (default: 0)
 * @param distance Blur line length in pixels (default: 10, range: 0..100)
 */
export function motionBlur(imageData: ImageData, angle = 0, distance = 10): ImageData {
  if (distance <= 0) return cloneImageData(imageData);
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  const steps = Math.max(1, Math.round(distance));
  const halfSteps = steps / 2;
  const sampleBuf: [number, number, number, number] = [0, 0, 0, 0];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0;

      for (let s = 0; s < steps; s++) {
        const t = s - halfSteps;
        const sx = x + dx * t;
        const sy = y + dy * t;
        sampleBilinear(imageData, sx, sy, sampleBuf);

        rSum += sampleBuf[0];
        gSum += sampleBuf[1];
        bSum += sampleBuf[2];
        aSum += sampleBuf[3];
      }

      const i = (y * W + x) * 4;
      od[i] = Math.max(0, Math.min(255, Math.round(rSum / steps)));
      od[i + 1] = Math.max(0, Math.min(255, Math.round(gSum / steps)));
      od[i + 2] = Math.max(0, Math.min(255, Math.round(bSum / steps)));
      od[i + 3] = sd[i + 3];
    }
  }

  return out;
}

/**
 * Stretch image horizontally and vertically about center.
 * @param imageData Source ImageData
 * @param scaleX Horizontal stretch multiplier (default: 1.5)
 * @param scaleY Vertical stretch multiplier (default: 1.0)
 */
export function stretch(imageData: ImageData, scaleX = 1.5, scaleY = 1.0): ImageData {
  const sxFactor = Math.max(0.01, scaleX);
  const syFactor = Math.max(0.01, scaleY);
  if (sxFactor === 1 && syFactor === 1) return cloneImageData(imageData);

  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const od = out.data;

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const sampleBuf: [number, number, number, number] = [0, 0, 0, 0];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const srcX = cx + (x - cx) / sxFactor;
      const srcY = cy + (y - cy) / syFactor;

      sampleBilinear(imageData, srcX, srcY, sampleBuf);

      const i = (y * W + x) * 4;
      od[i] = Math.max(0, Math.min(255, Math.round(sampleBuf[0])));
      od[i + 1] = Math.max(0, Math.min(255, Math.round(sampleBuf[1])));
      od[i + 2] = Math.max(0, Math.min(255, Math.round(sampleBuf[2])));
      od[i + 3] = Math.max(0, Math.min(255, Math.round(sampleBuf[3])));
    }
  }

  return out;
}

export const GRADIENT_MAP_PRESETS: Record<PresetGradientName, GradientStop[]> = {
  'thermal-purple': [
    { offset: 0, color: '#000000' },
    { offset: 0.5, color: '#A855F7' },
    { offset: 1.0, color: '#FFFFFF' },
  ],
  'thermal-blue': [
    { offset: 0, color: '#000000' },
    { offset: 0.4, color: '#3B82F6' },
    { offset: 0.75, color: '#93C5FD' },
    { offset: 1.0, color: '#FFFFFF' },
  ],
  'red-ink': [
    { offset: 0, color: '#000000' },
    { offset: 0.5, color: '#DC2626' },
    { offset: 0.8, color: '#FCA5A5' },
    { offset: 1.0, color: '#FFFFFF' },
  ],
  'black-ink': [
    { offset: 0, color: '#000000' },
    { offset: 0.5, color: '#4B5563' },
    { offset: 1.0, color: '#FFFFFF' },
  ],
  'sepia': [
    { offset: 0, color: '#000000' },
    { offset: 0.5, color: '#78350F' },
    { offset: 0.8, color: '#FDE68A' },
    { offset: 1.0, color: '#FFFFFF' },
  ],
};

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Gradient map filter (luminance -> multi-stop gradient LUT).
 * @param imageData Source ImageData
 * @param stops Custom gradient stops
 * @param presetName Preset name if stops not provided (default: 'thermal-purple')
 */
export function gradientMap(
  imageData: ImageData,
  stops?: GradientStop[],
  presetName: PresetGradientName = 'thermal-purple'
): ImageData {
  const activeStops = stops && stops.length >= 2 ? stops : (GRADIENT_MAP_PRESETS[presetName] || GRADIENT_MAP_PRESETS['thermal-purple']);
  const sortedStops = [...activeStops].sort((a, b) => a.offset - b.offset);

  const lut = new Uint8ClampedArray(256 * 3);
  let seg = 0;

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    while (seg < sortedStops.length - 2 && t > sortedStops[seg + 1].offset) seg++;
    const s0 = sortedStops[seg];
    const s1 = sortedStops[seg + 1];

    const range = s1.offset - s0.offset || 1;
    const localT = Math.max(0, Math.min(1, (t - s0.offset) / range));

    const rgb0 = hexToRgbTuple(s0.color);
    const rgb1 = hexToRgbTuple(s1.color);

    lut[i * 3] = Math.round(rgb0[0] + (rgb1[0] - rgb0[0]) * localT);
    lut[i * 3 + 1] = Math.round(rgb0[1] + (rgb1[1] - rgb0[1]) * localT);
    lut[i * 3 + 2] = Math.round(rgb0[2] + (rgb1[2] - rgb0[2]) * localT);
  }

  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  for (let i = 0; i < sd.length; i += 4) {
    const luma = Math.round(0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2]);
    const clampedLuma = Math.max(0, Math.min(255, luma));

    od[i] = lut[clampedLuma * 3];
    od[i + 1] = lut[clampedLuma * 3 + 1];
    od[i + 2] = lut[clampedLuma * 3 + 2];
    od[i + 3] = sd[i + 3];
  }

  return out;
}

/** Horizontal flip. */
export function flipH(imageData: ImageData): ImageData {
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const srcIdx = (y * W + x) * 4;
      const dstIdx = (y * W + (W - 1 - x)) * 4;

      od[dstIdx] = sd[srcIdx];
      od[dstIdx + 1] = sd[srcIdx + 1];
      od[dstIdx + 2] = sd[srcIdx + 2];
      od[dstIdx + 3] = sd[srcIdx + 3];
    }
  }
  return out;
}

/** Vertical flip. */
export function flipV(imageData: ImageData): ImageData {
  const W = imageData.width, H = imageData.height;
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const srcIdx = (y * W + x) * 4;
      const dstIdx = ((H - 1 - y) * W + x) * 4;

      od[dstIdx] = sd[srcIdx];
      od[dstIdx + 1] = sd[srcIdx + 1];
      od[dstIdx + 2] = sd[srcIdx + 2];
      od[dstIdx + 3] = sd[srcIdx + 3];
    }
  }
  return out;
}

/**
 * 90 degree rotation. Returns new ImageData with swapped dimensions.
 * @param imageData Source ImageData
 * @param direction Rotation direction ('cw' or 'ccw', default: 'cw')
 */
export function rotate90(imageData: ImageData, direction: 'cw' | 'ccw' = 'cw'): ImageData {
  const W = imageData.width, H = imageData.height;
  const outW = H;
  const outH = W;
  const out = createImageData(outW, outH);
  const sd = imageData.data, od = out.data;

  if (direction === 'cw') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const srcIdx = (y * W + x) * 4;
        const outX = H - 1 - y;
        const outY = x;
        const dstIdx = (outY * outW + outX) * 4;

        od[dstIdx] = sd[srcIdx];
        od[dstIdx + 1] = sd[srcIdx + 1];
        od[dstIdx + 2] = sd[srcIdx + 2];
        od[dstIdx + 3] = sd[srcIdx + 3];
      }
    }
  } else {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const srcIdx = (y * W + x) * 4;
        const outX = y;
        const outY = W - 1 - x;
        const dstIdx = (outY * outW + outX) * 4;

        od[dstIdx] = sd[srcIdx];
        od[dstIdx + 1] = sd[srcIdx + 1];
        od[dstIdx + 2] = sd[srcIdx + 2];
        od[dstIdx + 3] = sd[srcIdx + 3];
      }
    }
  }
  return out;
}

/**
 * Resize image using Lanczos3 / bicubic resampling.
 * @param imageData Source ImageData
 * @param targetWidth Target width
 * @param targetHeight Target height
 * @param method Interpolation method ('lanczos3' | 'bicubic' | 'bilinear', default: 'lanczos3')
 */
export function resize(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number,
  method: 'bicubic' | 'lanczos3' | 'bilinear' = 'lanczos3'
): ImageData {
  const tw = Math.max(1, Math.floor(targetWidth));
  const th = Math.max(1, Math.floor(targetHeight));
  const sw = imageData.width;
  const sh = imageData.height;

  if (tw === sw && th === sh) return cloneImageData(imageData);
  const out = createImageData(tw, th);
  const od = out.data;

  if (method === 'bilinear') {
    const sampleBuf: [number, number, number, number] = [0, 0, 0, 0];
    for (let y = 0; y < th; y++) {
      const srcY = (y + 0.5) * (sh / th) - 0.5;
      for (let x = 0; x < tw; x++) {
        const srcX = (x + 0.5) * (sw / tw) - 0.5;
        sampleBilinear(imageData, srcX, srcY, sampleBuf);
        const i = (y * tw + x) * 4;
        od[i] = Math.max(0, Math.min(255, Math.round(sampleBuf[0])));
        od[i + 1] = Math.max(0, Math.min(255, Math.round(sampleBuf[1])));
        od[i + 2] = Math.max(0, Math.min(255, Math.round(sampleBuf[2])));
        od[i + 3] = Math.max(0, Math.min(255, Math.round(sampleBuf[3])));
      }
    }
    return out;
  }

  const lanczos3 = (x: number) => {
    if (x === 0) return 1;
    const ax = Math.abs(x);
    if (ax >= 3) return 0;
    const px = Math.PI * ax;
    return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
  };

  const tmpData = new Float32Array(tw * sh * 4);
  const scaleX = tw / sw;
  const rx = scaleX < 1 ? 3 / scaleX : 3;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < tw; x++) {
      const center = (x + 0.5) / scaleX - 0.5;
      const minX = Math.max(0, Math.floor(center - rx));
      const maxX = Math.min(sw - 1, Math.ceil(center + rx));

      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, wSum = 0;

      for (let sx = minX; sx <= maxX; sx++) {
        const d = (sx - center) * (scaleX < 1 ? scaleX : 1);
        const w = lanczos3(d);
        if (w === 0) continue;

        const idx = (y * sw + sx) * 4;
        rSum += imageData.data[idx] * w;
        gSum += imageData.data[idx + 1] * w;
        bSum += imageData.data[idx + 2] * w;
        aSum += imageData.data[idx + 3] * w;
        wSum += w;
      }

      const outIdx = (y * tw + x) * 4;
      const invW = wSum > 0 ? 1 / wSum : 1;
      tmpData[outIdx] = rSum * invW;
      tmpData[outIdx + 1] = gSum * invW;
      tmpData[outIdx + 2] = bSum * invW;
      tmpData[outIdx + 3] = aSum * invW;
    }
  }

  const scaleY = th / sh;
  const ry = scaleY < 1 ? 3 / scaleY : 3;

  for (let y = 0; y < th; y++) {
    const center = (y + 0.5) / scaleY - 0.5;
    const minY = Math.max(0, Math.floor(center - ry));
    const maxY = Math.min(sh - 1, Math.ceil(center + ry));

    for (let x = 0; x < tw; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0, wSum = 0;

      for (let sy = minY; sy <= maxY; sy++) {
        const d = (sy - center) * (scaleY < 1 ? scaleY : 1);
        const w = lanczos3(d);
        if (w === 0) continue;

        const idx = (sy * tw + x) * 4;
        rSum += tmpData[idx] * w;
        gSum += tmpData[idx + 1] * w;
        bSum += tmpData[idx + 2] * w;
        aSum += tmpData[idx + 3] * w;
        wSum += w;
      }

      const outIdx = (y * tw + x) * 4;
      const invW = wSum > 0 ? 1 / wSum : 1;
      od[outIdx] = Math.max(0, Math.min(255, Math.round(rSum * invW)));
      od[outIdx + 1] = Math.max(0, Math.min(255, Math.round(gSum * invW)));
      od[outIdx + 2] = Math.max(0, Math.min(255, Math.round(bSum * invW)));
      od[outIdx + 3] = Math.max(0, Math.min(255, Math.round(aSum * invW)));
    }
  }

  return out;
}

/**
 * Build 256-entry lookup table using Fritsch-Carlson monotone cubic spline interpolation.
 * @param points Control points (x: 0..255, y: 0..255)
 */
export function buildCurveLUT(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  if (!points || points.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts[0].x > 0) pts.unshift({ x: 0, y: pts[0].y });
  if (pts[pts.length - 1].x < 255) pts.push({ x: 255, y: pts[pts.length - 1].y });

  const cleanPts: CurvePoint[] = [];
  for (const p of pts) {
    if (cleanPts.length > 0 && cleanPts[cleanPts.length - 1].x === p.x) {
      cleanPts[cleanPts.length - 1] = p;
    } else {
      cleanPts.push({ x: Math.max(0, Math.min(255, p.x)), y: Math.max(0, Math.min(255, p.y)) });
    }
  }

  const n = cleanPts.length - 1;
  if (n === 0) {
    lut.fill(cleanPts[0].y);
    return lut;
  }

  const dx = new Float32Array(n);
  const dy = new Float32Array(n);
  const slope = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    dx[i] = cleanPts[i + 1].x - cleanPts[i].x;
    dy[i] = cleanPts[i + 1].y - cleanPts[i].y;
    slope[i] = dx[i] !== 0 ? dy[i] / dx[i] : 0;
  }

  const m = new Float32Array(n + 1);
  m[0] = slope[0];
  m[n] = slope[n - 1];

  for (let i = 1; i < n; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slope[i - 1] + slope[i]) / 2;
    }
  }

  for (let i = 0; i < n; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / slope[i];
      const beta = m[i + 1] / slope[i];
      const dist = alpha * alpha + beta * beta;
      if (dist > 9) {
        const tau = 3 / Math.sqrt(dist);
        m[i] = tau * alpha * slope[i];
        m[i + 1] = tau * beta * slope[i];
      }
    }
  }

  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < n - 1 && x > cleanPts[seg + 1].x) seg++;
    const x0 = cleanPts[seg].x;
    const x1 = cleanPts[seg + 1].x;
    const y0 = cleanPts[seg].y;
    const y1 = cleanPts[seg + 1].y;
    const h = x1 - x0;

    if (h === 0) {
      lut[x] = Math.max(0, Math.min(255, Math.round(y0)));
    } else {
      const t = (x - x0) / h;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      const val = h00 * y0 + h10 * h * m[seg] + h01 * y1 + h11 * h * m[seg + 1];
      lut[x] = Math.max(0, Math.min(255, Math.round(val)));
    }
  }

  return lut;
}

/**
 * Apply curve points to image channels using Fritsch-Carlson monotone cubic LUT.
 * @param imageData Source ImageData
 * @param points Control points (x: 0..255, y: 0..255)
 * @param channel Channel target ('all' | 'red' | 'green' | 'blue', default: 'all')
 */
export function applyCurves(
  imageData: ImageData,
  points: CurvePoint[],
  channel: 'all' | 'red' | 'green' | 'blue' = 'all'
): ImageData {
  const lut = buildCurveLUT(points);
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  for (let i = 0; i < sd.length; i += 4) {
    if (channel === 'all' || channel === 'red') od[i] = lut[sd[i]];
    if (channel === 'all' || channel === 'green') od[i + 1] = lut[sd[i + 1]];
    if (channel === 'all' || channel === 'blue') od[i + 2] = lut[sd[i + 2]];
    od[i + 3] = sd[i + 3];
  }

  return out;
}

/**
 * Build 256-entry LUT for Levels adjustment.
 * @param params Levels parameters
 */
export function buildLevelsLUT(params: LevelsParams): Uint8ClampedArray {
  const range = Math.max(1, params.inWhite - params.inBlack);
  const gammaExp = 1 / Math.max(0.01, params.gamma);
  const lut = new Uint8ClampedArray(256);

  for (let i = 0; i < 256; i++) {
    let n = (i - params.inBlack) / range;
    n = Math.max(0, Math.min(1, n));
    n = Math.pow(n, gammaExp);
    const val = params.outBlack + n * (params.outWhite - params.outBlack);
    lut[i] = Math.max(0, Math.min(255, Math.round(val)));
  }

  return lut;
}

/**
 * Apply Levels adjustment to image.
 * @param imageData Source ImageData
 * @param params Levels parameters
 */
export function applyLevels(imageData: ImageData, params: LevelsParams): ImageData {
  const lut = buildLevelsLUT(params);
  const out = cloneImageData(imageData);
  const sd = imageData.data, od = out.data;

  for (let i = 0; i < sd.length; i += 4) {
    od[i] = lut[sd[i]];
    od[i + 1] = lut[sd[i + 1]];
    od[i + 2] = lut[sd[i + 2]];
    od[i + 3] = sd[i + 3];
  }

  return out;
}

/**
 * Build 3D Tonal Map guide lines on a transparent-background ImageData.
 * @param imageData Source ImageData
 * @param opts Options (outWidth?, minLen?)
 */
export function buildTonalMap(
  imageData: ImageData,
  opts?: { outWidth?: number; minLen?: number }
): ImageData {
  const minLen = opts?.minLen ?? 14;
  const targetW = opts?.outWidth ?? imageData.width;
  const scale = targetW / imageData.width;
  const targetH = Math.max(1, Math.round(imageData.height * scale));

  const W = imageData.width, H = imageData.height;
  const sd = imageData.data;

  const luma = new Uint8Array(W * H);
  const hist = new Float64Array(64);

  for (let i = 0, j = 0; i < sd.length; i += 4, j++) {
    const l = Math.round(0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2]);
    luma[j] = l;
    hist[Math.min(63, Math.floor((l / 256) * 64))]++;
  }

  const total = W * H;
  let bestVariance = -1;
  let t1 = 85, t2 = 170;

  if (total > 0) {
    const p = hist.map((c) => c / total);
    let globalMu = 0;
    for (let k = 0; k < 64; k++) globalMu += k * p[k];

    for (let i = 1; i < 62; i++) {
      let w0 = 0, mu0 = 0;
      for (let k = 0; k <= i; k++) {
        w0 += p[k];
        mu0 += k * p[k];
      }
      if (w0 < 1e-6) continue;
      mu0 /= w0;

      for (let j = i + 1; j < 63; j++) {
        let w1 = 0, mu1 = 0;
        for (let k = i + 1; k <= j; k++) {
          w1 += p[k];
          mu1 += k * p[k];
        }
        if (w1 < 1e-6) continue;
        mu1 /= w1;

        const w2 = 1 - w0 - w1;
        if (w2 < 1e-6) continue;
        const mu2 = (globalMu - w0 * mu0 - w1 * mu1) / w2;

        const v = w0 * (mu0 - globalMu) ** 2 + w1 * (mu1 - globalMu) ** 2 + w2 * (mu2 - globalMu) ** 2;
        if (v > bestVariance) {
          bestVariance = v;
          t1 = Math.round((i / 64) * 255);
          t2 = Math.round((j / 64) * 255);
        }
      }
    }
  }

  const darkMask = new Uint8Array(W * H);
  const lightMask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (luma[i] < t1) darkMask[i] = 1;
    if (luma[i] > t2) lightMask[i] = 1;
  }

  const smooth = (mask: Uint8Array) => {
    const outMask = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += mask[(y + dy) * W + (x + dx)];
          }
        }
        outMask[y * W + x] = sum >= 5 ? 1 : 0;
      }
    }
    return outMask;
  };

  const smoothDark = smooth(smooth(darkMask));
  const smoothLight = smooth(smooth(lightMask));

  const traceContours = (mask: Uint8Array) => {
    const visited = new Uint8Array(W * H);
    const polys: number[][][] = [];
    const NX = [1, 1, 0, -1, -1, -1, 0, 1];
    const NY = [0, 1, 1, 1, 0, -1, -1, -1];

    const isBorder = (x: number, y: number) => {
      if (!mask[y * W + x]) return false;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return true;
      return !mask[y * W + x - 1] || !mask[y * W + x + 1] || !mask[(y - 1) * W + x] || !mask[(y + 1) * W + x];
    };

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        if (visited[idx] || !isBorder(x, y)) continue;

        const poly: number[][] = [[x, y]];
        visited[idx] = 1;
        let cx = x, cy = y, dir = 0;
        let safety = 0;

        while (safety++ < 4000) {
          let found = false;
          for (let k = 0; k < 8; k++) {
            const nd = (dir + 6 + k) & 7;
            const nx = cx + NX[nd], ny = cy + NY[nd];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (isBorder(nx, ny)) {
              cx = nx; cy = ny; dir = nd;
              const nidx = ny * W + nx;
              if (visited[nidx]) {
                found = false;
                break;
              }
              visited[nidx] = 1;
              poly.push([cx, cy]);
              found = true;
              break;
            }
          }
          if (!found) break;
          if (cx === x && cy === y) break;
        }

        if (poly.length >= minLen) polys.push(poly);
      }
    }
    return polys;
  };

  const darkPolys = traceContours(smoothDark);
  const lightPolys = traceContours(smoothLight);

  const outImage = createImageData(targetW, targetH);
  const od = outImage.data;

  const strokeDashedPoly = (poly: number[][], color: [number, number, number, number]) => {
    let distAcc = 0;
    const dashOn = 6, dashOff = 5;
    const patternLen = dashOn + dashOff;

    for (let i = 0; i < poly.length - 1; i++) {
      const p1 = poly[i], p2 = poly[i + 1];
      const x1 = p1[0] * scale, y1 = p1[1] * scale;
      const x2 = p2[0] * scale, y2 = p2[1] * scale;
      const segLen = Math.hypot(x2 - x1, y2 - y1);
      if (segLen === 0) continue;

      const steps = Math.ceil(segLen * 2);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = Math.round(x1 + (x2 - x1) * t);
        const py = Math.round(y1 + (y2 - y1) * t);

        const curDist = distAcc + t * segLen;
        if ((curDist % patternLen) < dashOn) {
          for (let dy = 0; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
              const tx = px + dx, ty = py + dy;
              if (tx >= 0 && ty >= 0 && tx < targetW && ty < targetH) {
                const idx = (ty * targetW + tx) * 4;
                od[idx] = color[0];
                od[idx + 1] = color[1];
                od[idx + 2] = color[2];
                od[idx + 3] = color[3];
              }
            }
          }
        }
      }
      distAcc += segLen;
    }
  };

  for (const p of darkPolys) strokeDashedPoly(p, [239, 68, 68, 255]);
  for (const p of lightPolys) strokeDashedPoly(p, [250, 204, 21, 255]);

  return outImage;
}

export const CURVES_PRESETS: Record<string, CurvePoint[]> = {
  Linear: [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ],
  "Stencil Clean": [
    { x: 0, y: 0 },
    { x: 95, y: 15 },
    { x: 165, y: 240 },
    { x: 255, y: 255 },
  ],
  "Line Sharpen": [
    { x: 0, y: 0 },
    { x: 64, y: 38 },
    { x: 128, y: 128 },
    { x: 192, y: 225 },
    { x: 255, y: 255 },
  ],
  "High Contrast": [
    { x: 0, y: 0 },
    { x: 110, y: 28 },
    { x: 145, y: 228 },
    { x: 255, y: 255 },
  ],
};

export const LEVELS_PRESETS: Record<string, LevelsParams> = {
  Default: { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 },
  "Stencil Clean": { inBlack: 60, inWhite: 200, gamma: 0.85, outBlack: 0, outWhite: 255 },
  "Line Sharpen": { inBlack: 40, inWhite: 220, gamma: 1.1, outBlack: 0, outWhite: 255 },
};
