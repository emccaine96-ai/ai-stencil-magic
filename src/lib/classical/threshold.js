/**
 * Adaptive threshold using integral images (summed-area table) for O(1) per-pixel mean.
 * Replaces the nested-loop version — same output, dramatically faster for large blocks.
 *
 * Extracted and upgraded from ClassicalProEngine per Master Spec Phase 1.
 */
import { integralImage } from './integral-image.js';

function computeInkMask(imageData, blockSize, biasPct) {
  const { width, height, data } = imageData;
  const half = Math.floor(blockSize / 2);
  const integral = integralImage(imageData);
  const mask = new Uint8Array(width * height); // 1 = ink

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(height - 1, y + half);
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);

      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum = integral[y1 * width + x1]
        - (y0 > 0 ? integral[(y0 - 1) * width + x1] : 0)
        - (x0 > 0 ? integral[y1 * width + (x0 - 1)] : 0)
        + (y0 > 0 && x0 > 0 ? integral[(y0 - 1) * width + (x0 - 1)] : 0);

      const mean = sum / area;
      const idx = (y * width + x) * 4;
      mask[y * width + x] = data[idx] < mean * (1 - biasPct) ? 1 : 0;
    }
  }
  return mask;
}

// Hysteresis edge-tracking (Canny-style), 8-connected. XDoG's edge signal
// naturally tapers off near soft/low-contrast transitions (skin gradients,
// hair against a dim background) -- a single hard threshold can dip below
// cutoff for a few pixels even along what should be one continuous line,
// reading as broken/dashed. A strong threshold marks definite ink; a
// weaker, more permissive threshold marks candidates that ONLY become ink
// if actually connected (directly or via a chain) to a definite-ink pixel.
// This rescues real-but-weak line continuation without lowering the
// threshold everywhere (which would just add noise/fuzz elsewhere).
function hysteresisPromote(strongMask, weakMask, width, height) {
  const inkMask = new Uint8Array(width * height);
  const stack = [];
  for (let i = 0; i < strongMask.length; i++) {
    if (strongMask[i]) { inkMask[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width, y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        const j = ny * width + nx;
        if (!inkMask[j] && weakMask[j]) {
          inkMask[j] = 1;
          stack.push(j);
        }
      }
    }
  }
  return inkMask;
}

// Diagonal-connectivity bridging. A binary raster line, especially one
// derived from a per-pixel adaptive threshold reacting to real image
// texture (not a geometrically ideal line), often ends up 8-connected but
// NOT 4-connected: two ink pixels touch only at a corner, with neither of
// the two "L-shaped" pixels between them also ink. At normal size this is
// invisible, but at zoom it reads as a checkerboard chain of separate
// dots/squares rather than one continuous stroke -- exactly the "lines
// look like they're made of dots" complaint. Fix: wherever a pixel and its
// diagonal neighbor are both ink but neither connecting side-pixel is,
// fill in one connecting side-pixel so the stroke becomes 4-connected.
// Purely additive (never removes ink) and strictly local -- does not
// change line placement/thickness anywhere the raster was already solid.
function bridgeDiagonalGaps(mask, width, height) {
  const out = mask.slice();
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      const iRight = i + 1;
      const iDown = i + width;
      const iDiag = iDown + 1;
      // "\" diagonal: (x,y) and (x+1,y+1) are ink, neither side-neighbor is
      if (mask[i] && mask[iDiag] && !mask[iRight] && !mask[iDown]) {
        out[iRight] = 1;
      }
      // "/" diagonal: (x+1,y) and (x,y+1) are ink, neither side-neighbor is
      if (mask[iRight] && mask[iDown] && !mask[i] && !mask[iDiag]) {
        out[i] = 1;
      }
    }
  }
  return out;
}

function maskToImageData(mask, width, height) {
  const out = new ImageData(width, height);
  const o = out.data;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 0 : 255;
    const idx = i * 4;
    o[idx] = o[idx + 1] = o[idx + 2] = v;
    o[idx + 3] = 255;
  }
  return out;
}

export function adaptiveThreshold(imageData, blockSize, biasPct = 0.15, opts = null) {
  if (blockSize % 2 === 0) blockSize += 1;
  const { width, height } = imageData;

  // Bradley's adaptive threshold: pixel is ink when below biasPct of local
  // mean. Fixed offset (-5) was too aggressive in high-mean regions (solid
  // blobs) and not adaptive to local contrast. Relative bias scales correctly.
  let mask = computeInkMask(imageData, blockSize, biasPct);

  // Both additions below are opt-in (default off) so every existing call
  // site -- including the regression test suite, which calls this with 2
  // args -- gets byte-identical output to before. Only applyXDoG's line
  // extraction (the one place broken/dotty lines were reported) enables them.
  if (opts?.hysteresis) {
    const weakBiasPct = opts.hysteresisWeakBiasPct ?? Math.max(0, biasPct - 0.03);
    const weakMask = computeInkMask(imageData, blockSize, weakBiasPct);
    mask = hysteresisPromote(mask, weakMask, width, height);
  }
  if (opts?.bridgeDiagonals) {
    mask = bridgeDiagonalGaps(mask, width, height);
  }

  return maskToImageData(mask, width, height);
}
