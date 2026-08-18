/**
 * Classical Pro Engine Integration Layer
 * Connects ClassicalProEngine.js + presets.json into the stencil generator system.
 */

// @ts-ignore — standalone JS module
import { ClassicalProEngine } from "./classical-pro-engine.js";
// @ts-ignore — JSON preset file
import classicalPresets from "./classical-presets.json";

export interface ClassicalProOptions {
  preset: string;
  mode: "xdog" | "dither";
  intensity: number;
  purpleTint?: boolean;
}

export interface ClassicalProResult {
  dataUrl: string;
  presetName: string;
  processingTime: number;
}

export function getClassicalPresets(): Record<string, any> {
  return classicalPresets;
}

export function getPresetCategories(): string[] {
  return Object.keys(classicalPresets);
}

export function getPresetsByCategory(category: string): any[] {
  const data = classicalPresets as any;
  return data[category] || [];
}

export async function processClassicalPro(
  imageDataUrl: string,
  options: ClassicalProOptions
): Promise<ClassicalProResult> {
  const t0 = performance.now();

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageDataUrl;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const presets = classicalPresets as any;
  const categoryPresets = presets[options.preset] || presets["portrait"];
  const presetConfig = categoryPresets[0] || {};

  const engine = new ClassicalProEngine(canvas);
  const result = engine.processImage({
    mode: options.mode,
    intensity: options.intensity,
    clahe: presetConfig.clahe ?? true,
    bilateral: presetConfig.bilateral ?? true,
    structureTensor: presetConfig.structure_tensor ?? true,
    morphology: presetConfig.morphology ?? true,
    lineWeight: presetConfig.line_weight ?? 0,
    dilate: presetConfig.dilate ?? 0,
    erode: presetConfig.erode ?? 0,
    purpleTint: options.purpleTint ?? presetConfig.hectograph_purple ?? false,
  });

  const outputCanvas = (result as any).canvas || canvas;
  const dataUrl = outputCanvas.toDataURL("image/png");
  const elapsed = Math.round(performance.now() - t0);

  return {
    dataUrl,
    presetName: presetConfig.name || options.preset,
    processingTime: elapsed,
  };
}
