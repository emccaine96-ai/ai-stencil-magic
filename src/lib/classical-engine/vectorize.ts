/**
 * Module 13 — Optional vectorization (raster → SVG).
 * Wraps imagetracerjs (MIT licensed). Requires: npm install imagetracerjs
 * Don't reimplement contour tracing — wrap an existing library.
 */

export async function vectorizeLineLayer(canvas: HTMLCanvasElement): Promise<string> {
  try {
    const ImageTracer = (await import('imagetracerjs' as any)).default ?? (await import('imagetracerjs' as any));
    const ctx = canvas.getContext('2d')!;
    return ImageTracer.imagedataToSVG(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
      {
        ltres: 1,
        qtres: 1,
        pathomit: 8,
        numberofcolors: 2,
        strokewidth: 0,
        linefilter: true,
      }
    );
  } catch (e) {
    console.warn('imagetracerjs not installed — vectorization disabled. Run: npm install imagetracerjs', e);
    throw new Error('Vectorization requires imagetracerjs. Install with: npm install imagetracerjs');
  }
}
