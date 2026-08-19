/**
 * Classical Pro Engine Integration Layer
 * Connects ClassicalProEngine.js to the create.tsx stencil generator, using
 * the same 4-style system (hatching/solid/dotwork/hybrid) as the AI engines
 * via STYLE_TO_CLASSICAL in style-engine-map.ts.
 */

// @ts-ignore — standalone JS module
import { ClassicalProEngine } from "./classical-pro-engine.js";
import { STYLE_TO_CLASSICAL, scaleByIntensity, type StencilStyle } from "./style-engine-map";

export interface ClassicalProOptions {
  style: StencilStyle;
  intensity: number;
  purpleTint?: boolean;
}

export interface ClassicalProResult {
  dataUrl: string;
  presetName: string;
  processingTime: number;
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
  });

  const elapsed = Math.round(performance.now() - t0);
  return {
    dataUrl,
    presetName: options.style,
    processingTime: elapsed,
  };
}
