/**
 * Retouch Studio — Tattoo Mode layer model.
 *
 * Tattoo Mode is "stencil over a reference", not a general image editor, so
 * layers are TYPED and the type decides how they behave:
 *
 *  - "stencil"   Exactly one, always present, always the top of the stack.
 *                It is the live edited stencil owned by RetouchCanvas (the one
 *                thing the brush tools paint on). This model never holds its
 *                pixels; it only holds how the stencil is PLACED and SHOWN.
 *  - "reference" A photo the user adds (body shot, placement photo, the
 *                source photo). Image-only, never painted on.
 *  - "guide"     A second stencil / sketch (e.g. from the Vault) shown as an
 *                overlay for comparison. Image-only.
 *
 * Reuse, not duplication: blend modes come from the existing compositor's
 * `LayerBlendMode` (src/lib/layer-system.ts, a type import only). This file is
 * deliberately NOT the Vault editor's `LayerState` (src/lib/localDB.ts) and
 * does not touch that DB schema. `layer-system.ts`'s compositeLayers() is not
 * used for the live view because it has no per-layer placement (move / scale /
 * rotate), which is the entire point of lining a stencil up over a limb.
 *
 * Pure data + pure functions. No DOM access in the model, so it is unit
 * testable in Node. Pixels are referenced by `src` (data/object URL) only.
 */
import type { LayerBlendMode } from "@/lib/layer-system";

export type TattooLayerKind = "stencil" | "reference" | "guide";

/** Placement of a layer within the shared artboard (artboard = stencil pixel size). */
export interface LayerTransform {
  /** Offset of the layer's centre from the artboard centre, in artboard pixels. */
  x: number;
  y: number;
  /** Uniform scale, 1 = natural size. */
  scale: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
}

/**
 * Per-layer look. Brightness/contrast are the CSS-filter multipliers used by
 * touch-up.tsx's photoFilter/stencilFilter (1 = unchanged, range 0.4..1.8),
 * so the sliders behave exactly like the ones that already ship there.
 */
export interface LayerLook {
  brightness: number;
  contrast: number;
  /** 0..1 */
  opacity: number;
  blendMode: LayerBlendMode;
}

export interface TattooLayer {
  id: string;
  kind: TattooLayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Image source for reference/guide layers. Null for the stencil layer (its pixels live in RetouchCanvas). */
  src: string | null;
  /** Natural pixel size of `src`. The stencil layer uses the artboard size. */
  width: number;
  height: number;
  transform: LayerTransform;
  look: LayerLook;
}

export interface TattooStack {
  /** Artboard size = the stencil's pixel size. */
  artboard: { width: number; height: number };
  /** Bottom -> top. The stencil layer is always last (top). */
  layers: TattooLayer[];
  activeId: string;
}

/* ---------------------------------------------------------------- limits -- */

export const BRIGHTNESS_RANGE = { min: 0.4, max: 1.8, step: 0.05 } as const;
export const CONTRAST_RANGE = { min: 0.4, max: 1.8, step: 0.05 } as const;
export const OPACITY_RANGE = { min: 0, max: 1, step: 0.01 } as const;
export const SCALE_RANGE = { min: 0.05, max: 8 } as const;
/** Total layers incl. the stencil. Bounds memory: every reference is a decoded bitmap. */
export const MAX_LAYERS = 8;

export const IDENTITY_TRANSFORM: LayerTransform = { x: 0, y: 0, scale: 1, rotation: 0 };

export const DEFAULT_LOOK: LayerLook = { brightness: 1, contrast: 1, opacity: 1, blendMode: "normal" };

/* --------------------------------------------------------------- helpers -- */

/** Clamp into [lo, hi]. A non-finite value yields `fallback` (the layer's current value), never a silent jump to a bound. */
const clamp = (v: number, lo: number, hi: number, fallback: number = lo) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

