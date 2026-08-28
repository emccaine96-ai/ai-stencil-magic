/**
 * Module 17 — Ink color.
 *
 * Cheap, independent of everything above — a straight recolor of the final
 * raster for display and export.
 *
 * Part of the Shading Guide + Ink Style Add-On.
 */

export type InkColor = 'red' | 'black' | 'purple' | 'blue';

const INK_COLOR_RGB: Record<InkColor, [number, number, number]> = {
  red: [220, 30, 30],     // current default line color
  black: [10, 10, 10],
  purple: [110, 40, 160], // common stencil-transfer-paper color
  blue: [30, 60, 200],
};

export function recolorInkLayer(
  ink: Uint8ClampedArray,
  w: number,
  h: number,
  color: InkColor,
): ImageData {
  const [r, g, b] = INK_COLOR_RGB[color];
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = ink[i];
  }
  return new ImageData(rgba, w, h);
}

export { INK_COLOR_RGB };
