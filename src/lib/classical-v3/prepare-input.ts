// src/lib/classical-v3/prepare-input.ts
/**
 * Loads a photo (data URL or URL) into ImageData at a size the V3 engine can render quickly.
 *
 * The V3 pipeline is several full-image Gaussian and Hessian passes, so cost grows with pixel count
 * (measured ~2.4 s at 1024 px long edge). The cap below keeps a render to a few seconds on a phone.
 */

/** default longest-edge cap for V3 rendering */
export const V3_MAX_EDGE = 1280;

/** Pure sizing rule, exported so it can be tested without a DOM. Never upscales, never returns 0. */
export function fitWithin(srcW: number, srcH: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(srcW, srcH);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

/** Decode a photo into ImageData, downscaled to fit `maxEdge`. */
export async function photoToImageData(src: string, maxEdge = V3_MAX_EDGE): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("That image couldn't be read. Try a PNG, JPEG or WebP photo."));
  });

  const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  // transparent photos (PNG cut-outs) are laid on white so they are not read as black
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Encode ImageData to a PNG data URL. */
export function imageDataToPngUrl(data: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}
