/**
 * Phase 6 Wave 5 — Layer system with blend modes, opacity, masks, clipping,
 * lock flags, and per-layer adjustment effects. Renders top-down to a
 * destination 2D context.
 */

export type LayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export type LayerKind = "raster" | "vector" | "text" | "adjustment" | "group";

export type LayerAdjustment =
  | { kind: "brightness"; value: number }
  | { kind: "contrast"; value: number }
  | { kind: "saturation"; value: number }
  | { kind: "hue"; value: number }
  | { kind: "invert" }
  | { kind: "threshold"; value: number };

export type Layer = {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blendMode: LayerBlendMode;
  /** Source canvas — undefined for groups/adjustments. */
  canvas?: HTMLCanvasElement;
  /** Alpha mask canvas (white = visible). */
  mask?: HTMLCanvasElement;
  /** Clip to layer below (alpha-mask by layer below). */
  clipped: boolean;
  /** Adjustments applied to all layers below (for adjustment layers). */
  adjustments?: LayerAdjustment[];
  /** Group children when kind === "group". */
  children?: Layer[];
};

export function createRasterLayer(name: string, width: number, height: number): Layer {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return {
    id: crypto.randomUUID(),
    name,
    kind: "raster",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    canvas: c,
    clipped: false,
  };
}

export function createAdjustmentLayer(name: string, adj: LayerAdjustment[]): Layer {
  return {
    id: crypto.randomUUID(),
    name,
    kind: "adjustment",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    clipped: false,
    adjustments: adj,
  };
}

export function attachMask(layer: Layer, width: number, height: number): HTMLCanvasElement {
  const m = document.createElement("canvas");
  m.width = width;
  m.height = height;
  // Initialize fully white (visible) so existing pixels remain.
  const ctx = m.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  layer.mask = m;
  return m;
}

function applyMask(src: HTMLCanvasElement, mask: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, out.width, out.height);
  return out;
}

function applyAdjustments(c: HTMLCanvasElement, adjs: LayerAdjustment[]): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(c, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (const a of adjs) {
    if (a.kind === "brightness") {
      const v = a.value * 255;
      for (let i = 0; i < d.length; i += 4) {
        d[i] += v;
        d[i + 1] += v;
        d[i + 2] += v;
      }
    } else if (a.kind === "contrast") {
      const f = (259 * (a.value * 255 + 255)) / (255 * (259 - a.value * 255));
      for (let i = 0; i < d.length; i += 4) {
        d[i] = f * (d[i] - 128) + 128;
        d[i + 1] = f * (d[i + 1] - 128) + 128;
        d[i + 2] = f * (d[i + 2] - 128) + 128;
      }
    } else if (a.kind === "saturation") {
      const s = a.value;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.2989 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = g + (d[i] - g) * s;
        d[i + 1] = g + (d[i + 1] - g) * s;
        d[i + 2] = g + (d[i + 2] - g) * s;
      }
    } else if (a.kind === "invert") {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
    } else if (a.kind === "threshold") {
      const t = a.value * 255;
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.2989 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = g > t ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    } else if (a.kind === "hue") {
      // simple HSL hue rotation
      for (let i = 0; i < d.length; i += 4) {
        const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        const [r, g, b] = hslToRgb((h + a.value) % 1, s, l);
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Composite a stack top-down (index 0 = bottom) into `dest`. */
export function compositeLayers(dest: CanvasRenderingContext2D, layers: Layer[]) {
  const W = dest.canvas.width,
    H = dest.canvas.height;
  dest.clearRect(0, 0, W, H);

  // Build a working canvas to apply adjustment layers retroactively.
  let work = document.createElement("canvas");
  work.width = W;
  work.height = H;
  let wctx = work.getContext("2d")!;

  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.kind === "adjustment" && layer.adjustments) {
      work = applyAdjustments(work, layer.adjustments);
      wctx = work.getContext("2d")!;
      continue;
    }
    if (!layer.canvas) continue;
    let src = layer.canvas;
    if (layer.mask) src = applyMask(src, layer.mask);

    wctx.save();
    wctx.globalAlpha = layer.opacity;
    wctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    if (layer.clipped) {
      // Use prior alpha as mask
      const clip = document.createElement("canvas");
      clip.width = W;
      clip.height = H;
      const cctx = clip.getContext("2d")!;
      cctx.drawImage(src, 0, 0);
      cctx.globalCompositeOperation = "destination-in";
      cctx.drawImage(work, 0, 0);
      wctx.drawImage(clip, 0, 0);
    } else {
      wctx.drawImage(src, 0, 0);
    }
    wctx.restore();
  }
  dest.drawImage(work, 0, 0);
}

export function moveLayer(layers: Layer[], id: string, delta: number): Layer[] {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return layers;
  const j = Math.max(0, Math.min(layers.length - 1, i + delta));
  if (i === j) return layers;
  const out = layers.slice();
  const [l] = out.splice(i, 1);
  out.splice(j, 0, l);
  return out;
}

export function duplicateLayer(l: Layer): Layer {
  const dup = { ...l, id: crypto.randomUUID(), name: l.name + " copy" };
  if (l.canvas) {
    const c = document.createElement("canvas");
    c.width = l.canvas.width;
    c.height = l.canvas.height;
    c.getContext("2d")!.drawImage(l.canvas, 0, 0);
    dup.canvas = c;
  }
  if (l.mask) {
    const m = document.createElement("canvas");
    m.width = l.mask.width;
    m.height = l.mask.height;
    m.getContext("2d")!.drawImage(l.mask, 0, 0);
    dup.mask = m;
  }
  return dup;
}

export function mergeDown(layers: Layer[], id: string): Layer[] {
  const i = layers.findIndex((l) => l.id === id);
  if (i <= 0) return layers;
  const top = layers[i],
    bottom = layers[i - 1];
  if (!top.canvas || !bottom.canvas) return layers;
  const ctx = bottom.canvas.getContext("2d")!;
  ctx.save();
  ctx.globalAlpha = top.opacity;
  ctx.globalCompositeOperation = top.blendMode as GlobalCompositeOperation;
  ctx.drawImage(top.mask ? applyMask(top.canvas, top.mask) : top.canvas, 0, 0);
  ctx.restore();
  const out = layers.slice();
  out.splice(i, 1);
  return out;
}
