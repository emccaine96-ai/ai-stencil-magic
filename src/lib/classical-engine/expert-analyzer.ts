/**
 * Module — Expert parameter analyzer (DRAFT, not yet wired anywhere).
 *
 * Created 2026-09-06 per audit Fix #3. This module does not exist as a
 * live consumer of anything yet -- classical-pro-integration.ts has zero
 * references to it (confirmed by repo-wide search before writing this
 * file). Nothing in the running app calls analyzeImageExpert() today.
 *
 * STATUS OF EACH FIELD:
 * - xdog: fully specified and correct. Signature matches the REAL
 *   applyXDoG(imageData, detailRadius, edgeSensitivity, shadowBlock) in
 *   xdog.js -- a plain weighted Difference-of-Gaussians
 *   (`d1[i] - edgeSensitivity * d2[i]`), not a sigmoid/phi-tau XDoG. Line
 *   quality itself is produced downstream by adaptiveThreshold's hysteresis
 *   + diagonal bridging (threshold.js), not by this parameter.
 * - clahe / threshold / stipple / morphology: PLACEHOLDER ONLY. No tuning
 *   logic for these was provided in the Fix #3 brief (only the xdog field
 *   and block were specified there, as a correction to a prior draft this
 *   repo does not actually contain). Rather than invent heuristics with no
 *   basis, these return neutral defaults with an explicit "not yet
 *   analyzed" reason string. Do not treat these fields as tuned -- they are
 *   scaffolding only, pending the actual analysis logic.
 *
 * IMPORTANT CORRECTION vs. the brief's proposed xdog constants: the brief's
 * draft used edgeSensitivity = 1.4 (high edge density) / 1.8 (low edge
 * density). Checked against xdog.js's real formula
 * (`val = d1[i] - edgeSensitivity * d2[i]`, then +128 and clamped) and this
 * repo's actual coordinate-descent-tuned presets (style-engine-map.ts:
 * edge_sensitivity is 0.92-0.98 across all 4 styles, explicitly commented
 * as "recalibrated ... via coordinate descent [0.88-0.97]"): a value of
 * 1.4-1.8 would push `val` deeply negative across nearly the whole image
 * (since d1 and d2 are similar magnitude in non-edge regions, and
 * multiplying d2 by >1 makes the subtraction dominate), clamping most
 * pixels to solid black ink -- the exact "rendered as solid black" bug
 * class this repo's own git history shows being fixed once already. Kept
 * the brief's intended DIRECTION (lower edgeSensitivity for busy/high-
 * density regions, to avoid over-darkening) but rescaled the magnitude to
 * sit inside the real, tested range.
 *
 * OPEN ITEM (per the brief's own instruction -- flagging, not resolving):
 * shadowBlock's formula assumes `width`/`height` are the pipeline's WORKING
 * resolution (post any downscale cap), matching how real presets' small
 * shadow_block values (9-15) are tuned. If a future wiring point passes
 * full original-image dimensions instead, this formula will produce a
 * much larger, wrong-scale block size. Verify against the actual working
 * resolution at the real call site before wiring this in.
 */

export interface ExpertParameterMap {
  clahe: { clipLimit: number; tileSize: number };
  threshold: { method: "otsu" | "sauvola"; windowSize?: number; k?: number };
  xdog: { detailRadius: number; edgeSensitivity: number; shadowBlock: number };
  stipple: { minDist: number; densityScale: number };
  morphology: { kernelSize: number };
  reasons: string[];
}

/**
 * Computes a rough edge-density estimate (fraction of pixels that are a
 * strong local gradient) from a grayscale ImageData. Simple Sobel-magnitude
 * threshold -- deliberately basic since this only feeds a coarse high/low
 * density split, not a precision measurement.
 */
function estimateEdgeDensity(imageData: ImageData): number {
  const { width, height, data } = imageData;
  let edgeCount = 0;
  let total = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const gx = data[i + 4] - data[i - 4];
      const gy = data[i + width * 4] - data[i - width * 4];
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 40) edgeCount++;
      total++;
    }
  }
  return total > 0 ? edgeCount / total : 0;
}

export function analyzeImageExpert(imageData: ImageData): ExpertParameterMap {
  const { width, height } = imageData;
  const reasons: string[] = [];
  const edgeDensity = estimateEdgeDensity(imageData);

  // --- XDoG (real signature: detailRadius, edgeSensitivity, shadowBlock).
  // High edge density -> smaller blur radius (preserve fine detail) and a
  // slightly lower edgeSensitivity (avoid over-darkening already-busy
  // regions). shadowBlock is the block size fed into applyXDoG's internal
  // adaptiveThreshold call -- scaled to resolution, forced odd.
  //
  // edgeSensitivity magnitude corrected to this repo's real tested range
  // (0.88-0.98, per style-engine-map.ts's coordinate-descent-tuned
  // presets) -- see file header for why the brief's original 1.4/1.8
  // would have been a severe regression (near-solid-black output).
  const detailRadius = edgeDensity > 0.18 ? 1.0 : 1.8;
  const edgeSensitivity = edgeDensity > 0.18 ? 0.90 : 0.96;
  let shadowBlock = Math.round(Math.min(width, height) / 20);
  shadowBlock = Math.max(9, Math.min(51, shadowBlock));
  if (shadowBlock % 2 === 0) shadowBlock += 1;
  reasons.push(
    `edgeDensity=${edgeDensity.toFixed(3)} → XDoG detailRadius=${detailRadius}, ` +
    `edgeSensitivity=${edgeSensitivity}, shadowBlock=${shadowBlock}`
  );

  // --- clahe / threshold / stipple / morphology: PLACEHOLDER.
  // No tuning logic for these was specified in the Fix #3 brief. Neutral,
  // clearly-flagged defaults only -- do not treat as tuned.
  reasons.push(
    "clahe/threshold/stipple/morphology: not yet analyzed -- placeholder " +
    "defaults only, no tuning logic specified for this pass"
  );

  return {
    clahe: { clipLimit: 2.0, tileSize: 8 },
    threshold: { method: "sauvola" },
    xdog: { detailRadius, edgeSensitivity, shadowBlock },
    stipple: { minDist: 4, densityScale: 1.0 },
    morphology: { kernelSize: 3 },
    reasons,
  };
}
