/**
 * Font Squirrel Integration — Text to Stencil converter.
 *
 * Renders lettering as clean vector glyph outlines at high resolution
 * using opentype.js, so it can be handed to the same pipeline used for
 * photos (for consistent hatching/shading treatment).
 *
 * Requires: npm install opentype.js
 * The raw .ttf/.otf outline data is needed (not WOFF2) for this step.
 */

export async function renderLetteringToCanvas(
  text: string,
  outlineFontUrl: string,
  fontSizePx: number,
  canvasWidth: number,
  canvasHeight: number,
): Promise<HTMLCanvasElement> {
  let opentype: any;
  try {
    opentype = (await import('opentype.js' as any)).default ?? await import('opentype.js' as any);
  } catch (e) {
    throw new Error('opentype.js not installed. Run: npm install opentype.js');
  }

  const font = await opentype.load(outlineFontUrl);
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // White background (pipeline expects white = paper, black = ink)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Render glyph outlines as black ink
  const path = font.getPath(text, 20, fontSizePx, fontSizePx);
  const path2d = new Path2D(path.toPathData(2));
  ctx.fillStyle = '#000000';
  ctx.fill(path2d);

  return canvas;
}

/**
 * Convert text to an ImageData ready for the classical engine pipeline.
 * Combines renderLetteringToCanvas with a canvas→ImageData extraction.
 */
export async function renderLetteringToImageData(
  text: string,
  outlineFontUrl: string,
  fontSizePx: number,
  canvasWidth: number,
  canvasHeight: number,
): Promise<ImageData> {
  const canvas = await renderLetteringToCanvas(text, outlineFontUrl, fontSizePx, canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
