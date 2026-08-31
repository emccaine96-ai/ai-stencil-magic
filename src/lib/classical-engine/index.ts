/**
 * Classical Engine Upgrade — Pipeline Orchestrator.
 *
 * This is a NEW entry point that both stencil-engine.ts and classical-pro-engine.js
 * can eventually call into, or that replaces specific Pro engine handling once verified.
 * It does NOT replace any existing code paths — it's additive.
 *
 * Usage:
 *   import { runUpgradePipeline } from '@/lib/classical-engine';
 *   const result = await runUpgradePipeline(imageData, { ... });
 */

import { PipelineCache, hashParams, type ImageBuffer } from './pipeline-types';
import { gaussianBlur, buildFrequencyBands } from './pyramid';
import { otsuThreshold, applyThreshold } from './otsu';
import { sobel, classifyEdges, type ClassifiedEdges, type EdgeField } from './edges';
import { renderLineLayer, type LineWeightParams } from './line-weight';
import { quantizeTones, mergeSmallRegions } from './tone-simplify';
import { segmentRegions } from './region-segmenter';
import { buildRegionParamField, type FocusRegion } from './region-processing';
import { structureTensorOrientation, renderHatchLayer, type HatchParams } from './hatching';
import { removeSmallInkSpecks, morphClose } from './cleanup';
import { applyBackgroundMode, type BackgroundMode } from './background';
import { computeStencilMetrics, computeTattooability, type StencilMetrics, type TattooabilityResult } from './inspector';
import type { StencilPreset } from './presets';

export interface PipelineOptions {
  // Frequency bands
  bandSigmas?: { low: number; mid: number; high: number };
  // Edge classification
  edgeThresholds?: { primaryPct: number; formPct: number; texturePct: number };
  // Line weight
  lineWeight?: LineWeightParams;
  // Tonal simplification
  toneLevels?: number;
  minRegionPx?: number;
  // Hatching
  hatching?: HatchParams | null;
  // Region focus
  regionFocus?: FocusRegion | null;
  // Background
  backgroundMode?: BackgroundMode;
  fadeOpacity?: number;
  // Cleanup
  minSpeckPx?: number;
  closeRadius?: number;
  // Use Otsu for threshold instead of fixed value
  useOtsu?: boolean;
  threshold?: number;
}

export interface PipelineResult {
  finalStencil: Uint8ClampedArray;
  metrics: StencilMetrics;
  tattooability: TattooabilityResult;
  width: number;
  height: number;
}

