/**
 * Selective/Local Touch-Up compositing.
 *
 * Reuses the brush stroke system already working in VaultProcreateEditor
 * (beginStroke/strokeTo/endStroke from @/lib/brushes), painting onto a mask
 * instead of visible ink. This module composites the adjusted image with the
 * mask to apply effects only where the artist painted.
 *
 * Part of the Vault Editor Touch-Up Tools guide.
 */

/**
 * Blend `transformed` onto `original` using mask alpha.
 * Where maskAlpha = 0: keep original.
 * Where maskAlpha = 255: use transformed.
 * In between: linear blend.
 *
 * @param original - pre-adjustment ImageData
 * @param transformed - post-adjustment ImageData
 * @param maskAlpha - 0-255 per-pixel mask, read from a mask canvas
 * @returns composited ImageData
 */
export function applyWithinMask(
  original: ImageData,
  transformed: ImageData,
  maskAlpha: Uint8ClampedArray,
): ImageData {
  const out = new Uint8ClampedArray(original.data.length);
  for (let p = 0; p < maskAlpha.length; p++) {
    const a = maskAlpha[p] / 255;
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      out[i + c] = original.data[i + c] * (1 - a) + transformed.data[i + c] * a;
    }
    out[i + 3] = original.data[i + 3];
  }
  return new ImageData(out, original.width, original.height);
}
