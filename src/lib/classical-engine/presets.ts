/**
 * Module 12 — Presets & reproducibility.
 * Serializable preset schema so any stencil can be reproduced from
 * its parameters alone.
 */

export const ENGINE_VERSION = '2.0.0-classical-upgrade';

export type StencilMode =
  | 'PURE_LINE' | 'LINE_SHADOW' | 'TWO_TONE' | 'THREE_TONE'
  | 'MULTI_TONE' | 'BLACKWORK' | 'SOFT_SHADING' | 'HIGH_DETAIL_PORTRAIT' | 'CUSTOM';

export interface StencilPreset {
  version: string;
  name: string;
  mode: StencilMode;
  frequencyBands: { low: number; mid: number; high: number };
  edgeClassification: { primaryPct: number; formPct: number; texturePct: number };
  lineWeight: { minWeight: number; maxWeight: number; contrast: number };
  toneSimplify: { levels: number; minRegionPx: number };
  hatching: {
    enabled: boolean; baseAngle: number; followForm: boolean;
    minSpacingPx: number; maxSpacingPx: number; lineWidthPx: number; crosshatch: boolean;
  } | null;
  regionFocus: { category: number; strengthMultiplier: number } | null;
  background: { mode: 'keep' | 'remove' | 'simplify' | 'fade'; fadeOpacity: number };
  aiSource: { provider: string; model: string; seed?: number } | null;
}

export function serializePreset(preset: StencilPreset): string {
  return JSON.stringify(preset, null, 2);
}

export function loadPreset(json: string): StencilPreset {
  const parsed = JSON.parse(json);
  if (!parsed.version) throw new Error('Preset missing engine version — cannot guarantee reproducibility');
  return parsed as StencilPreset;
}
