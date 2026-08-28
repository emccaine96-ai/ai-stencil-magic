/**
 * Module 10 — Background separation modes.
 * Applies keep/remove/simplify/fade to the final layer based on a
 * background mask. 'simplify' is handled upstream via region param fields.
 */

export type BackgroundMode = 'keep' | 'remove' | 'simplify' | 'fade';

export function applyBackgroundMode(
  finalLayer: Uint8ClampedArray, backgroundMask: Uint8Array, w: number, h: number,
  mode: BackgroundMode, fadeOpacity = 0.25
): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(finalLayer);
  for (let i = 0; i < w * h; i++) {
    if (!backgroundMask[i]) continue;
    if (mode === 'remove') out[i] = 0;
    else if (mode === 'fade') out[i] = Math.round(out[i] * fadeOpacity);
  }
  return out;
}
