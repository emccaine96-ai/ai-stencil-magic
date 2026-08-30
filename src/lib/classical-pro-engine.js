/**
 * ClassicalProEngine — Thin Compatibility Wrapper
 * -------------------------------------------------
 * Re-exports the same ClassicalProEngine class with the same processImage() signature
 * so that classical-pro-integration.ts and everything else that imports it needs zero changes.
 *
 * The actual implementation now lives in modular files under src/lib/classical/.
 * This is part of Master Spec Phase 1 — plumbing, not a quality change.
 */

import { toGrayscale } from './classical/grayscale.js';
import { applyMultiScaleRetinex } from './classical/retinex.js';
import { buildFrequencyBands } from './classical-engine/pyramid.js';
import { sobel, classifyEdges } from './classical-engine/edges.js';
import { renderLineLayer } from './classical-engine/line-weight.js';
import { quantizeTones, mergeSmallRegions } from './classical-engine/tone-simplify.js';
import { otsuThreshold, applyThreshold } from './classical-engine/otsu.js';
import { structureTensorOrientation, renderHatchLayer } from './classical-engine/hatching.js';
import { removeSmallInkSpecks, morphClose } from './classical-engine/cleanup.js';
import { applyBackgroundMode } from './classical-engine/background.js';
import { PipelineCache, hashParams } from './classical-engine/pipeline-types.js';
import { integralImage } from './classical/integral-image.js';
import { applyCLAHE } from './classical/clahe.js';
import { bilateralApprox, fastBlur } from './classical/smoothing.js';
import { applySCurveAndGamma, applyXDoG } from './classical/xdog.js';
import { stochasticStipple, combineEdgeAndDither } from './classical/stipple.js';
import { morphology, removeSmallBlobs, dilateErode } from './classical/morphology.js';
import { computeStructureTensor, applyFlowModulation } from './classical/structure-tensor.js';
import { mapToHectographPurple, makeTransparentBackground } from './classical/output.js';

function runMultiscaleEdgeStage(imageData, options) {
  const { width: w, height: h, data } = imageData;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) gray[p] = data[i];

  const bandSigmas = { low: 8, mid: 3, high: 1 };
  const bands = buildFrequencyBands(gray, w, h, bandSigmas);

  const lowEdges = sobel(bands.low, w, h);
  const midEdges = sobel(bands.mid, w, h);
  const highEdges = sobel(bands.high, w, h);
  const classified = classifyEdges(
    lowEdges.magnitude, midEdges.magnitude, highEdges.magnitude,
    w, h,
    { primaryPct: 0.9, formPct: 0.75, texturePct: 0.5 },
  );

  const lw = {
    minWeight: options.lineWeightMin ?? 0.8,
    maxWeight: options.lineWeightMax ?? 2.5,
    contrast: options.lineWeightContrast ?? 0.5,
  };
  const lineLayer = renderLineLayer(classified, w, h, lw);

  const toneLevels = options.toneLevels ?? 5;
  const minRegionPx = options.minRegionPx ?? 20;
  const toneIdx = quantizeTones(gray, toneLevels);
  mergeSmallRegions(toneIdx, w, h, minRegionPx);

  const out = new ImageData(w, h);
  const od = out.data;
  for (let i = 0, p = 0; i < od.length; i += 4, p++) {
    const ink = lineLayer[p] > 0;
    od[i] = od[i + 1] = od[i + 2] = ink ? 0 : 255;
    od[i + 3] = ink ? 255 : 0;
  }
  return out;
}

class ClassicalProEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.hectographPurple = { r: 168, g: 85, b: 247 };
    this.cache = new PipelineCache();
    this.lastPrimaryLines = null;
    this.lastToneIdx = null;
    this.lastToneGray = null;
    this.lastWidth = 0;
    this.lastHeight = 0;
  }

  processImage(imageSource, settings = {}, preset = null) {
    const s = Object.assign({
      useClahe: true,
      useRetinex: false,
      lineWeightMin: 0.8,
      lineWeightMax: 2.5,
      lineWeightContrast: 0.5,
      toneLevels: 5,
      minRegionPx: 20,
      useOtsu: false,
      useFormHatching: false,
      useEnhancedCleanup: false,
      enhancedCleanupMinPx: 4,
      enhancedCleanupCloseRadius: 1,
      backgroundMode: 'keep',
      backgroundFadeOpacity: 0.25,
      backgroundMask: null,
      shadingMode: 'xdog',
      skin_smoothness: 50,
      detail_radius: 1.0,
      edge_sensitivity: 0.98,
      shadow_block: 15,
      line_weight: 0,
      useStructureTensor: false,
      tensorRadius: 2,
      flowStrength: 0.65,
      outputPurple: true,
      contrastStrength: 0.72,
      gamma: 0.78,
      openKernel: 0,
      minBlobArea: 6,
      closeKernel: 0,
    }, preset || {}, settings);

    const srcW = imageSource.width || imageSource.videoWidth || 1;
    const srcH = imageSource.height || imageSource.videoHeight || 1;
    const MAX_EDGE = 2400;
    const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
    const workW = Math.max(1, Math.round(srcW * scale));
    const workH = Math.max(1, Math.round(srcH * scale));

    this.canvas.width = workW;
    this.canvas.height = workH;
    this.ctx.drawImage(imageSource, 0, 0, workW, workH);

    let img = this.ctx.getImageData(0, 0, workW, workH);

    // 1. Grayscale
    img = toGrayscale(img);

    // 1.5 Multi-Scale Retinex (illumination normalization, opt-in)
    if (s.useRetinex) {
      img = applyMultiScaleRetinex(img);
    }

    // 2. CLAHE
    if (s.useClahe) {
      img = applyCLAHE(img, 8, 2.0);
    }

    // 3. Bilateral smoothing
    img = bilateralApprox(img, s.skin_smoothness);

    // 4. S-curve + gamma contrast
    img = applySCurveAndGamma(img, s.contrastStrength, s.gamma);

    let stencil;

    if (s.shadingMode === 'multiscale') {
      stencil = runMultiscaleEdgeStage(img, {
        lineWeightMin: s.lineWeightMin,
        lineWeightMax: s.lineWeightMax,
        lineWeightContrast: s.lineWeightContrast,
        toneLevels: s.toneLevels,
        minRegionPx: s.minRegionPx,
      });
    } else if (s.shadingMode === 'dither') {
      const contourLines = applyXDoG(img, Math.max(0.8, s.detail_radius), s.edge_sensitivity, Math.max(9, s.shadow_block));
      const stipple = stochasticStipple(img, {
        minRadius: 0.55,
        maxRadius: 2.4,
        spacing: Math.max(2, Math.round(s.detail_radius * 2.5)),
      });
      stencil = combineEdgeAndDither(contourLines, stipple);
    } else {
      stencil = applyXDoG(img, s.detail_radius, s.edge_sensitivity, s.shadow_block);
    }

    // 4.5. Store intermediate data for InkStylePanel (additive — only read if needed)
    this.lastWidth = workW;
    this.lastHeight = workH;
    if (s.shadingMode === 'multiscale') {
      // For multiscale mode, store the intermediate tone data
      const _gray = new Float32Array(workW * workH);
      for (let i = 0, p = 0; i < img.data.length; i += 4, p++) _gray[p] = img.data[i];
      this.lastToneIdx = quantizeTones(_gray, s.toneLevels ?? 5);
      this.lastToneGray = _gray;
      // Extract primary lines from stencil (before color mapping)
      this.lastPrimaryLines = new Uint8ClampedArray(workW * workH);
      for (let i = 0, p = 0; i < stencil.data.length; i += 4, p++) {
        this.lastPrimaryLines[p] = stencil.data[i + 3] > 10 ? 255 : 0;
      }
    }

    // 4.6. Optional Otsu threshold (additive — only when useOtsu is true)
    if (s.useOtsu) {
      const _gray = new Float32Array(workW * workH);
      for (let i = 0, p = 0; i < img.data.length; i += 4, p++) _gray[p] = img.data[i];
      const t = otsuThreshold(_gray);
      const otsuMask = applyThreshold(_gray, t);
      const od = stencil.data;
      for (let i = 0, p = 0; i < od.length; i += 4, p++) {
        if (otsuMask[p] === 0) { od[i] = od[i+1] = od[i+2] = 0; od[i+3] = 255; }
      }
    }

    // 4.7. Optional form-aware hatching (additive — only when useFormHatching is true)
    if (s.useFormHatching && s.shadingMode === 'multiscale') {
      const _gray = new Float32Array(workW * workH);
      for (let i = 0, p = 0; i < img.data.length; i += 4, p++) _gray[p] = img.data[i];
      const lowEdges = sobel(_gray, workW, workH);
      const gxField = new Float32Array(workW * workH);
      const gyField = new Float32Array(workW * workH);
      for (let i = 0; i < workW * workH; i++) {
        gxField[i] = Math.cos(lowEdges.direction[i]) * lowEdges.magnitude[i];
        gyField[i] = Math.sin(lowEdges.direction[i]) * lowEdges.magnitude[i];
      }
      const orientation = structureTensorOrientation(gxField, gyField, workW, workH);
      const hatchLayer = renderHatchLayer(_gray, orientation, workW, workH, {
        baseAngle: Math.PI / 4,
        followForm: true,
        minSpacingPx: 3,
        maxSpacingPx: 12,
        lineWidthPx: 1,
        crosshatch: false,
      });
      const od = stencil.data;
      for (let i = 0, p = 0; i < od.length; i += 4, p++) {
        if (hatchLayer[p]) { od[i] = od[i+1] = od[i+2] = 0; od[i+3] = 255; }
      }
    }

    // 5. Structure Tensor flow modulation
    if (s.useStructureTensor) {
      const tensor = computeStructureTensor(img, s.tensorRadius);
      stencil = applyFlowModulation(stencil, tensor, s.flowStrength);
    }

    // 6. Morphological cleaning
    if (s.openKernel >= 3) {
      stencil = morphology(stencil, s.openKernel, 'open');
    }
    if (s.minBlobArea > 0) {
      stencil = removeSmallBlobs(stencil, s.minBlobArea);
    }
    if (s.closeKernel >= 3) {
      stencil = morphology(stencil, s.closeKernel, 'close');
    }

    // 6.5. Enhanced cleanup (additive — only when useEnhancedCleanup is true)
    if (s.useEnhancedCleanup) {
      const inkMask = new Uint8ClampedArray(workW * workH);
      for (let i = 0, p = 0; i < stencil.data.length; i += 4, p++) {
        inkMask[p] = stencil.data[i + 3] > 10 ? 255 : 0;
      }
      const cleaned = removeSmallInkSpecks(inkMask, workW, workH, s.enhancedCleanupMinPx);
      const closed = morphClose(cleaned, workW, workH, s.enhancedCleanupCloseRadius);
      const od = stencil.data;
      for (let i = 0, p = 0; i < od.length; i += 4, p++) {
        od[i + 3] = closed[p] ? 255 : 0;
        if (closed[p]) { od[i] = od[i+1] = od[i+2] = 0; }
      }
    }

    // 7. Line weight
    if (s.line_weight !== 0) {
      stencil = dilateErode(stencil, s.line_weight);
    }

    // 8. Output color
    if (s.outputPurple) {
      stencil = mapToHectographPurple(stencil, this.hectographPurple);
    } else {
      stencil = makeTransparentBackground(stencil);
    }

    // 8.5. Background separation mode (additive — only when backgroundMode != 'keep')
    if (s.backgroundMode !== 'keep' && s.backgroundMask) {
      const inkMask = new Uint8ClampedArray(workW * workH);
      for (let i = 0, p = 0; i < stencil.data.length; i += 4, p++) {
        inkMask[p] = stencil.data[i + 3] > 10 ? 255 : 0;
      }
      const adjusted = applyBackgroundMode(inkMask, s.backgroundMask, workW, workH, s.backgroundMode, s.backgroundFadeOpacity);
      const od = stencil.data;
      for (let i = 0, p = 0; i < od.length; i += 4, p++) {
        od[i + 3] = adjusted[p];
        if (adjusted[p]) { od[i] = od[i+1] = od[i+2] = 0; }
        else { od[i] = od[i+1] = od[i+2] = 255; }
      }
    }

    this.ctx.putImageData(stencil, 0, 0);
    if (scale < 1) {
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = srcW;
      fullCanvas.height = srcH;
      const fctx = fullCanvas.getContext('2d');
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(this.canvas, 0, 0, srcW, srcH);
      return fullCanvas.toDataURL('image/png');
    }
    return this.canvas.toDataURL('image/png');
  }
}

// Browser / module export
if (typeof window !== 'undefined') {
  window.ClassicalProEngine = ClassicalProEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ClassicalProEngine };
}

export { ClassicalProEngine };
export default ClassicalProEngine;
