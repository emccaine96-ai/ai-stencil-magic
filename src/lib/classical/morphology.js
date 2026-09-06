/**
 * Morphological operations (open/close, dilate/erode) + connected-component blob filter.
 * Extracted from ClassicalProEngine for modularity.
 * NOTE: dilateErode() is correct — positive amount thickens ink, negative thins it.
 *       Do NOT modify per guardrails.
 */

export function morphology(imageData, ksize, op = 'open') {
  const kernel = Math.max(3, ksize | 1);
  const r = (kernel - 1) >> 1;
  const { width, height, data } = imageData;

  const erode = (src) => {
    const dst = new Uint8ClampedArray(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minV = 255;
        for (let ky = -r; ky <= r; ky++) {
          for (let kx = -r; kx <= r; kx++) {
            const yy = Math.max(0, Math.min(height - 1, y + ky));
            const xx = Math.max(0, Math.min(width - 1, x + kx));
            minV = Math.min(minV, src[(yy * width + xx) * 4]);
          }
        }
        const idx = (y * width + x) * 4;
        dst[idx] = dst[idx + 1] = dst[idx + 2] = minV;
        dst[idx + 3] = 255;
      }
    }
    return dst;
  };

  const dilate = (src) => {
    const dst = new Uint8ClampedArray(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxV = 0;
        for (let ky = -r; ky <= r; ky++) {
          for (let kx = -r; kx <= r; kx++) {
            const yy = Math.max(0, Math.min(height - 1, y + ky));
            const xx = Math.max(0, Math.min(width - 1, x + kx));
            maxV = Math.max(maxV, src[(yy * width + xx) * 4]);
          }
        }
        const idx = (y * width + x) * 4;
        dst[idx] = dst[idx + 1] = dst[idx + 2] = maxV;
        dst[idx + 3] = 255;
      }
    }
    return dst;
  };

  const srcArr = data;
  const resultArr = op === 'open' ? dilate(erode(srcArr)) : erode(dilate(srcArr));

  const out = new ImageData(width, height);
  out.data.set(resultArr);
  return out;
}

export function removeSmallBlobs(imageData, minArea = 6) {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const out = new ImageData(new Uint8ClampedArray(data), width, height);
  const o = out.data;
  const stack = [];

  // 8-connected (audit Fix #1, confirmed 2026-09-06): includes diagonals so
  // a chain of ink pixels that only touch at a corner (fine dotwork tips,
  // whisker ends, single-pixel-wide diagonal strokes) is treated as ONE
  // region, matching how a viewer perceives connectivity and matching the
  // diagonal-bridging logic already applied upstream in threshold.js's
  // bridgeDiagonalGaps. The existing wraparound guard below
  // (Math.abs(nx - x) > 1) already correctly rejects row-wrap for these new
  // diagonal offsets too -- independently hand-traced all 4 new directions,
  // no change needed to that guard.
  const dirs = [
    -1, 1, -width, width,
    -width - 1, -width + 1, width - 1, width + 1,
  ];

  for (let i = 0; i < width * height; i++) {
    if (data[i * 4] >= 128 || visited[i]) continue;

    stack.length = 0;
    stack.push(i);
    visited[i] = 1;
    let area = 0;
    const pixels = [];

    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      area++;

      const x = p % width;
      for (const d of dirs) {
        const np = p + d;
        if (np < 0 || np >= width * height) continue;
        const nx = np % width;
        if (Math.abs(nx - x) > 1) continue;
        if (data[np * 4] < 128 && !visited[np]) {
          visited[np] = 1;
          stack.push(np);
        }
      }
    }

    if (area < minArea) {
      for (const p of pixels) {
        const idx = p * 4;
        o[idx] = o[idx + 1] = o[idx + 2] = 255;
        o[idx + 3] = 255;
      }
    }
  }
  return out;
}

export function dilateErode(imageData, amount) {
  if (amount === 0) return imageData;
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const o = out.data;
  const r = Math.abs(amount);
  const isDilate = amount > 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let val = isDilate ? 255 : 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const v = data[(ny * width + nx) * 4];
            if (isDilate) val = Math.min(val, v);
            else val = Math.max(val, v);
          }
        }
      }
      const idx = (y * width + x) * 4;
      o[idx] = o[idx + 1] = o[idx + 2] = val;
      o[idx + 3] = 255;
    }
  }
  return out;
}
