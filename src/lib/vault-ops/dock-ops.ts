/**
 * Vault dock action table.
 *
 * Maps every PicsartDock button to what it does, in one place that is DOM-free and testable.
 *
 *  - "filter":  instant ImageData -> ImageData. May change canvas size (rotate, resize).
 *  - "stroke":  drag tool. The editor collects a pointer path and applies it on release.
 *  - "async":   long-running job. The editor shows a busy state while it runs.
 *
 * Parameters are tuned for tattoo stencils (high-contrast line art that gets printed and
 * transferred), not for photo editing: effects are deliberately restrained so one tap helps
 * instead of wrecking the linework.
 */

import {
  applyCurves,
  chromaticAberration,
  CURVES_PRESETS,
  dispersion,
  edgeDetect,
  filmGrain,
  flipH,
  flipV,
  glow,
  gaussianBlur,
  gradientMap,
  lensFlare,
  motionBlur,
  pixelate,
  rotate90,
  sepia,
  sharpen,
  stretch,
  tiltShift,
  vignette,
} from "./image-ops";

export type FilterOp = (img: ImageData) => ImageData;

export type StrokeKind = "smudge" | "heal" | "clone" | "liquify-push" | "liquify-inflate" | "liquify-deflate";
export type AsyncKind = "remove-bg" | "cutout" | "upscale";

/** Edge detect returns light edges on black; stencils want dark lines on white paper. */
function edgeLines(img: ImageData): ImageData {
  const e = edgeDetect(img, 1, true);
  const d = e.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 255 - d[i];
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return e;
}

/**
 * Thermal-paper ink. Dark pixels become coloured ink, light pixels stay white paper.
 * (A cinematic gradient map recolours mid-greys only and leaves a black-and-white stencil
 * unchanged, which is useless here.)
 */
function thermalInk(img: ImageData, ink: [number, number, number]): ImageData {
  const out = new ImageData(img.width, img.height);
  const s = img.data, d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    const luma = (0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2]) / 255;
    const a = 1 - luma; // 0 = paper, 1 = full ink
    d[i] = Math.round(255 - a * (255 - ink[0]));
    d[i + 1] = Math.round(255 - a * (255 - ink[1]));
    d[i + 2] = Math.round(255 - a * (255 - ink[2]));
    d[i + 3] = s[i + 3];
  }
  return out;
}

/** Filters that are safe to apply with one tap. Keyed by PicsartDockHandlers name. */
export const FILTER_OPS: Record<string, { label: string; run: FilterOp }> = {
  flipH: { label: "Flip horizontal", run: (i) => flipH(i) },
  flipV: { label: "Flip vertical", run: (i) => flipV(i) },
  rotate90: { label: "Rotate 90°", run: (i) => rotate90(i, "cw") },

  blur: { label: "Blur", run: (i) => gaussianBlur(i, 3) },
  sharpen: { label: "Sharpen", run: (i) => sharpen(i, 1.2) },
  vignette: { label: "Vignette", run: (i) => vignette(i, 0.35, 0.45) },
  pixelate: { label: "Pixelate", run: (i) => pixelate(i, 8) },
  edge: { label: "Edge lines", run: (i) => edgeLines(i) },
  grain: { label: "Film grain", run: (i) => filmGrain(i, 12) },
  sepia: { label: "Sepia", run: (i) => sepia(i, 1) },
  lensFlare: { label: "Lens flare", run: (i) => lensFlare(i, 0.3, 0.3, 0.7) },
  glow: { label: "Glow", run: (i) => glow(i, 0.7, 8, 0.6) },
  chromatic: { label: "Chromatic aberration", run: (i) => chromaticAberration(i, 3) },
  tiltShift: { label: "Tilt shift", run: (i) => tiltShift(i, 0.5, 0.25, 6) },
  dispersion: { label: "Dispersion", run: (i) => dispersion(i, 1200, 0.25) },
  stretch: { label: "Stretch", run: (i) => stretch(i, 1.25, 1.0) },
  motion: { label: "Motion blur", run: (i) => motionBlur(i, 0, 10) },

  thermalBlue: { label: "Thermal blue", run: (i) => thermalInk(i, [37, 99, 235]) },
  thermalPurple: { label: "Thermal purple", run: (i) => thermalInk(i, [126, 34, 206]) },
  gradientMap: { label: "Gradient map", run: (i) => gradientMap(i, undefined, "black-ink") },
  curves: { label: "Curves", run: (i) => applyCurves(i, CURVES_PRESETS["Stencil Clean"], "all") },
};

export const STROKE_OPS: Record<string, { label: string; stroke: StrokeKind; hint: string }> = {
  smudge: { label: "Smudge", stroke: "smudge", hint: "Drag to smear" },
  heal: { label: "Spot heal", stroke: "heal", hint: "Paint over a blemish, then lift" },
  cloneStamp: { label: "Clone stamp", stroke: "clone", hint: "Tap a source point, then paint" },
  liquifyPush: { label: "Liquify push", stroke: "liquify-push", hint: "Drag to push pixels" },
  liquifyInflate: { label: "Liquify inflate", stroke: "liquify-inflate", hint: "Press to expand" },
  liquifyDeflate: { label: "Liquify deflate", stroke: "liquify-deflate", hint: "Press to pinch" },
};

export const ASYNC_OPS: Record<string, { label: string; job: AsyncKind }> = {
  removeBg: { label: "Remove background", job: "remove-bg" },
  cutout: { label: "Cutout", job: "cutout" },
  upscale6k: { label: "Upscale 2x", job: "upscale" },
};

/** Every dock handler name this module implements. */
export const IMPLEMENTED_DOCK_ACTIONS: readonly string[] = [
  ...Object.keys(FILTER_OPS),
  ...Object.keys(STROKE_OPS),
  ...Object.keys(ASYNC_OPS),
];
