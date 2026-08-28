/**
 * Stochastic (blue-noise-style) stippling.
 * Uses the shared DeterministicRNG instead of an inline ad-hoc generator.
 * Extracted from ClassicalProEngine for modularity.
 */
import { createImageRNG } from './deterministic-rng.js';

export function stochasticStipple(imageData, opts = {}) {
  const { width, height, data } = imageData;
  const minRadius = opts.minRadius ?? 0.6;
  const maxRadius = opts.maxRadius ?? 2.2;
  const baseSpacing = opts.spacing ?? 4;

  const scale = Math.max(0.5, Math.min(width, height) / 1024);
  const spacing = Math.max(2, baseSpacing * scale);
  const minR = minRadius * scale;
  const maxR = maxRadius * scale;

  const out = new ImageData(width, height);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    o[i] = o[i + 1] = o[i + 2] = 255;
    o[i + 3] = 255;
  }

  const rng = createImageRNG(width, height);

  const drawDot = (cx, cy, r) => {
    if (r < 0.35) return;
    const rInt = Math.ceil(r);
    const cxi = Math.round(cx), cyi = Math.round(cy);
    for (let dy = -rInt; dy <= rInt; dy++) {
      const ny = cyi + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -rInt; dx <= rInt; dx++) {
        const nx = cxi + dx;
        if (nx < 0 || nx >= width) continue;
        if (dx * dx + dy * dy > r * r) continue;
        const idx = (ny * width + nx) * 4;
        o[idx] = o[idx + 1] = o[idx + 2] = 0;
      }
    }
  };

  for (let y = -spacing; y < height + spacing; y += spacing) {
    for (let x = -spacing; x < width + spacing; x += spacing) {
      const jx = x + (rng.next() - 0.5) * spacing * 0.9;
      const jy = y + (rng.next() - 0.5) * spacing * 0.9;
      const sx = Math.min(width - 1, Math.max(0, Math.round(jx)));
      const sy = Math.min(height - 1, Math.max(0, Math.round(jy)));
      const lum = data[(sy * width + sx) * 4];
      const darkness = 1 - lum / 255;
      if (darkness <= 0.02) continue;

      const gamma = Math.pow(darkness, 0.75);
      if (rng.next() > gamma) continue;

      const radius = minR + (maxR - minR) * gamma * (0.75 + rng.next() * 0.5);
      drawDot(jx, jy, radius);
    }
  }

  return out;
}

export function combineEdgeAndDither(edges, dither) {
  const { width, height } = edges;
  const out = new ImageData(width, height);
  const e = edges.data, d = dither.data, o = out.data;
  for (let i = 0; i < e.length; i += 4) {
    const v = (e[i] < 128 || d[i] < 128) ? 0 : 255;
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }
  return out;
}
