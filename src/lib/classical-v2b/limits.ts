import { validateSize } from "./fieldops";

/**
 * Input policy for the V2 candidate.
 *
 * Measured (portrait + floral, layout correlation against a 1600 px analysis,
 * ink drift removed): 600 px -> 0.991-0.995, 800 -> 0.995-0.997,
 * 1000 -> 0.996-0.998, 1280 -> 0.998-0.999. So 1280 loses almost nothing and costs
 * roughly a third of the 2400 px prepare time.
 */
export const V2_ANALYSIS_EDGE = 1280;

/** Hard ceiling. Beyond this the worker would allocate well over 1 GB. */
export const V2_MAX_ANALYSIS_EDGE = 2400;
export const V2_MAX_ANALYSIS_PIXELS = 5_800_000; // 2400 x 2400 = 5.76 MP
export const V2_MAX_EXPORT_PIXELS = 36_000_000;   // ~6000 x 6000 binary mask

/** Analysis dimensions for a source image: long edge capped at V2_ANALYSIS_EDGE, never upscaled. */
export function v2AnalysisSize(
  sourceWidth: number,
  sourceHeight: number,
  edge = V2_ANALYSIS_EDGE,
): { width: number; height: number } {
  validateSize(sourceWidth, sourceHeight);

  if (!Number.isFinite(edge) || edge < 64) {
    throw new Error("Invalid analysis edge");
  }

  const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function assertAnalysisSize(width: number, height: number): void {
  validateSize(width, height);

  if (Math.max(width, height) > V2_MAX_ANALYSIS_EDGE) {
    throw new Error(
      `Analysis image ${width}x${height} exceeds the ${V2_MAX_ANALYSIS_EDGE}px limit; downscale first (see v2AnalysisSize)`,
    );
  }

  if (width * height > V2_MAX_ANALYSIS_PIXELS) {
    throw new Error(
      `Analysis image ${width}x${height} exceeds ${V2_MAX_ANALYSIS_PIXELS} pixels`,
    );
  }

  if (Math.min(width, height) < 8) {
    throw new Error(`Analysis image ${width}x${height} is too small (minimum 8 px per side)`);
  }
}

export function assertExportSize(width: number, height: number): void {
  validateSize(width, height);

  if (width * height > V2_MAX_EXPORT_PIXELS) {
    throw new Error(
      `Export ${width}x${height} exceeds ${V2_MAX_EXPORT_PIXELS} pixels`,
    );
  }
}
