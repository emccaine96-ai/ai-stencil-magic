/**
 * Phase 6 Wave 5 — Advanced brush parameter model.
 *
 * Layered ON TOP of the existing `src/lib/brushes.ts` engine so the legacy
 * BrushId pipeline keeps working. New code (mobile toolbar, brush playground,
 * plugin SDK) consumes this richer model and downsamples via toLegacyBrush().
 */

import type { BrushSettings as LegacyBrush } from "./brushes";

export type BlendMode =
  | "normal" | "multiply" | "overlay" | "screen"
  | "soft-light" | "hard-light" | "color-dodge" | "color-burn"
  | "darken" | "lighten" | "difference";

export type BrushType =
  | "liner" | "shader" | "texture" | "colorPacker"
  | "softBrush" | "calligraphy" | "bristle" | "spray" | "wet" | "eraser";

export type TexturePattern =
  | "soft_grain" | "rough_grain" | "dot_grid" | "soft_cloud"
  | "noise_fine" | "noise_coarse" | "bristle_lines" | "canvas_weave"
  | "skin_pore" | "ink_bleed";

export type BrushParameters = {
  size: number;
  flow: number;
  opacity: number;
  jitter: number;
  smoothing: number;
  spacing: number;
  angleRandomness: number;
  scatter: number;
  hardness: number;
  blendMode: BlendMode;
  simulatePressure: boolean;
  pressureSize: number;
  pressureOpacity: number;
  pressureCurve: number;
  tiltSensitivity: number;
  velocitySize: number;
  velocityOpacity: number;
  taperIn: number;
  taperOut: number;
  wetEdges: boolean;
  scattering: number;
  texturePattern?: TexturePattern;
  textureScale?: number;
  textureDepth?: number;
  color: string;
};

export type Brush = {
  id: string;
  name: string;
  type: BrushType;
  params: BrushParameters;
  description?: string;
  category?: "Sketching" | "Inking" | "Painting" | "Shading" | "Tattoo" | "Texture" | "FX";
};

const D: BrushParameters = {
  size: 16, flow: 1, opacity: 1, jitter: 0, smoothing: 0.5,
  spacing: 0.05, angleRandomness: 0, scatter: 0, hardness: 0.9,
  blendMode: "normal", simulatePressure: true,
  pressureSize: 0.8, pressureOpacity: 0.3, pressureCurve: 1,
  tiltSensitivity: 0, velocitySize: 0, velocityOpacity: 0,
  taperIn: 0, taperOut: 0, wetEdges: false, scattering: 0,
  color: "#111111",
};

const mk = (p: Partial<BrushParameters>): BrushParameters => ({ ...D, ...p });