let idCounter = 0;
/** Injectable for tests; defaults to crypto.randomUUID with a counter fallback (SSR-safe). */
export function newLayerId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `layer-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
}

export function sanitizeLook(look: Partial<LayerLook>, base: LayerLook = DEFAULT_LOOK): LayerLook {
  return {
    brightness: clamp(look.brightness ?? base.brightness, BRIGHTNESS_RANGE.min, BRIGHTNESS_RANGE.max, base.brightness),
    contrast: clamp(look.contrast ?? base.contrast, CONTRAST_RANGE.min, CONTRAST_RANGE.max, base.contrast),
    opacity: clamp(look.opacity ?? base.opacity, OPACITY_RANGE.min, OPACITY_RANGE.max, base.opacity),
    blendMode: look.blendMode ?? base.blendMode,
  };
}

export function sanitizeTransform(t: Partial<LayerTransform>, base: LayerTransform = IDENTITY_TRANSFORM): LayerTransform {
  const rot = Number.isFinite(t.rotation) ? (t.rotation as number) : base.rotation;
  return {
    x: Number.isFinite(t.x) ? (t.x as number) : base.x,
    y: Number.isFinite(t.y) ? (t.y as number) : base.y,
    scale: clamp(t.scale ?? base.scale, SCALE_RANGE.min, SCALE_RANGE.max, base.scale),
    // Normalise to (-180, 180] so repeated twists never grow unbounded.
    rotation: ((((rot + 180) % 360) + 360) % 360) - 180 || 0,
  };
}

/* ------------------------------------------------------------ construction -- */

/** A fresh stack holding only the stencil layer. */
export function createStack(artboardWidth: number, artboardHeight: number): TattooStack {
  const w = Math.max(1, Math.round(artboardWidth));
  const h = Math.max(1, Math.round(artboardHeight));
  const stencil: TattooLayer = {
    id: newLayerId(),
    kind: "stencil",
    name: "Stencil",
    visible: true,
    locked: false,
    src: null,
    width: w,
    height: h,
    transform: { ...IDENTITY_TRANSFORM },
    look: { ...DEFAULT_LOOK },
  };
  return { artboard: { width: w, height: h }, layers: [stencil], activeId: stencil.id };
}

/**
 * Add a reference or guide layer BELOW the stencil (the stencil stays on top).
 * Fitted to cover-the-artboard-width by default so a dropped-in photo is
 * immediately usable. Returns the same stack unchanged if at MAX_LAYERS.
 */
export function addImageLayer(
  stack: TattooStack,
  input: { kind: "reference" | "guide"; name: string; src: string; width: number; height: number },
): TattooStack {
  if (stack.layers.length >= MAX_LAYERS) return stack;
  if (!input.src || !(input.width > 0) || !(input.height > 0)) return stack;
  const fit = stack.artboard.width / input.width;
  const layer: TattooLayer = {
    id: newLayerId(),
    kind: input.kind,
    name: input.name || (input.kind === "reference" ? "Reference" : "Guide"),
    visible: true,
    locked: false,
    src: input.src,
    width: input.width,
    height: input.height,
    transform: { x: 0, y: 0, scale: clamp(fit, SCALE_RANGE.min, SCALE_RANGE.max), rotation: 0 },
    // Guides default to a translucent multiply so the stencil stays readable over them.
    look:
      input.kind === "guide"
        ? { ...DEFAULT_LOOK, opacity: 0.6, blendMode: "multiply" }
        : { ...DEFAULT_LOOK },
  };
  const stencilIdx = stack.layers.findIndex((l) => l.kind === "stencil");
  const layers = stack.layers.slice();
  layers.splice(stencilIdx < 0 ? layers.length : stencilIdx, 0, layer);
  return { ...stack, layers, activeId: layer.id };
}

/* -------------------------------------------------------------- mutations -- */

function mapLayer(stack: TattooStack, id: string, fn: (l: TattooLayer) => TattooLayer): TattooStack {
  let changed = false;
  const layers = stack.layers.map((l) => {
    if (l.id !== id) return l;
    const next = fn(l);
    if (next !== l) changed = true;
    return next;
  });
  return changed ? { ...stack, layers } : stack;
}

export function setActive(stack: TattooStack, id: string): TattooStack {
  return stack.layers.some((l) => l.id === id) && stack.activeId !== id ? { ...stack, activeId: id } : stack;
}

export function setVisible(stack: TattooStack, id: string, visible: boolean): TattooStack {
  return mapLayer(stack, id, (l) => (l.visible === visible ? l : { ...l, visible }));
}

export function setLocked(stack: TattooStack, id: string, locked: boolean): TattooStack {
  return mapLayer(stack, id, (l) => (l.locked === locked ? l : { ...l, locked }));
}

export function updateLook(stack: TattooStack, id: string, patch: Partial<LayerLook>): TattooStack {
  return mapLayer(stack, id, (l) => ({ ...l, look: sanitizeLook(patch, l.look) }));
}

/** Locked layers refuse placement changes. The stencil can be moved too (that is the point). */
export function updateTransform(stack: TattooStack, id: string, patch: Partial<LayerTransform>): TattooStack {
  return mapLayer(stack, id, (l) => (l.locked ? l : { ...l, transform: sanitizeTransform(patch, l.transform) }));
}

export function resetLook(stack: TattooStack, id: string): TattooStack {
  return mapLayer(stack, id, (l) => ({ ...l, look: { ...DEFAULT_LOOK } }));
}

/** The stencil layer can never be removed. Removing the active layer re-targets the stencil. */
export function removeLayer(stack: TattooStack, id: string): TattooStack {
  const target = stack.layers.find((l) => l.id === id);
  if (!target || target.kind === "stencil") return stack;
  const layers = stack.layers.filter((l) => l.id !== id);
  const stencil = layers.find((l) => l.kind === "stencil");
  return { ...stack, layers, activeId: stack.activeId === id ? (stencil?.id ?? layers[0]?.id ?? "") : stack.activeId };
}

/**
 * Reorder a non-stencil layer by `delta` positions (negative = toward the
 * bottom). The stencil is pinned to the top, so a layer can never pass it.
 */
export function moveLayer(stack: TattooStack, id: string, delta: number): TattooStack {
  const i = stack.layers.findIndex((l) => l.id === id);
  if (i < 0 || stack.layers[i].kind === "stencil" || !Number.isFinite(delta)) return stack;
  const maxIdx = stack.layers.findIndex((l) => l.kind === "stencil") - 1; // highest slot a movable layer may take
  const j = Math.max(0, Math.min(maxIdx, i + Math.trunc(delta)));
  if (i === j) return stack;
  const layers = stack.layers.slice();
  const [l] = layers.splice(i, 1);
  layers.splice(j, 0, l);
  return { ...stack, layers };
}

/* ----------------------------------------------------------------- views -- */

/** CSS `filter` string for a layer's brightness/contrast — same form touch-up.tsx uses. */
export function cssFilter(look: LayerLook): string {
  return `brightness(${look.brightness}) contrast(${look.contrast})`;
}

/** CSS `transform` for a layer, relative to the artboard centre. */
export function cssTransform(t: LayerTransform): string {
  return `translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg) scale(${t.scale})`;
}

/** Layers to draw, bottom -> top, with hidden ones removed. */
export function visibleLayers(stack: TattooStack): TattooLayer[] {
  return stack.layers.filter((l) => l.visible);
}

export function getLayer(stack: TattooStack, id: string): TattooLayer | undefined {
  return stack.layers.find((l) => l.id === id);
}

/** Structural invariants. Returns a list of violations (empty = valid). Used by tests and as a dev guard. */
export function validateStack(stack: TattooStack): string[] {
  const errs: string[] = [];
  const stencils = stack.layers.filter((l) => l.kind === "stencil");
  if (stencils.length !== 1) errs.push(`expected exactly 1 stencil layer, found ${stencils.length}`);
  if (stack.layers.length && stack.layers[stack.layers.length - 1].kind !== "stencil") errs.push("stencil is not the top layer");
  if (stack.layers.length > MAX_LAYERS) errs.push(`more than ${MAX_LAYERS} layers`);
  if (!stack.layers.some((l) => l.id === stack.activeId)) errs.push("activeId does not reference a layer");
  const ids = new Set(stack.layers.map((l) => l.id));
  if (ids.size !== stack.layers.length) errs.push("duplicate layer ids");
  for (const l of stack.layers) {
    if (l.kind !== "stencil" && !l.src) errs.push(`${l.name}: image layer has no src`);
    if (l.look.opacity < 0 || l.look.opacity > 1) errs.push(`${l.name}: opacity out of range`);
  }
  return errs;
}
