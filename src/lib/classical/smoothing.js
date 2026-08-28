/**
 * Edge-preserving bilateral filter + fast separable box blur.
 * Extracted from ClassicalProEngine for modularity.
 */

export function bilateralApprox(imageData, strength) {
  const { width, height, data } = imageData;
  const spatialWeights = [1, 0.6, 0.25];
  const rangeSigma = Math.max(4, strength / 2);
  const out = new ImageData(width, height);
  const o = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = data[(y * width + x) * 4];
      let wsum = 0, vsum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          const v = data[(yy * width + xx) * 4];
          const sw = spatialWeights[Math.min(2, Math.abs(dx))] * spatialWeights[Math.min(2, Math.abs(dy))];
          const rangeDiff = v - center;
          const rw = Math.exp(-(rangeDiff * rangeDiff) / (2 * rangeSigma * rangeSigma));
          const w = sw * rw;
          wsum += w;
          vsum += w * v;
        }
      }
      const val = wsum > 0 ? vsum / wsum : center;
      const idx = (y * width + x) * 4;
      o[idx] = o[idx + 1] = o[idx + 2] = val;
      o[idx + 3] = 255;
    }
  }
  return out;
}

export function fastBlur(imageData, radius) {
  const { width, height, data } = imageData;
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(width * height);
  const out = new ImageData(width, height);
  const o = out.data;

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) {
      const xx = Math.max(0, Math.min(width - 1, x));
      sum += data[(y * width + xx) * 4];
    }
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / (2 * r + 1);
      const x1 = Math.max(0, Math.min(width - 1, x - r));
      const x2 = Math.max(0, Math.min(width - 1, x + r + 1));
      sum += data[(y * width + x2) * 4] - data[(y * width + x1) * 4];
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      const yy = Math.max(0, Math.min(height - 1, y));
      sum += tmp[yy * width + x];
    }
    for (let y = 0; y < height; y++) {
      const v = sum / (2 * r + 1);
      const idx = (y * width + x) * 4;
      o[idx] = o[idx + 1] = o[idx + 2] = v;
      o[idx + 3] = 255;
      const y1 = Math.max(0, Math.min(height - 1, y - r));
      const y2 = Math.max(0, Math.min(height - 1, y + r + 1));
      sum += tmp[y2 * width + x] - tmp[y1 * width + x];
    }
  }
  return out;
}
