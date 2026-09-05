/**
 * Classical Pro Engine Integration Layer
 * Connects ClassicalProEngine.js to the create.tsx stencil generator, using
 * the same 4-style system (hatching/solid/dotwork/hybrid) as the AI engines
 * via STYLE_TO_CLASSICAL in style-engine-map.ts.
 */

// @ts-ignore — standalone JS module
import { ClassicalProEngine } from "./classical-pro-engine.js";
import {
  STYLE_TO_CLASSICAL,
  scaleByIntensity,
  STYLE_TO_ADVANCED,
  scaleAdvancedByIntensity,
  type StencilStyle,
} from "./style-engine-map";
// @ts-ignore — advanced orchestrator (wired as multiscale-advanced mode)
import { runUpgradePipeline } from "./classical-engine/index";
// @ts-ignore — region processing (per-pixel param fields from segmentation masks)
import { buildRegionParamField, type FocusRegion } from "./classical-engine/region-processing";
// @ts-ignore — preset serialization
import { serializePreset, loadPreset, type StencilPreset } from "./classical-engine/presets";
import { segmentRegions, REGION } from "./classical-engine/region-segmenter";
import type { BackgroundMode } from "./classical-engine/background";

// Background modes exposed to users. 'simplify' is intentionally omitted:
// applyBackgroundMode treats it as a no-op (it needs per-region param fields
// that aren't wired into the standard engine path yet).
export type UserBackgroundMode = Extract<BackgroundMode, "keep" | "remove" | "fade">;

// Mirrors the working-resolution cap inside classical-pro-engine.js
// (MAX_EDGE = 2400). The engine computes workW/workH internally and doesn't
// expose them before step 8.5 needs the mask, so the segmentation mask is
// resampled to the same dimensions here.
const ENGINE_MAX_EDGE = 2400;

function engineWorkingSize(srcW: number, srcH: number) {
  const scale = Math.min(1, ENGINE_MAX_EDGE / Math.max(srcW, srcH));
  return {
    workW: Math.max(1, Math.round(srcW * scale)),
    workH: Math.max(1, Math.round(srcH * scale)),
  };
}

function resizeMaskNearest(
  mask: Uint8Array, sw: number, sh: number, dw: number, dh: number,
): Uint8Array {
  if (sw === dw && sh === dh) return mask;
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      out[y * dw + x] = mask[sy * sw + sx];
    }
  }
  return out;
}

/**
 * Builds a background-only binary mask at the engine's working resolution.
 * Returns null on any failure (MediaPipe unavailable, unexpected mask size),
 * which makes the caller fall back to 'keep' — same graceful-degradation
 * contract region-segmenter.ts documents for itself.
 */
async function buildBackgroundMask(
  img: HTMLImageElement, workW: number, workH: number,
): Promise<Uint8Array | null> {
  try {
    const segCanvas = document.createElement("canvas");
    segCanvas.width = workW;
    segCanvas.height = workH;
    const segCtx = segCanvas.getContext("2d", { willReadFrequently: true });
    if (!segCtx) return null;
    segCtx.drawImage(img, 0, 0, workW, workH);

    const categoryMask = await segmentRegions(segCanvas);
    if (!categoryMask || categoryMask.length === 0) return null;

    // MediaPipe may return the mask at its own model resolution rather than
    // the input size — derive source dims from the returned length.
    let sw = workW, sh = workH;
    if (categoryMask.length !== workW * workH) {
      const aspect = workW / workH;
      sh = Math.round(Math.sqrt(categoryMask.length / aspect));
      sw = sh > 0 ? Math.round(categoryMask.length / sh) : 0;
      if (sw <= 0 || sh <= 0 || sw * sh !== categoryMask.length) {
        const side = Math.round(Math.sqrt(categoryMask.length));
        if (side * side !== categoryMask.length) return null;
        sw = side; sh = side;
      }
    }

    const bg = new Uint8Array(categoryMask.length);
    let bgCount = 0;
    for (let i = 0; i < categoryMask.length; i++) {
      if (categoryMask[i] === REGION.BACKGROUND) { bg[i] = 1; bgCount++; }
    }
    // A fully-background or fully-foreground mask means segmentation didn't
    // find a subject — don't wipe the whole stencil.
    if (bgCount === 0 || bgCount === categoryMask.length) return null;

    return resizeMaskNearest(bg, sw, sh, workW, workH);
  } catch (e) {
    console.warn("Background segmentation unavailable, keeping background:", e);
    return null;
  }
}

export interface ClassicalProOptions {
  style: StencilStyle;
  intensity: number;
  purpleTint?: boolean;
  // Advanced: use the full orchestrator pipeline (multiscale-advanced mode)
  useAdvancedPipeline?: boolean;
  // Multi-Scale Retinex illumination normalization (classical/retinex.js).
  // Wired into classical-pro-engine.js already (gated behind s.useRetinex,
  // default false there) but had no way to reach it from any config or the
  // UI. Off by default here too -- opt-in for harshly-lit/backlit reference
  // photos, per VISION.md's "optional, not default" rule. Standard engine
  // path only; the Advanced orchestrator path doesn't have a Retinex stage.
  useRetinex?: boolean;
  // Background separation (classical-engine/background.ts + engine step 8.5).
  // Default 'keep' => fully inert. Standard engine path only; the Advanced
  // orchestrator has no background stage.
  backgroundMode?: UserBackgroundMode;
  backgroundFadeOpacity?: number;
}


