/**
 * CLAHE (Contrast-Limited Adaptive Histogram Equalization) — tile-based with bilinear blending.
 * Extracted from ClassicalProEngine for modularity.
 */
export function applyCLAHE(imageData, gridSize = 8, clipLimit = 2.0) {
  const { width, height, data } = imageData;
  const tilesX = Math.max(1, gridSize);
  const tilesY = Math.max(1, gridSize);
  const tileW = Math.ceil(width / tilesX);
  const tileH = Math.ceil(height / tilesY);

  const tileCdfs = [];
  for (let ty = 0; ty < tilesY; ty++) {
    const row = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tileW, y0 = ty * tileH;
      const x1 = Math.min(width, x0 + tileW), y1 = Math.min(height, y0 + tileH);
      const hist = new Array(256).fill(0);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[data[(y * width + x) * 4]]++;
          count++;
        }
      }
      const clipVal = Math.max(1, (count / 256) * clipLimit);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipVal) {
          excess += hist[i] - clipVal;
          hist[i] = clipVal;
        }
      }
      const redistribute = excess / 256;
      for (let i = 0; i < 256; i++) hist[i] += redistribute;
      const cdf = new Array(256);
      cdf[0] = hist[0];
      for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
      const cdfMin = cdf.find((v) => v > 0) || 0;
      const denom = Math.max(1, count - cdfMin);
      const map = new Array(256);
      for (let i = 0; i < 256; i++) map[i] = Math.round(((cdf[i] - cdfMin) / denom) * 255);
      row.push(map);
    }
    tileCdfs.push(row);
  }

  const out = new ImageData(width, height);
  const outData = out.data;
  for (let y = 0; y < height; y++) {
    const fy = (y - tileH / 2) / tileH;
    const ty0 = Math.max(0, Math.min(tilesY - 1, Math.floor(fy)));
    const ty1 = Math.max(0, Math.min(tilesY - 1, ty0 + 1));
    const wy = Math.max(0, Math.min(1, fy - ty0));
    for (let x = 0; x < width; x++) {
      const fx = (x - tileW / 2) / tileW;
      const tx0 = Math.max(0, Math.min(tilesX - 1, Math.floor(fx)));
      const tx1 = Math.max(0, Math.min(tilesX - 1, tx0 + 1));
      const wx = Math.max(0, Math.min(1, fx - tx0));

      const v = data[(y * width + x) * 4];
      const m00 = tileCdfs[ty0][tx0][v];
      const m10 = tileCdfs[ty0][tx1][v];
      const m01 = tileCdfs[ty1][tx0][v];
      const m11 = tileCdfs[ty1][tx1][v];
      const top = m00 * (1 - wx) + m10 * wx;
      const bottom = m01 * (1 - wx) + m11 * wx;
      const eq = Math.round(top * (1 - wy) + bottom * wy);

      const idx = (y * width + x) * 4;
      outData[idx] = outData[idx + 1] = outData[idx + 2] = eq;
      outData[idx + 3] = 255;
    }
  }
  return out;
}
