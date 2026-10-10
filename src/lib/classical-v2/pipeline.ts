/**
 * classical-v2 / pipeline
 * One engine: tone prep -> XDoG contours + flow-following hatch -> fragment cleanup.
 * Output is SOFT ink (0..1). Binarising for 1-bit export is the caller's choice.
 * Reuses (does not duplicate) classical-engine/hatching.ts structureTensorOrientation
 * and classical-engine/cleanup.ts removeSmallInkSpecks.
 */
import { grayFromRGBA, gaussian } from "./filters";
import { prepTone, prepOptionsFor } from "./tone";
import { xdogInk, type XDoGParams } from "./xdog";
import { renderHatchV2, HATCH_LADDERS, type HatchV2Params } from "./hatch";
import { structureTensorOrientation } from "../classical-engine/hatching";
import { removeSmallInkSpecks } from "../classical-engine/cleanup";

export type V2Style = "hatching" | "solid" | "dotwork" | "hybrid";

export interface V2Options {
  style?: V2Style;
  ladder?: keyof typeof HATCH_LADDERS | "auto";
  xdog?: Partial<XDoGParams>;
  hatch?: Partial<HatchV2Params>;
  localContrast?: number;   // 0..1
  minLinePx?: number;
  minHatchPx?: number;
}

export interface V2Result {
  ink: Float32Array;   // soft, 0..1
  lines: Float32Array;
  hatch: Float32Array;
  w: number;
  h: number;
}

/**
 * Keep only connected components >= minPx (components found on ink > thr) and apply
 * that decision to the soft ink. A soft pixel survives if ANY pixel in its 3x3
 * neighbourhood belongs to a kept component, which preserves the full anti-aliased
 * stroke (matches the tuned prototype) while still deleting isolated fragments.
 */
export function dropFragments(ink: Float32Array, w: number, h: number, minPx: number, thr = 0.35): Float32Array {
  const mask = new Uint8ClampedArray(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = ink[i] > thr ? 255 : 0;
  const kept = removeSmallInkSpecks(mask, w, h, minPx);
  // Separable 3x3 max-dilate of the kept mask.
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      tmp[i] = kept[i] || (x > 0 && kept[i - 1]) || (x + 1 < w && kept[i + 1]) ? 1 : 0;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const near = tmp[i] || (y > 0 && tmp[i - w]) || (y + 1 < h && tmp[i + w]);
      if (near) out[i] = ink[i];
    }
  }
  return out;
}

/** 3x3 Sobel gradients on a float field. */
function gradients(a: Float32Array, w: number, h: number) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = -a[i - w - 1] - 2 * a[i - 1] - a[i + w - 1] + a[i - w + 1] + 2 * a[i + 1] + a[i + w + 1];
      gy[i] = -a[i - w - 1] - 2 * a[i - w] - a[i - w + 1] + a[i + w - 1] + 2 * a[i + w] + a[i + w + 1];
    }
  }
  return { gx, gy };
}

function pickLadder(tone: Float32Array, requested: V2Options["ladder"]): keyof typeof HATCH_LADDERS {
  if (requested && requested !== "auto") return requested;
  let mean = 0; for (let i = 0; i < tone.length; i++) mean += tone[i];
  mean /= tone.length;
  return mean < 0.4 ? "darkPhoto" : "default";
}

export function runV2(rgba: Uint8ClampedArray, w: number, h: number, opts: V2Options = {}): V2Result {
  const gray = grayFromRGBA(rgba, w, h).data;
  const prep = prepOptionsFor(gray);
  const tone = prepTone(gray, w, h, prep);

  const ladderKey = pickLadder(tone, opts.ladder ?? "auto");
  const ladder = HATCH_LADDERS[ladderKey];
  const darkKeyed = prep.protectShadows;

  const lines = dropFragments(
    xdogInk(tone, w, h, { epsilon: darkKeyed ? 0.02 : 0, ...opts.xdog }, opts.localContrast ?? 0.5),
    w, h, opts.minLinePx ?? 20, 0.4,
  );

  // Large-scale flow so strokes stay long and parallel (form, not pore noise).
  const flowSrc = gaussian(tone, w, h, 2);
  const { gx, gy } = gradients(flowSrc, w, h);
  const orientation = structureTensorOrientation(gx, gy, w, h, 10 * Math.max(w, h) / 1024, 3);

  const hatchRaw = renderHatchV2(tone, orientation, w, h, {
    levels: ladder.levels, spacing: ladder.spacing, width: 1.7,
    darkBoost: darkKeyed ? 0.5 : 0, supersample: 2, ...opts.hatch,
  });
  const hatch = dropFragments(hatchRaw, w, h, opts.minHatchPx ?? 30, 0.3);

  const ink = new Float32Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = Math.min(1, Math.max(lines[i], hatch[i]));
  return { ink, lines, hatch, w, h };
}
