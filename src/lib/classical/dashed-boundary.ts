/**
 * Module 15 — Dashed guide-line renderer.
 *
 * Deliberately NOT built as a path-tracer (ordered boundary walking is fragile
 * at T-junctions where three tone regions meet). Instead it reuses the exact
 * phase-projection trick already used in the hatching renderer: each boundary
 * pixel dashes based on its own local tangent direction, no path ordering
 * required, no branching-topology bugs possible.
 *
 * Part of the Shading Guide + Ink Style Add-On.
 */

/** Simple Sobel operator — returns gradient magnitude and direction. */
function sobel(gray: Float32Array, w: number, h: number): { magnitude: Float32Array; direction: Float32Array } {
  const magnitude = new Float32Array(w * h);
  const direction = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1] +
         gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] +
         gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      magnitude[i] = Math.sqrt(gx * gx + gy * gy);
      direction[i] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, direction };
}

export interface DashParams {
  dashLengthPx: number;
  gapLengthPx: number;
}

export function renderDashedGuideLines(
  boundary: Uint8Array,
  toneGray: Float32Array,
  w: number,
  h: number,
  params: DashParams,
): Uint8ClampedArray {
  const { direction } = sobel(toneGray, w, h);
  const out = new Uint8ClampedArray(w * h);
  const period = params.dashLengthPx + params.gapLengthPx;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!boundary[idx]) continue;

      const tangent = direction[idx] + Math.PI / 2; // travel direction along the boundary
      const along = x * Math.cos(tangent) + y * Math.sin(tangent);
      const phase = ((along % period) + period) % period;

      if (phase < params.dashLengthPx) out[idx] = 255;
    }
  }
  return out;
}

export { sobel };