/** Convert ImageData to Float32Array grayscale. */
function toGrayFloat(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

/**
 * Run the full upgraded classical pipeline on an ImageData.
 * All stages are additive — the existing engine paths are untouched.
 */
export async function runUpgradePipeline(
  imageData: ImageData,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const { width: w, height: h } = imageData;
  const cache = new PipelineCache();

  // 1. Grayscale
  const grayParams = hashParams({ source: 'gray' });
  let gray = cache.get<Float32Array>('grayscale', grayParams);
  if (!gray) {
    gray = toGrayFloat(imageData);
    cache.set('grayscale', gray, grayParams);
  }

  // 2. Frequency bands
  const bandSigmas = options.bandSigmas ?? { low: 8, mid: 3, high: 1 };
  const bandParams = hashParams({ sigmas: bandSigmas });
  let bands = cache.get<{ low: Float32Array; mid: Float32Array; high: Float32Array }>('bands', bandParams);
  if (!bands) {
    bands = buildFrequencyBands(gray, w, h, bandSigmas);
    cache.set('bands', bands, bandParams);
  }

  // 3. Multi-scale edge detection + classification
  const edgeParams = hashParams({
    thresholds: options.edgeThresholds ?? { primaryPct: 0.9, formPct: 0.75, texturePct: 0.5 },
  });
  let classified = cache.get<ClassifiedEdges>('edges', edgeParams);
  if (!classified) {
    const lowEdges = sobel(bands.low, w, h);
    const midEdges = sobel(bands.mid, w, h);
    const highEdges = sobel(bands.high, w, h);
    const fullEdges = sobel(gray, w, h);
    classified = classifyEdges(
      lowEdges.magnitude, midEdges.magnitude, highEdges.magnitude,
      w, h, fullEdges.direction, options.edgeThresholds,
    );
    cache.set('edges', classified, edgeParams);
  }

  // 4. Line weight rendering
  const lw = options.lineWeight ?? { minWeight: 0.8, maxWeight: 2.5, contrast: 0.5 };
  let lineLayer = renderLineLayer(classified, w, h, lw);

  // 5. Tonal simplification
  const toneLevels = options.toneLevels ?? 5;
  const minRegionPx = options.minRegionPx ?? 20;
  const toneIdx = quantizeTones(gray, toneLevels);
  const mergedTones = mergeSmallRegions(toneIdx, w, h, minRegionPx);

  // Build toneGray from merged regions for hatching
  const toneGray = new Float32Array(w * h);
  const centers = Array.from({ length: toneLevels }, (_, i) => (i + 0.5) * (256 / toneLevels));
  for (let i = 0; i < w * h; i++) toneGray[i] = centers[mergedTones[i]] ?? gray[i];

  // 6. Optional hatching
  if (options.hatching) {
    const lowEdges = sobel(bands.low, w, h);
    const orientation = structureTensorOrientation(
      lowEdges.direction, new Float32Array(w * h), w, h,
    );
    // Approximate gx/gy from sobel direction
    const gxField = new Float32Array(w * h);
    const gyField = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      gxField[i] = Math.cos(lowEdges.direction[i]) * lowEdges.magnitude[i];
      gyField[i] = Math.sin(lowEdges.direction[i]) * lowEdges.magnitude[i];
    }
    const orientation2 = structureTensorOrientation(gxField, gyField, w, h);
    const hatchLayer = renderHatchLayer(toneGray, orientation2, w, h, options.hatching);
    // Composite hatch onto line layer
    for (let i = 0; i < w * h; i++) if (hatchLayer[i]) lineLayer[i] = 255;
  }

  // 7. Optional Otsu threshold (additive — can be used instead of fixed threshold)
  if (options.useOtsu) {
    const t = otsuThreshold(gray);
    const otsuMask = applyThreshold(gray, t);
    for (let i = 0; i < w * h; i++) if (otsuMask[i] === 0) lineLayer[i] = 255;
  } else if (options.threshold !== undefined) {
    const threshMask = applyThreshold(gray, options.threshold);
    for (let i = 0; i < w * h; i++) if (threshMask[i] === 0) lineLayer[i] = 255;
  }

  // 8. Cleanup
  const minSpeckPx = options.minSpeckPx ?? 4;
  const closeRadius = options.closeRadius ?? 1;
  let cleaned = removeSmallInkSpecks(lineLayer, w, h, minSpeckPx);
  if (closeRadius > 0) cleaned = morphClose(cleaned, w, h, closeRadius);

  // 9. Background mode (if mask available)
  // Background mask would come from region segmentation. For now, skip
  // unless a mask is provided externally. The pipeline is designed so
  // segmentRegions() can be called separately and the mask passed in.

  // 10. Inspector metrics
  const metrics = computeStencilMetrics(cleaned, w, h);
  const tattooability = computeTattooability(metrics);

  return {
    finalStencil: cleaned,
    metrics,
    tattooability,
    width: w,
    height: h,
  };
}

export {
  PipelineCache, hashParams, type ImageBuffer,
  gaussianBlur, buildFrequencyBands,
  otsuThreshold, applyThreshold,
  sobel, classifyEdges,
  renderLineLayer,
  quantizeTones, mergeSmallRegions,
  segmentRegions, buildRegionParamField,
  structureTensorOrientation, renderHatchLayer,
  removeSmallInkSpecks, morphClose,
  applyBackgroundMode,
  computeStencilMetrics, computeTattooability,
  type StencilPreset,
};
