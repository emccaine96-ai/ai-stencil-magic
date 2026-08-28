/**
 * Module 16 — Ink style compositor.
 *
 * The "optional add-on after stencil is generated" step. Takes the already-rendered
 * primary line layer and the cached tone data, and composites according to the
 * chosen style — no re-analysis.
 *
 * Part of the Shading Guide + Ink Style Add-On.
 */

import { extractToneBoundaries } from './region-boundaries';
import { renderDashedGuideLines, type DashParams } from './dashed-boundary';

export type InkStyle = 'lineOnly' | 'greyWashGuide' | 'blackworkFill' | 'colorBlockOutline';

export interface InkStyleParams {
  style: InkStyle;
  dash: DashParams;
  fillDarknessThreshold: number; // 0..255, used by blackworkFill only
}

export function applyInkStyle(
  primaryLines: Uint8ClampedArray,
  toneIdx: Uint8Array,
  toneGray: Float32Array,
  w: number,
  h: number,
  params: InkStyleParams,
): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(primaryLines);

  switch (params.style) {
    case 'lineOnly':
      return out;

    case 'greyWashGuide': {
      const boundary = extractToneBoundaries(toneIdx, w, h);
      const dashed = renderDashedGuideLines(boundary, toneGray, w, h, params.dash);
      for (let i = 0; i < w * h; i++) if (dashed[i]) out[i] = 255;
      return out;
    }

    case 'blackworkFill': {
      for (let i = 0; i < w * h; i++) if (toneGray[i] < params.fillDarknessThreshold) out[i] = 255;
      return out;
    }

    case 'colorBlockOutline': {
      const boundary = extractToneBoundaries(toneIdx, w, h);
      for (let i = 0; i < w * h; i++) if (boundary[i]) out[i] = 255;
      return out;
    }
  }
}
