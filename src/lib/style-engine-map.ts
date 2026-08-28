/**
 * Unified Style → Engine Configuration
 * Maps the 4 Gemini styles to Classical Pro engine parameters
 * so both engines use the same style selector.
 */

export type StencilStyle = "hatching" | "solid" | "dotwork" | "hybrid";

export interface ClassicalProConfig {
  mode: "xdog" | "dither";
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
