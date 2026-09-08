/**
 * Touch-Up Studio — true-size print math. Mirror is applied only at
 * print/export time via a canvas transform, never mutating the stored
 * stencil.
 */
export const pixelsForInches = (inches: number, dpi: number) => Math.round(inches * dpi);
export const pixelsToInches = (pixels: number, dpi: number) => pixels / dpi;
export const inchesToMm = (inches: number) => inches * 25.4;

/**
 * Draws `source` onto `destCtx` mirrored horizontally, without ever
 * mutating `source` itself -- for print/export only.
 */
export function drawMirrored(
  destCtx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  w: number,
  h: number,
) {
  destCtx.save();
  destCtx.translate(w, 0);
  destCtx.scale(-1, 1);
  destCtx.drawImage(source, 0, 0, w, h);
  destCtx.restore();
}
