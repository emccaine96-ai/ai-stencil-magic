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
import { sobel } from './classical-engine/edges.js';
import { quantizeTones } from './classical-engine/tone-simplify.js';
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
    // Engine-audit-round-2, confirmed 2026-09-06: lineWeightMin/Max/Contrast
    // and minRegionPx were dead defaults -- verified zero style in
    // STYLE_TO_CLASSICAL ever set them (they only exist in the *separate*
    // AdvancedPipelineConfig for the other, Advanced-pipeline engine), and
    // a whole-file grep confirmed s.lineWeightMin/Max/Contrast and
    // s.minRegionPx are never read anywhere in this file -- this engine's
    // actual line rendering comes entirely from applyXDoG(detail_radius,
    // edge_sensitivity, shadow_block), which takes no weight/contrast
    // params, and speck removal uses enhancedCleanupMinPx instead. Removed
    // rather than wired, per the audit's own "no live style depends on
    // non-default values here" finding -- lower risk than inventing a new
    // wiring path for values nothing has ever needed.
    const s = Object.assign({
      useClahe: true,
      useRetinex: false,
      toneLevels: 5,
      useOtsu: false,
      useFormHatching: false,
      useEnhancedCleanup: false,
      enhancedCleanupMinPx: 4,
      enhancedCleanupCloseRadius: 1,
      backgroundMode: 'keep',
      backgroundFadeOpacity: 0.25,
      backgroundMask: null,
      exclusionMask: null,
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

    // Grayscale array shared by steps 4.6 (Otsu), 6.6 (form hatching), and
    // 7.5 (InkStylePanel capture) below -- all three independently rebuilt
    // an identical Float32Array of img.data[i] at stride 4 (same source,
    // same values, since `img` is never reassigned between here and step
    // 7.5). Computed once here instead; every reference below now reads
    // this same array rather than rebuilding it. Pure perf refactor --
    // values are byte-identical to what each site computed independently
    // before this change.
    const _sharedGray = new Float32Array(workW * workH);
    for (let i = 0, p = 0; i < img.data.length; i += 4, p++) _sharedGray[p] = img.data[i];

    let stencil;

    // NOTE: 'multiscale' shadingMode duplicate stage removed 2026-09-04 —
    // confirmed unreachable dead code (classical-engine-audit.md item 3).
    // No style config anywhere ever sets shadingMode/mode to 'multiscale'
    // (STYLE_TO_CLASSICAL only uses 'xdog'/'dither'); the equivalent,
    // actively-maintained implementation lives in classical-engine/index.ts's
    // runUpgradePipeline (the Advanced pipeline path, wired separately via
    // useAdvancedPipeline in classical-pro-integration.ts). Keeping two
    // independent copies of the same frequency-band/Sobel/line-weight logic
    // alive was the exact "duplicate parallel implementation" pattern
    // AGENTS.md warns about.
    if (s.shadingMode === 'dither') {
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

    this.lastWidth = workW;
    this.lastHeight = workH;

    // 4.6. Optional Otsu threshold (additive — only when useOtsu is true)
    if (s.useOtsu) {
      const t = otsuThreshold(_sharedGray);
      const otsuMask = applyThreshold(_sharedGray, t);
      const od = stencil.data;
      for (let i = 0, p = 0; i < od.length; i += 4, p++) {
        if (otsuMask[p] === 0) { od[i] = od[i+1] = od[i+2] = 0; od[i+3] = 255; }
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

    // 6.5. Enhanced cleanup (additive — only when useEnhancedCleanup is true).
    // Speck removal is skipped for dither/stipple output — individual dots are
    // small isolated regions by design, and component-pruning would delete
    // legitimate dots rather than noise. Morphological closing (gap-bridging)
    // is safe to keep for dither since it doesn't delete area.
    //
    // CRITICAL FIX 2026-09-03: ink detection here was reading the ALPHA
    // channel (stencil.data[i+3]), but alpha is NOT the ink signal anywhere
    // else in this pipeline. Every other stage — adaptiveThreshold,
    // combineEdgeAndDither, applyFlowModulation, removeSmallBlobs,
    // dilateErode, mapToHectographPurple, makeTransparentBackground — reads
    // RGB darkness (data[i] < 128) as the universal ink signal and leaves
    // alpha at 255 until step 8's final color mapping sets it for real. For
    // the 'xdog' and 'dither' branches (Hatching/Solid/Hybrid — the only
    // styles enhancedCleanup is configured for), alpha was uniformly 255
    // everywhere, so this code misread the ENTIRE image as one giant ink
    // blob and painted it solid black on every render. Reading RGB instead
    // (matching the convention used everywhere else) fixes it.
    if (s.useEnhancedCleanup) {
      const inkMask = new Uint8ClampedArray(workW * workH);
      for (let i = 0, p = 0; i < stencil.data.length; i += 4, p++) {
        inkMask[p] = stencil.data[i] < 128 ? 255 : 0;
      }
      const isDither = s.shadingMode === 'dither';
      const specksRemoved = isDither
        ? inkMask
        : removeSmallInkSpecks(inkMask, workW, workH, s.enhancedCleanupMinPx);
      const closeRadius = isDither ? Math.min(1, s.enhancedCleanupCloseRadius) : s.enhancedCleanupCloseRadius;
      const closed = morphClose(specksRemoved, workW, workH, closeRadius);
      const od = stencil.data;
      for (let i = 0, p = 0; i < od.length; i += 4, p++) {
        if (closed[p]) {
          od[i] = od[i + 1] = od[i + 2] = 0;
          od[i + 3] = 255;
        } else {
          od[i] = od[i + 1] = od[i + 2] = 255;
          od[i + 3] = 255;
        }
      }
    }

    // 6.6. Optional form-aware hatching (additive — only when useFormHatching is true).
    // Relocated here (was originally 4.7, before the cleanup stages) — hatch
    // strokes are a deliberate final artistic layer, not noise. Running them
    // before step 6's unconditional removeSmallBlobs / step 6.5's opt-in
    // enhanced speck removal caused those cleanup passes to prune every hatch
    // stroke as a "speck," making this feature a silent no-op whenever any
    // cleanup was active — which it always is for styles that use hatching
    // (enhancedCleanup is set for the hatching style). Fixed 2026-09-02.
    if (s.useFormHatching && (s.shadingMode === 'multiscale' || s.shadingMode === 'xdog')) {
      const lowEdges = sobel(_sharedGray, workW, workH);
      const gxField = new Float32Array(workW * workH);
      const gyField = new Float32Array(workW * workH);
      for (let i = 0; i < workW * workH; i++) {
        gxField[i] = Math.cos(lowEdges.direction[i]) * lowEdges.magnitude[i];
        gyField[i] = Math.sin(lowEdges.direction[i]) * lowEdges.magnitude[i];
      }
      const orientation = structureTensorOrientation(gxField, gyField, workW, workH);
      const hatchLayer = renderHatchLayer(_sharedGray, orientation, workW, workH, {
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

    // 7. Line weight
    if (s.line_weight !== 0) {
      stencil = dilateErode(stencil, s.line_weight);
    }

    // 7.5. Store intermediate data for InkStylePanel (additive — only read if
    // opened; the panel is collapsed by default and does nothing unless a
    // user explicitly interacts with it). Previously gated behind
    // shadingMode === 'multiscale', which none of the 4 selectable styles
    // ever use — meaning this data was always null and InkStylePanel could
    // never appear for any style. Now runs unconditionally, and reads RGB
    // darkness (matching the convention fixed in step 6.5 above) instead of
    // alpha. Captured here (after cleanup/hatching/line-weight, before the
    // final color mapping) so it reflects the actual final line art the
    // user sees, not a rougher pre-cleanup intermediate. Fixed 2026-09-03.
    {
      this.lastToneIdx = quantizeTones(_sharedGray, s.toneLevels ?? 5);
      this.lastToneGray = _sharedGray;
      this.lastPrimaryLines = new Uint8ClampedArray(workW * workH);
      for (let i = 0, p = 0; i < stencil.data.length; i += 4, p++) {
        this.lastPrimaryLines[p] = stencil.data[i] < 128 ? 255 : 0;
      }
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

    // 8.6. User-painted Smart Erase exclusion — same "zero it out" pattern
    // backgroundMode already uses, at the same application point. Never
    // touches RGB of remaining ink; excluded pixels become alpha 0 so
    // transparent PNG / overlay / Tattoo Mode stay valid.
    if (s.exclusionMask) {
      const od = stencil.data;
      const ex = s.exclusionMask;
      const n = Math.min(ex.length, (od.length / 4) | 0);
      for (let p = 0; p < n; p++) {
        if (ex[p]) od[p * 4 + 3] = 0;
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
