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