export const BUILTIN_BRUSHES: Brush[] = [
  { id: "pencil-6b", name: "6B Pencil", type: "shader", category: "Sketching",
    params: mk({ size: 6, flow: 0.85, jitter: 0.15, smoothing: 0.4, spacing: 0.04, hardness: 0.75, pressureSize: 0.9, pressureOpacity: 0.8, texturePattern: "rough_grain", textureDepth: 0.6 }),
    description: "Soft graphite with realistic grain — perfect for line studies." },
  { id: "pencil-hb", name: "HB Pencil", type: "liner", category: "Sketching",
    params: mk({ size: 3, flow: 1, jitter: 0.05, smoothing: 0.6, spacing: 0.03, hardness: 0.95, pressureSize: 0.7, pressureOpacity: 0.5, texturePattern: "noise_fine", textureDepth: 0.25 }),
    description: "Crisp, controllable pencil for tight construction lines." },
  { id: "charcoal-vine", name: "Vine Charcoal", type: "shader", category: "Sketching",
    params: mk({ size: 36, flow: 0.7, jitter: 0.25, smoothing: 0.5, spacing: 0.08, hardness: 0.4, scatter: 3, texturePattern: "rough_grain", textureDepth: 0.85, pressureSize: 0.7, pressureOpacity: 0.7 }),
    description: "Loose, gestural charcoal with broken organic edges." },

  { id: "liner-fine", name: "Fine Liner", type: "liner", category: "Inking",
    params: mk({ size: 3, flow: 1, jitter: 0.05, smoothing: 0.85, spacing: 0.03, angleRandomness: 0.1, pressureSize: 0.4, pressureOpacity: 0.2, pressureCurve: 1.1, taperIn: 0.05, taperOut: 0.15 }),
    description: "Razor-sharp liner with stabilised stroke." },
  { id: "liner-bold", name: "Bold Liner", type: "liner", category: "Inking",
    params: mk({ size: 9, flow: 1, smoothing: 0.9, spacing: 0.03, pressureSize: 0.85, pressureOpacity: 0.15, pressureCurve: 1.3, taperIn: 0.08, taperOut: 0.25 }),
    description: "Confident, weighty linework with strong pressure response." },
  { id: "ink-tech-pen", name: "Technical Pen", type: "liner", category: "Inking",
    params: mk({ size: 4, flow: 1, smoothing: 0.95, spacing: 0.02, pressureSize: 0.05, pressureOpacity: 0.05, hardness: 1 }),
    description: "Constant-width pen — engineering precision." },
  { id: "ink-brush-pen", name: "Brush Pen", type: "calligraphy", category: "Inking",
    params: mk({ size: 22, flow: 1, smoothing: 0.7, spacing: 0.03, pressureSize: 0.95, pressureOpacity: 0.1, pressureCurve: 0.8, tiltSensitivity: 0.7, taperIn: 0.1, taperOut: 0.35, velocitySize: 0.3 }),
    description: "Expressive nib that swells with pressure and tilt." },
  { id: "ink-wet", name: "Wet Ink", type: "wet", category: "Inking",
    params: mk({ size: 30, flow: 0.85, smoothing: 0.75, spacing: 0.03, hardness: 0.55, pressureSize: 0.7, pressureOpacity: 0.35, wetEdges: true, texturePattern: "ink_bleed", textureDepth: 0.5 }),
    description: "Liquid ink with pooling at edges — perfect for sumi-e." },

  { id: "round-hard", name: "Hard Round", type: "shader", category: "Painting",
    params: mk({ size: 18, flow: 1, smoothing: 0.5, spacing: 0.05, hardness: 0.95, pressureSize: 0.85, pressureOpacity: 0.3 }),
    description: "Workhorse — opaque, predictable, hard-edged." },
  { id: "round-soft", name: "Soft Round", type: "softBrush", category: "Painting",
    params: mk({ size: 60, flow: 0.45, smoothing: 0.6, spacing: 0.04, hardness: 0.2, pressureSize: 0.6, pressureOpacity: 0.85, pressureCurve: 0.8, texturePattern: "soft_cloud", textureDepth: 0.2 }),
    description: "Smooth, feathered round brush for blending and glazing." },
  { id: "oil-bristle", name: "Oil Bristle", type: "bristle", category: "Painting",
    params: mk({ size: 32, flow: 0.9, smoothing: 0.4, spacing: 0.06, hardness: 0.7, jitter: 0.2, angleRandomness: 0.15, pressureSize: 0.6, pressureOpacity: 0.4, texturePattern: "bristle_lines", textureDepth: 0.85 }),
    description: "Stiff oil bristle leaves textured streaks per stamp." },
  { id: "flat-impasto", name: "Flat Impasto", type: "bristle", category: "Painting",
    params: mk({ size: 44, flow: 1, smoothing: 0.35, spacing: 0.05, hardness: 0.8, angleRandomness: 0.05, pressureSize: 0.55, pressureOpacity: 0.2, texturePattern: "canvas_weave", textureDepth: 0.55 }),
    description: "Loaded flat brush — thick, weighty impasto strokes." },
  { id: "watercolor-wash", name: "Watercolor Wash", type: "wet", category: "Painting",
    params: mk({ size: 90, flow: 0.25, opacity: 0.6, smoothing: 0.7, spacing: 0.04, hardness: 0.05, wetEdges: true, blendMode: "multiply", pressureSize: 0.5, pressureOpacity: 0.8, texturePattern: "soft_cloud", textureDepth: 0.4 }),
    description: "Transparent watercolor with classic darker edges." },
  { id: "gouache-flat", name: "Gouache Flat", type: "shader", category: "Painting",
    params: mk({ size: 38, flow: 1, smoothing: 0.5, spacing: 0.04, hardness: 0.85, angleRandomness: 0.03, pressureSize: 0.5, pressureOpacity: 0.15 }),
    description: "Opaque matte coverage with subtle brush body." },

  { id: "airbrush-soft", name: "Soft Airbrush", type: "softBrush", category: "Shading",
    params: mk({ size: 80, flow: 0.35, opacity: 0.95, smoothing: 0.65, spacing: 0.04, hardness: 0.05, pressureSize: 0.55, pressureOpacity: 0.95, pressureCurve: 0.7 }),
    description: "Buttery airbrush for gradients and atmospheric shading." },
  { id: "airbrush-hard", name: "Hard Airbrush", type: "softBrush", category: "Shading",
    params: mk({ size: 50, flow: 0.55, smoothing: 0.55, spacing: 0.05, hardness: 0.4, pressureSize: 0.6, pressureOpacity: 0.9, pressureCurve: 0.85 }),
    description: "Tighter airbrush with defined-but-soft edge." },
  { id: "noise-grain", name: "Grain Shader", type: "texture", category: "Shading",
    params: mk({ size: 46, flow: 0.6, smoothing: 0.5, spacing: 0.08, hardness: 0.9, scatter: 2, jitter: 0.2, texturePattern: "noise_coarse", textureDepth: 1, pressureSize: 0.4, pressureOpacity: 0.7 }),
    description: "High-frequency grain — perfect for tonal stippled shading." },

  { id: "tattoo-liner", name: "Tattoo Liner", type: "liner", category: "Tattoo",
    params: mk({ size: 5, flow: 1, smoothing: 0.92, spacing: 0.02, hardness: 1, pressureSize: 0.2, pressureOpacity: 0.05, taperIn: 0.03, taperOut: 0.18 }),
    description: "Stencil-perfect liner — zero anti-alias bleed, ultra stable." },
  { id: "tattoo-magnum", name: "Magnum Shader", type: "shader", category: "Tattoo",
    params: mk({ size: 22, flow: 0.7, smoothing: 0.7, spacing: 0.04, hardness: 0.7, angleRandomness: 0.05, pressureSize: 0.8, pressureOpacity: 0.6, texturePattern: "skin_pore", textureDepth: 0.35 }),
    description: "Wide magnum needle pack for smooth tattoo gradients." },
  { id: "tattoo-dotwork", name: "Dotwork Packer", type: "texture", category: "Tattoo",
    params: mk({ size: 14, flow: 0.85, smoothing: 0.5, spacing: 0.45, hardness: 1, scatter: 5, angleRandomness: 1, jitter: 0.3, texturePattern: "dot_grid", textureDepth: 1, simulatePressure: false }),
    description: "Classic dotwork stippling — even distribution, tonal control." },
  { id: "tattoo-whip-shade", name: "Whip Shading", type: "shader", category: "Tattoo",
    params: mk({ size: 10, flow: 0.9, smoothing: 0.6, spacing: 0.04, hardness: 0.85, pressureSize: 0.95, pressureOpacity: 0.4, pressureCurve: 1.4, taperOut: 0.6, velocityOpacity: 0.4 }),
    description: "Pressure-driven whip strokes that fade out — traditional tattoo." },
  { id: "tattoo-color-pack", name: "Color Packer", type: "colorPacker", category: "Tattoo",
    params: mk({ size: 24, flow: 0.55, opacity: 1, smoothing: 0.6, spacing: 0.035, hardness: 0.65, blendMode: "overlay", pressureSize: 0.7, pressureOpacity: 0.5 }),
    description: "Solid color saturation builder — flawless flat fills." },

  { id: "spray-can", name: "Spray Can", type: "spray", category: "Texture",
    params: mk({ size: 70, flow: 0.18, smoothing: 0.45, spacing: 0.08, hardness: 1, scattering: 1, pressureSize: 0.5, pressureOpacity: 0.6, texturePattern: "noise_coarse", textureDepth: 0.7 }),
    description: "Aerosol spray with realistic over-spray cone." },
  { id: "splatter-ink", name: "Ink Splatter", type: "spray", category: "FX",
    params: mk({ size: 90, flow: 0.6, smoothing: 0.2, spacing: 0.5, scatter: 30, jitter: 0.5, angleRandomness: 1, scattering: 1, texturePattern: "ink_bleed", textureDepth: 1 }),
    description: "Chaotic ink splatters — grunge and energy effects." },
  { id: "calligraphy-flat", name: "Calligraphy Flat", type: "calligraphy", category: "Inking",
    params: mk({ size: 26, flow: 1, smoothing: 0.6, spacing: 0.03, hardness: 1, pressureSize: 0.9, pressureOpacity: 0.15, tiltSensitivity: 0.85 }),
    description: "Italic chisel nib — dramatic thick/thin contrast." },
  { id: "eraser-soft", name: "Soft Eraser", type: "eraser", category: "FX",
    params: mk({ size: 40, flow: 0.7, smoothing: 0.5, spacing: 0.05, hardness: 0.2, pressureSize: 0.7, pressureOpacity: 0.8 }),
    description: "Feathered eraser for gentle clean-up and blending." },
  { id: "eraser-hard", name: "Hard Eraser", type: "eraser", category: "FX",
    params: mk({ size: 32, flow: 1, smoothing: 0.6, spacing: 0.04, hardness: 0.95, pressureSize: 0.8, pressureOpacity: 0.3 }),
    description: "Sharp, opaque eraser for precise cuts." },
];