export interface ClassicalProResult {
  dataUrl: string;
  presetName: string;
  processingTime: number;
  // Intermediate data for InkStylePanel (null when not available)
  intermediate?: {
    primaryLines: Uint8ClampedArray;
    toneIdx: Uint8Array;
    toneGray: Float32Array;
    width: number;
    height: number;
  } | null;
}

export async function processClassicalPro(
  imageDataUrl: string,
  options: ClassicalProOptions,
): Promise<ClassicalProResult> {
  const t0 = performance.now();

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageDataUrl;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  const baseConfig = STYLE_TO_CLASSICAL[options.style];
  const scaled = scaleByIntensity(baseConfig, options.intensity);

  const canvas = document.createElement("canvas");
  const engine = new ClassicalProEngine(canvas);

  // Advanced pipeline mode: use the full orchestrator (classical-engine/index.ts).
  // Dotwork is excluded — runUpgradePipeline has no stipple stage, so it would
  // silently render generic line output instead of dots. Fall through to the
  // standard engine below for that one style until a stipple stage is added.
  if (options.useAdvancedPipeline && options.style !== "dotwork") {
    const advCanvas = document.createElement("canvas");
    advCanvas.width = img.naturalWidth || img.width;
    advCanvas.height = img.naturalHeight || img.height;
    const advCtx = advCanvas.getContext("2d", { willReadFrequently: true })!;
    advCtx.drawImage(img, 0, 0);
    const imageData = advCtx.getImageData(0, 0, advCanvas.width, advCanvas.height);
    const advConfig = scaleAdvancedByIntensity(STYLE_TO_ADVANCED[options.style], options.intensity);
    const result = await runUpgradePipeline(imageData, {
      bandSigmas: advConfig.bandSigmas,
      edgeThresholds: advConfig.edgeThresholds,
      lineWeight: advConfig.lineWeight,
      toneLevels: advConfig.toneLevels,
      minRegionPx: advConfig.minRegionPx,
      useOtsu: advConfig.useOtsu,
      hatching: advConfig.hatching ?? null,
    });
    // Render result to data URL
    const outCanvas = document.createElement("canvas");
    outCanvas.width = result.width;
    outCanvas.height = result.height;
    const outCtx = outCanvas.getContext("2d")!;
    const outImageData = outCtx.createImageData(result.width, result.height);
    const purple = options.purpleTint ?? true;
    for (let i = 0, p = 0; i < outImageData.data.length; i += 4, p++) {
      const ink = result.finalStencil[p] > 0;
      outImageData.data[i] = ink ? (purple ? 168 : 0) : 255;
      outImageData.data[i + 1] = ink ? (purple ? 85 : 0) : 255;
      outImageData.data[i + 2] = ink ? (purple ? 247 : 0) : 255;
      outImageData.data[i + 3] = ink ? 255 : 0;
    }
    outCtx.putImageData(outImageData, 0, 0);
    const elapsed = Math.round(performance.now() - t0);
    return {
      dataUrl: outCanvas.toDataURL("image/png"),
      presetName: `${options.style}-advanced`,
      processingTime: elapsed,
      intermediate: null,
    };
  }

  const dataUrl: string = engine.processImage(img, {
    useClahe: scaled.clahe,
    shadingMode: scaled.shadingMode ?? scaled.mode,
    skin_smoothness: scaled.skin_smoothness,
    detail_radius: scaled.detail_radius,
    edge_sensitivity: scaled.edge_sensitivity,
    shadow_block: scaled.shadow_block,
    line_weight: scaled.line_weight,
    useStructureTensor: scaled.useStructureTensor ?? false,
    outputPurple: options.purpleTint ?? false,
    useEnhancedCleanup: !!scaled.enhancedCleanup,
    enhancedCleanupMinPx: scaled.enhancedCleanup?.minPx ?? 4,
    enhancedCleanupCloseRadius: scaled.enhancedCleanup?.closeRadius ?? 1,
    useFormHatching: scaled.useFormHatching ?? false,
    minBlobArea: scaled.minBlobArea ?? 6,
    useRetinex: options.useRetinex ?? false,
  });

  // Read intermediate data from the engine instance (for InkStylePanel)
  let intermediate: ClassicalProResult["intermediate"] = null;
  if (engine.lastPrimaryLines && engine.lastToneIdx && engine.lastToneGray) {
    intermediate = {
      primaryLines: engine.lastPrimaryLines,
      toneIdx: engine.lastToneIdx,
      toneGray: engine.lastToneGray,
      width: engine.lastWidth,
      height: engine.lastHeight,
    };
  }

  const elapsed = Math.round(performance.now() - t0);
  return {
    dataUrl,
    presetName: options.style,
    processingTime: elapsed,
    intermediate,
  };
}

// Preset serialization helpers (wires presets.ts into the integration layer)
export function exportPreset(
  style: StencilStyle,
  intensity: number,
  settings: Record<string, unknown>,
): string {
  return serializePreset({
    version: "2.0.0-classical-upgrade",
    name: `${style}-${intensity}`,
    mode: "CUSTOM",
    frequencyBands: { low: 8, mid: 3, high: 1 },
    edgeClassification: { primaryPct: 0.9, formPct: 0.75, texturePct: 0.5 },
    lineWeight: { minWeight: 0.8, maxWeight: 2.5, contrast: 0.5 },
    toneSimplify: { levels: 5, minRegionPx: 20 },
    hatching: null,
    regionFocus: null,
    background: { mode: "keep", fadeOpacity: 0.25 },
    aiSource: null,
    ...settings,
  } as StencilPreset);
}

export function importPreset(json: string): StencilPreset {
  return loadPreset(json);
}