/**
 * Adaptive threshold using integral images (summed-area table) for O(1) per-pixel mean.
 * Replaces the nested-loop version — same output, dramatically faster for large blocks.
 *
 * Extracted and upgraded from ClassicalProEngine per Master Spec Phase 1.
 */
import { integralImage } from './integral-image.js';

export function adaptiveThreshold(imageData, blockSize, biasPct = 0.15) {
  if (blockSize % 2 === 0) blockSize += 1;
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;
  const half = Math.floor(blockSize / 2);

  // Build integral image (summed-area table) of luminance values
  const integral = integralImage(imageData);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Window bounds (clamped to image edges)
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(height - 1, y + half);
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);

      // O(1) sum via integral image: sum = I[y1][x1] - I[y0-1][x1] - I[y1][x0-1] + I[y0-1][x0-1]
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum = integral[y1 * width + x1]
        - (y0 > 0 ? integral[(y0 - 1) * width + x1] : 0)
        - (x0 > 0 ? integral[y1 * width + (x0 - 1)] : 0)
        + (y0 > 0 && x0 > 0 ? integral[(y0 - 1) * width + (x0 - 1)] : 0);

      const mean = sum / area;
      const idx = (y * width + x) * 4;
      // Bradley's adaptive threshold: pixel is ink when below biasPct of local mean.
      // Fixed offset (-5) was too aggressive in high-mean regions (solid blobs)
      // and not adaptive to local contrast. Relative bias scales correctly.
      const v = data[idx] < mean * (1 - biasPct) ? 0 : 255;
      o[idx] = o[idx + 1] = o[idx + 2] = v;
      o[idx + 3] = 255;
    }
  }
  return out;
}
