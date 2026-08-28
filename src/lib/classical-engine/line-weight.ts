/**
 * Module 5 — Variable line-weight rendering.
 * Class- and magnitude-scaled dilation: the raster equivalent of
 * variable line weight. Primary contours get thicker strokes than
 * texture/micro edges.
 */

import type { ClassifiedEdges } from './edges';

export interface LineWeightParams {
  minWeight: number;
  maxWeight: number;
  contrast: number;
  emphasisByClass?: Partial<Record<number, number>>;
}

const DEFAULT_EMPHASIS: Record<number, number> = { 1: 1.4, 2: 1.0, 3: 1.0, 4: 0.6, 5: 0.4 };

export function renderLineLayer(
  classified: ClassifiedEdges, w: number, h: number, params: LineWeightParams
): Uint8ClampedArray {
  const { classMap, combinedMagnitude } = classified;
  const emphasis = { ...DEFAULT_EMPHASIS, ...params.emphasisByClass };

  let maxMag = 0;
  for (let i = 0; i < combinedMagnitude.length; i++) maxMag = Math.max(maxMag, combinedMagnitude[i]);
  maxMag = maxMag || 1;

  const widthField = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const cls = classMap[i];
    if (cls === 0) continue;
    const norm = combinedMagnitude[i] / maxMag;
    const scaled = Math.pow(norm, 1 - params.contrast);
    widthField[i] = (params.minWeight + scaled * (params.maxWeight - params.minWeight)) * (emphasis[cls] ?? 0.5);
  }

  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const width = widthField[y * w + x];
      if (width <= 0) continue;
      const r = Math.max(1, Math.round(width / 2));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          out[yy * w + xx] = 255;
        }
      }
    }
  }
  return out;
}