export const BRUSH_CATEGORIES = ["Sketching", "Inking", "Painting", "Shading", "Tattoo", "Texture", "FX"] as const;

export function brushById(id: string): Brush | undefined {
  return BUILTIN_BRUSHES.find((b) => b.id === id);
}

export function toLegacyBrush(b: Brush, color = b.params.color): LegacyBrush {
  const p = b.params;
  const legacyId =
    b.type === "eraser"       ? "eraser" :
    b.type === "liner"        ? (p.size <= 4 ? "fine-liner" : "ink-pen") :
    b.type === "calligraphy"  ? "calligraphy" :
    b.type === "spray"        ? "spray" :
    b.type === "bristle"      ? "charcoal" :
    b.type === "wet"          ? "wet-ink" :
    b.type === "softBrush"    ? "soft-airbrush" :
    b.type === "colorPacker"  ? "marker" :
    b.type === "texture"      ? (p.texturePattern === "dot_grid" ? "dotwork" : "noise-grain") :
                                "hard-round";
  return {
    id: legacyId as LegacyBrush["id"],
    size: p.size,
    opacity: p.opacity,
    flow: p.flow,
    spacing: p.spacing,
    hardness: p.hardness,
    scatter: p.scatter,
    rotationJitter: p.angleRandomness,
    pressureSize: p.pressureSize,
    pressureOpacity: p.pressureOpacity,
    pressureCurve: p.pressureCurve,
    color,
  };
}

export function simulatePressure(velocityPxPerMs: number, radiusPx = 0): number {
  const speed = Math.min(1, velocityPxPerMs / 3);
  const area = Math.min(1, radiusPx / 28);
  return Math.max(0.1, Math.min(1, (1 - speed * 0.7) * (0.7 + area * 0.3)));
}

export function taperMultiplier(t: number, taperIn: number, taperOut: number): number {
  let m = 1;
  if (taperIn > 0 && t < taperIn) m *= t / taperIn;
  if (taperOut > 0 && t > 1 - taperOut) m *= (1 - t) / taperOut;
  return Math.max(0, m);
}
