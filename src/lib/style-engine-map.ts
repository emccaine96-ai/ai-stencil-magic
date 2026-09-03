/**
 * Unified Style → Engine Configuration
 * Maps the 4 Gemini styles to Classical Pro engine parameters
 * so both engines use the same style selector.
 */

export type StencilStyle = "hatching" | "solid" | "dotwork" | "hybrid";

export interface ClassicalProConfig {
  mode: "xdog" | "dither" | "multiscale";
  skin_smoothness: number;
  detail_radius: number;
  edge_sensitivity: number;
  shadow_block: number;
  line_weight: number;
  useStructureTensor?: boolean;
  shadingMode?: string;
  clahe: boolean;
  bilateral: boolean;
  morphology: boolean;
  enhancedCleanup?: { minPx: number; closeRadius: number };
}

/**
 * Maps each stencil style to Classical Pro engine parameters.
 * These are tuned to match the Gemini AI's output for each style.
 */
export const STYLE_TO_CLASSICAL: Record<StencilStyle, ClassicalProConfig> = {
  hatching: {
    mode: "xdog",
    skin_smoothness: 40,
    detail_radius: 1.2,
    edge_sensitivity: 0.93,   // recalibrated from 0.97 via coordinate descent [0.88-0.97]
    shadow_block: 13,         // recalibrated from 19 via coordinate descent [9-21]
    line_weight: 0,
    useStructureTensor: true,
    clahe: true,
    bilateral: true,
    morphology: true,
    enhancedCleanup: { minPx: 4, closeRadius: 1 },
  },
  solid: {
    mode: "xdog",
    skin_smoothness: 60,
    detail_radius: 2.0,
    edge_sensitivity: 0.92,   // recalibrated from 1.0 via coordinate descent [0.88-0.97]
    shadow_block: 11,         // recalibrated from 31 via coordinate descent [9-21]
    line_weight: 1,
    clahe: true,
    bilateral: true,
    morphology: true,
    enhancedCleanup: { minPx: 5, closeRadius: 1 },
  },
  dotwork: {
    mode: "dither",
    skin_smoothness: 30,
    detail_radius: 0.6,
    edge_sensitivity: 0.93,
    shadow_block: 9,
    line_weight: 0,
    shadingMode: "dither",
    clahe: true,
    bilateral: true,
    morphology: true,
  },
  hybrid: {
    mode: "xdog",
    skin_smoothness: 35,
    detail_radius: 1.0,
    edge_sensitivity: 0.98,
    shadow_block: 15,
    line_weight: 0,
    useStructureTensor: true,
    shadingMode: "dither",
    clahe: true,
    bilateral: true,
    morphology: true,
    enhancedCleanup: { minPx: 3, closeRadius: 1 },
  },
};

/**
 * Intensity (0-1) scales the engine parameters for denser/lighter output.
 */
export function scaleByIntensity(
  config: ClassicalProConfig,
  intensity: number
): ClassicalProConfig {
  return {
    ...config,
    shadow_block: Math.round(config.shadow_block * (0.5 + intensity)),
    edge_sensitivity: Math.min(1.05, config.edge_sensitivity * (0.9 + intensity * 0.15)),
    detail_radius: config.detail_radius * (0.8 + intensity * 0.4),
  };
}

export interface AdvancedPipelineConfig {
  bandSigmas: { low: number; mid: number; high: number };
  edgeThresholds: { primaryPct: number; formPct: number; texturePct: number };
  lineWeight: { minWeight: number; maxWeight: number; contrast: number };
  toneLevels: number;
  minRegionPx: number;
  useOtsu: boolean;
  // Optional form-following hatch overlay for the Advanced orchestrator only.
  // null = no hatch layer composited (solid, dotwork placeholder).
  hatching?: {
    baseAngle: number;
    followForm: boolean;
    minSpacingPx: number;
    maxSpacingPx: number;
    lineWidthPx: number;
    crosshatch: boolean;
  } | null;
}

// Starting-point values, not final artistic tuning — verify visually against
// real test images and adjust. Directionally: Solid should render bolder,
// fewer, larger regions; Hatching should render thinner, more numerous
// contour lines; Hybrid sits between the two. Dotwork uses the same values as
// Hatching as a placeholder only — Advanced cannot render dot texture yet
// (see Patch 2's UI-side dotwork guard), so this config is never actually
// exercised for that style until a stipple stage is added separately.
export const STYLE_TO_ADVANCED: Record<StencilStyle, AdvancedPipelineConfig> = {
  hatching: {
    bandSigmas: { low: 8, mid: 3, high: 1 },
    edgeThresholds: { primaryPct: 0.97, formPct: 0.93, texturePct: 0.85 },
    lineWeight: { minWeight: 0.6, maxWeight: 1.6, contrast: 0.6 },
    toneLevels: 6,
    minRegionPx: 12,
    useOtsu: false,
    hatching: { baseAngle: Math.PI / 4, followForm: true, minSpacingPx: 3, maxSpacingPx: 12, lineWidthPx: 1, crosshatch: false },
  },
  solid: {
    bandSigmas: { low: 10, mid: 4, high: 1.5 },
    edgeThresholds: { primaryPct: 0.95, formPct: 0.9, texturePct: 0.82 },
    lineWeight: { minWeight: 1.4, maxWeight: 3.2, contrast: 0.35 },
    toneLevels: 3,
    minRegionPx: 40,
    useOtsu: false,
  },
  dotwork: {
    bandSigmas: { low: 8, mid: 3, high: 1 },
    edgeThresholds: { primaryPct: 0.97, formPct: 0.93, texturePct: 0.85 },
    lineWeight: { minWeight: 0.6, maxWeight: 1.6, contrast: 0.6 },
    toneLevels: 6,
    minRegionPx: 12,
    useOtsu: false,
  },
  hybrid: {
    bandSigmas: { low: 9, mid: 3.5, high: 1.2 },
    edgeThresholds: { primaryPct: 0.96, formPct: 0.91, texturePct: 0.83 },
    lineWeight: { minWeight: 1.0, maxWeight: 2.4, contrast: 0.5 },
    toneLevels: 4,
    minRegionPx: 25,
    useOtsu: false,
    hatching: { baseAngle: Math.PI / 4, followForm: true, minSpacingPx: 4, maxSpacingPx: 14, lineWidthPx: 1, crosshatch: false },
  },
};

export function scaleAdvancedByIntensity(
  base: AdvancedPipelineConfig,
  intensity: number,
): AdvancedPipelineConfig {
  const t = Math.max(0, Math.min(1, intensity));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    bandSigmas: base.bandSigmas,
    edgeThresholds: {
      primaryPct: lerp(base.edgeThresholds.primaryPct + 0.02, base.edgeThresholds.primaryPct - 0.02),
      formPct: lerp(base.edgeThresholds.formPct + 0.02, base.edgeThresholds.formPct - 0.02),
      texturePct: lerp(base.edgeThresholds.texturePct + 0.04, base.edgeThresholds.texturePct - 0.04),
    },
    lineWeight: {
      minWeight: base.lineWeight.minWeight,
      maxWeight: lerp(base.lineWeight.maxWeight * 0.85, base.lineWeight.maxWeight * 1.15),
      contrast: base.lineWeight.contrast,
    },
    toneLevels: Math.round(lerp(Math.max(3, base.toneLevels - 1), base.toneLevels + 1)),
    minRegionPx: Math.round(lerp(base.minRegionPx * 1.3, base.minRegionPx * 0.75)),
    useOtsu: base.useOtsu,
    hatching: base.hatching ?? null,
  };
}
