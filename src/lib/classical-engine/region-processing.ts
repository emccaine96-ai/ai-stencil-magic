/**
 * Module 7 (cont.) — Per-region parameter fields + focal point.
 * Produces per-pixel parameter fields so downstream stages look up
 * "what should happen here" instead of one global setting.
 */

import { REGION } from './region-segmenter';

export interface RegionProfile {
  detailBoost: number;
  simplifyStrength: number;
  lineEmphasis: number;
}

export const REGION_PROFILES: Record<number, RegionProfile> = {
  [REGION.FACE_SKIN]: { detailBoost: 1.6, simplifyStrength: 0.5, lineEmphasis: 1.2 },
  [REGION.HAIR]:      { detailBoost: 1.0, simplifyStrength: 1.4, lineEmphasis: 1.0 },
  [REGION.BODY_SKIN]: { detailBoost: 0.9, simplifyStrength: 1.2, lineEmphasis: 0.9 },
  [REGION.CLOTHES]:   { detailBoost: 0.8, simplifyStrength: 1.3, lineEmphasis: 0.9 },
  [REGION.BACKGROUND]:{ detailBoost: 0.4, simplifyStrength: 2.5, lineEmphasis: 0.6 },
  [REGION.OTHER]:     { detailBoost: 1.0, simplifyStrength: 1.0, lineEmphasis: 1.0 },
};

export interface FocusRegion { category: number; strengthMultiplier: number }

export function buildRegionParamField(categoryMask: Uint8Array, focus?: FocusRegion) {
  const n = categoryMask.length;
  const detailBoost = new Float32Array(n);
  const simplifyStrength = new Float32Array(n);
  const lineEmphasis = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const profile = REGION_PROFILES[categoryMask[i]] ?? REGION_PROFILES[REGION.OTHER];
    let d = profile.detailBoost, s = profile.simplifyStrength, l = profile.lineEmphasis;
    if (focus && categoryMask[i] === focus.category) { d *= focus.strengthMultiplier; s /= focus.strengthMultiplier; }
    detailBoost[i] = d; simplifyStrength[i] = s; lineEmphasis[i] = l;
  }
  return { detailBoost, simplifyStrength, lineEmphasis };
}
