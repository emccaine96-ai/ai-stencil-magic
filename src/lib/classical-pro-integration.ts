/**
 * Classical Pro Engine Integration Layer
 * Connects ClassicalProEngine.js to the create.tsx stencil generator, using
 * the same 4-style system (hatching/solid/dotwork/hybrid) as the AI engines
 * via STYLE_TO_CLASSICAL in style-engine-map.ts.
 */

// @ts-ignore — standalone JS module
import { ClassicalProEngine } from "./classical-pro-engine.js";
import { STYLE_TO_CLASSICAL, scaleByIntensity, type StencilStyle } from "./style-engine-map";
// @ts-ignore — advanced orchestrator (wired as multiscale-advanced mode)
import { runUpgradePipeline } from "./classical-engine/index";
import { segmentRegions } from "./classical-engine/region-segmenter";
// @ts-ignore — region processing (per-pixel param fields from segmentation masks)
import { buildRegionParamField, type FocusRegion } from "./classical-engine/region-processing";
// @ts-ignore — preset serialization
import { serializePreset, loadPreset, type StencilPreset } from "./classical-engine/presets";

export interface ClassicalProOptions {
  style: StencilStyle;
  intensity: number;
  purpleTint?: boolean;
  // Advanced: use the full orchestrator pipeline (multiscale-advanced mode)
  useAdvancedPipeline?: boolean;
  // Advanced: optional region segmentation (MediaPipe, async)
  useRegionSegmentation?: boolean;
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

  // Advanced pipeline mode: use the full orchestrator (classical-engine/index.ts)
  if (options.useAdvancedPipeline) {
    const advCanvas = document.createElement("canvas");
    advCanvas.width = img.naturalWidth || img.width;
    advCanvas.height = img.naturalHeight || img.height;
    const advCtx = advCanvas.getContext("2d", { willReadFrequently: true })!;
    advCtx.drawImage(img, 0, 0);
    const imageData = advCtx.getImageData(0, 0, advCanvas.width, advCanvas.height);
    const result = await runUpgradePipeline(imageData, {
      bandSigmas: { low: 8, mid: 3, high: 1 },
      lineWeight: { minWeight: 0.8, maxWeight: 2.5, contrast: 0.5 },
      toneLevels: 5,
      minRegionPx: 20,
      useOtsu: false,
    });
    // Render result to data URL
    const outCanvas = document.createElement("canvas");
    outCanvas.width = result.width;
    outCanvas.height = result.height;
    const outCtx = outCanvas.getContext("2d")!;
    const outImageData = outCtx.createImageData(result.width, result.height);
    for (let i = 0, p = 0; i < outImageData.data.length; i += 4, p++) {
      const ink = result.finalStencil[p] > 0;
      outImageData.data[i] = ink ? 168 : 255;
      outImageData.data[i + 1] = ink ? 85 : 255;
      outImageData.data[i + 2] = ink ? 247 : 255;
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

  // Optional region segmentation (MediaPipe, async — gracefully degrades)
  let regionMask: Uint8Array | null = null;
  if (options.useRegionSegmentation) {
    try {
      const segCanvas = document.createElement("canvas");
      segCanvas.width = img.naturalWidth || img.width;
      segCanvas.height = img.naturalHeight || img.height;
      const segCtx = segCanvas.getContext("2d")!;
      segCtx.drawImage(img, 0, 0);
      const bitmap = await createImageBitmap(segCanvas);
      regionMask = await segmentRegions(bitmap);
    } catch {
      // MediaPipe not available — proceed without region segmentation
      regionMask = null;
    }
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
    backgroundMask: regionMask,
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