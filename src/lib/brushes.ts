// Stamp-based brush engine for PrimalCanvas Studio 2.0.
// All brushes are pure Canvas2D so they work everywhere on Android Chrome.

export type BrushId =
  | "hard-round"
  | "soft-airbrush"
  | "fine-liner"
  | "dotwork"
  | "crosshatch"
  | "stipple"
  | "wet-ink"
  | "eraser"
  | "charcoal"
  | "marker"
  | "calligraphy"
  | "spray"
  | "ink-pen"
  | "noise-grain"
  // Tranche 1 — tattoo + pro additions
  | "tattoo-liner-3rl"
  | "tattoo-liner-9rl"
  | "tattoo-mag-7"
  | "tattoo-mag-13"
  | "tattoo-curved-mag"
  | "whip-shading"
  | "pepper-shading"
  | "smooth-shader"
  | "blood-spatter"
  | "watercolor-wash"
  | "halftone-dots"
  | "pencil-2b"
  | "gel-pen"
  | "neon-glow"
  | "chalk"
  // Tranche 2 — inking, sketching, painting, FX
  | "technical-pen"
  | "brush-pen"
  | "dip-pen"
  | "fountain-pen"
  | "hb-pencil"
  | "pencil-6b"
  | "colored-pencil"
  | "conte-crayon"
  | "oil-flat"
  | "oil-round"
  | "palette-knife"
  | "gouache"
  | "acrylic-dry"
  | "pastel-soft"
  | "glitch-stripe"
  | "chromatic-fringe"
  | "bokeh-dots"
  | "stars-sparkle"
  | "lightning-bolt"
  | "smoke-puff"
  | "confetti";

export type BrushSettings = {
  id: BrushId;
  size: number; // px
  opacity: number; // 0..1
  flow: number; // 0..1 — per-stamp alpha
  spacing: number; // fraction of size, 0.02..3
  hardness: number; // 0..1
  scatter: number; // px jitter
  rotationJitter: number; // 0..1
  pressureSize: number; // 0..1 — how much pressure scales size
  pressureOpacity: number; // 0..1
  /** Gamma applied to raw pressure: <1 boosts light touch, >1 demands force. */
  pressureCurve: number;
  color: string; // hex
};

export const DEFAULTS: Record<BrushId, Omit<BrushSettings, "color">> = {
  "hard-round": {
    id: "hard-round",
    size: 18,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.05,
    hardness: 0.95,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.85,
    pressureOpacity: 0.3,
    pressureCurve: 1.0,
  },
  "soft-airbrush": {
    id: "soft-airbrush",
    size: 80,
    opacity: 0.35,
    flow: 0.4,
    spacing: 0.05,
    hardness: 0.1,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.6,
    pressureOpacity: 0.9,
    pressureCurve: 0.7,
  },
  "fine-liner": {
    id: "fine-liner",
    size: 4,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.04,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.15,
    pressureOpacity: 0.9,
    pressureCurve: 1.0,
  },
  dotwork: {
    id: "dotwork",
    size: 22,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.4,
    hardness: 1.0,
    scatter: 4,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.4,
    pressureCurve: 1.0,
  },
  crosshatch: {
    id: "crosshatch",
    size: 28,
    opacity: 0.9,
    flow: 0.9,
    spacing: 0.2,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.4,
    pressureOpacity: 0.5,
    pressureCurve: 1.0,
  },
  stipple: {
    id: "stipple",
    size: 30,
    opacity: 0.9,
    flow: 0.6,
    spacing: 0.15,
    hardness: 1.0,
    scatter: 6,
    rotationJitter: 1,
    pressureSize: 0.4,
    pressureOpacity: 0.6,
    pressureCurve: 1.0,
  },
  "wet-ink": {
    id: "wet-ink",
    size: 30,
    opacity: 1.0,
    flow: 0.7,
    spacing: 0.03,
    hardness: 0.6,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.7,
    pressureOpacity: 0.3,
    pressureCurve: 1.2,
  },
  eraser: {
    id: "eraser",
    size: 32,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.05,
    hardness: 0.8,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.8,
    pressureOpacity: 0.5,
    pressureCurve: 1.0,
  },
  charcoal: {
    id: "charcoal",
    size: 36,
    opacity: 0.85,
    flow: 0.7,
    spacing: 0.08,
    hardness: 0.7,
    scatter: 3,
    rotationJitter: 1,
    pressureSize: 0.6,
    pressureOpacity: 0.7,
    pressureCurve: 1.0,
  },
  marker: {
    id: "marker",
    size: 26,
    opacity: 0.55,
    flow: 0.5,
    spacing: 0.04,
    hardness: 0.85,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.25,
    pressureOpacity: 0.2,
    pressureCurve: 1.0,
  },
  calligraphy: {
    id: "calligraphy",
    size: 24,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.03,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.9,
    pressureOpacity: 0.2,
    pressureCurve: 0.8,
  },
  spray: {
    id: "spray",
    size: 60,
    opacity: 0.9,
    flow: 0.25,
    spacing: 0.08,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.6,
    pressureCurve: 1.0,
  },
  "ink-pen": {
    id: "ink-pen",
    size: 6,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.03,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.95,
    pressureOpacity: 0.1,
    pressureCurve: 1.4,
  },
  "noise-grain": {
    id: "noise-grain",
    size: 44,
    opacity: 0.7,
    flow: 0.6,
    spacing: 0.12,
    hardness: 1.0,
    scatter: 2,
    rotationJitter: 1,
    pressureSize: 0.4,
    pressureOpacity: 0.6,
    pressureCurve: 1.0,
  },
  // Tranche 1 — tattoo + pro
  "tattoo-liner-3rl": {
    id: "tattoo-liner-3rl",
    size: 6,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.02,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.6,
    pressureOpacity: 0.2,
    pressureCurve: 1.2,
  },
  "tattoo-liner-9rl": {
    id: "tattoo-liner-9rl",
    size: 14,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.03,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.5,
    pressureOpacity: 0.2,
    pressureCurve: 1.1,
  },
  "tattoo-mag-7": {
    id: "tattoo-mag-7",
    size: 22,
    opacity: 0.95,
    flow: 0.85,
    spacing: 0.04,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.4,
    pressureOpacity: 0.5,
    pressureCurve: 1.0,
  },
  "tattoo-mag-13": {
    id: "tattoo-mag-13",
    size: 38,
    opacity: 0.9,
    flow: 0.8,
    spacing: 0.05,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.3,
    pressureOpacity: 0.6,
    pressureCurve: 1.0,
  },
  "tattoo-curved-mag": {
    id: "tattoo-curved-mag",
    size: 30,
    opacity: 0.92,
    flow: 0.82,
    spacing: 0.04,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.4,
    pressureOpacity: 0.5,
    pressureCurve: 1.0,
  },
  "whip-shading": {
    id: "whip-shading",
    size: 28,
    opacity: 0.9,
    flow: 0.5,
    spacing: 0.1,
    hardness: 1.0,
    scatter: 4,
    rotationJitter: 0,
    pressureSize: 0.7,
    pressureOpacity: 0.7,
    pressureCurve: 1.0,
  },
  "pepper-shading": {
    id: "pepper-shading",
    size: 40,
    opacity: 0.95,
    flow: 0.7,
    spacing: 0.18,
    hardness: 1.0,
    scatter: 8,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.5,
    pressureCurve: 1.0,
  },
  "smooth-shader": {
    id: "smooth-shader",
    size: 70,
    opacity: 0.45,
    flow: 0.5,
    spacing: 0.06,
    hardness: 0.25,
    scatter: 1,
    rotationJitter: 1,
    pressureSize: 0.6,
    pressureOpacity: 0.8,
    pressureCurve: 0.8,
  },
  "blood-spatter": {
    id: "blood-spatter",
    size: 50,
    opacity: 0.95,
    flow: 0.8,
    spacing: 0.6,
    hardness: 1.0,
    scatter: 14,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.3,
    pressureCurve: 1.0,
  },
  "watercolor-wash": {
    id: "watercolor-wash",
    size: 90,
    opacity: 0.3,
    flow: 0.35,
    spacing: 0.04,
    hardness: 0.05,
    scatter: 2,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.7,
    pressureCurve: 0.7,
  },
  "halftone-dots": {
    id: "halftone-dots",
    size: 36,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.3,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.6,
    pressureOpacity: 0.0,
    pressureCurve: 1.0,
  },
  "pencil-2b": {
    id: "pencil-2b",
    size: 14,
    opacity: 0.85,
    flow: 0.7,
    spacing: 0.04,
    hardness: 0.9,
    scatter: 1,
    rotationJitter: 1,
    pressureSize: 0.7,
    pressureOpacity: 0.8,
    pressureCurve: 1.0,
  },
  "gel-pen": {
    id: "gel-pen",
    size: 8,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.03,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.6,
    pressureOpacity: 0.1,
    pressureCurve: 1.2,
  },
  "neon-glow": {
    id: "neon-glow",
    size: 28,
    opacity: 0.85,
    flow: 0.7,
    spacing: 0.04,
    hardness: 0.4,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.4,
    pressureOpacity: 0.3,
    pressureCurve: 1.0,
  },
  chalk: {
    id: "chalk",
    size: 42,
    opacity: 0.85,
    flow: 0.6,
    spacing: 0.08,
    hardness: 0.95,
    scatter: 2,
    rotationJitter: 0,
    pressureSize: 0.5,
    pressureOpacity: 0.6,
    pressureCurve: 1.0,
  },
  // Tranche 2
  "technical-pen": {
    id: "technical-pen",
    size: 3,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.02,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.05,
    pressureOpacity: 0.0,
    pressureCurve: 1.0,
  },
  "brush-pen": {
    id: "brush-pen",
    size: 22,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.03,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.95,
    pressureOpacity: 0.2,
    pressureCurve: 1.3,
  },
  "dip-pen": {
    id: "dip-pen",
    size: 10,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.03,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.85,
    pressureOpacity: 0.2,
    pressureCurve: 1.2,
  },
  "fountain-pen": {
    id: "fountain-pen",
    size: 8,
    opacity: 1.0,
    flow: 0.95,
    spacing: 0.03,
    hardness: 0.9,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.7,
    pressureOpacity: 0.3,
    pressureCurve: 1.1,
  },
  "hb-pencil": {
    id: "hb-pencil",
    size: 10,
    opacity: 0.7,
    flow: 0.55,
    spacing: 0.04,
    hardness: 0.85,
    scatter: 1,
    rotationJitter: 1,
    pressureSize: 0.7,
    pressureOpacity: 0.85,
    pressureCurve: 1.1,
  },
  "pencil-6b": {
    id: "pencil-6b",
    size: 18,
    opacity: 0.95,
    flow: 0.8,
    spacing: 0.04,
    hardness: 0.75,
    scatter: 1,
    rotationJitter: 1,
    pressureSize: 0.6,
    pressureOpacity: 0.5,
    pressureCurve: 0.9,
  },
  "colored-pencil": {
    id: "colored-pencil",
    size: 12,
    opacity: 0.8,
    flow: 0.6,
    spacing: 0.04,
    hardness: 0.9,
    scatter: 1,
    rotationJitter: 1,
    pressureSize: 0.6,
    pressureOpacity: 0.7,
    pressureCurve: 1.0,
  },
  "conte-crayon": {
    id: "conte-crayon",
    size: 28,
    opacity: 0.85,
    flow: 0.7,
    spacing: 0.06,
    hardness: 0.8,
    scatter: 2,
    rotationJitter: 1,
    pressureSize: 0.6,
    pressureOpacity: 0.6,
    pressureCurve: 1.0,
  },
  "oil-flat": {
    id: "oil-flat",
    size: 36,
    opacity: 1.0,
    flow: 0.85,
    spacing: 0.04,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.6,
    pressureOpacity: 0.3,
    pressureCurve: 1.0,
  },
  "oil-round": {
    id: "oil-round",
    size: 30,
    opacity: 1.0,
    flow: 0.8,
    spacing: 0.04,
    hardness: 0.9,
    scatter: 1,
    rotationJitter: 0,
    pressureSize: 0.6,
    pressureOpacity: 0.3,
    pressureCurve: 1.0,
  },
  "palette-knife": {
    id: "palette-knife",
    size: 50,
    opacity: 1.0,
    flow: 0.9,
    spacing: 0.05,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.5,
    pressureOpacity: 0.2,
    pressureCurve: 1.0,
  },
  gouache: {
    id: "gouache",
    size: 32,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.04,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.4,
    pressureOpacity: 0.1,
    pressureCurve: 1.0,
  },
  "acrylic-dry": {
    id: "acrylic-dry",
    size: 34,
    opacity: 0.85,
    flow: 0.6,
    spacing: 0.05,
    hardness: 0.9,
    scatter: 2,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.6,
    pressureCurve: 1.0,
  },
  "pastel-soft": {
    id: "pastel-soft",
    size: 40,
    opacity: 0.75,
    flow: 0.55,
    spacing: 0.06,
    hardness: 0.6,
    scatter: 2,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.7,
    pressureCurve: 0.9,
  },
  "glitch-stripe": {
    id: "glitch-stripe",
    size: 36,
    opacity: 0.9,
    flow: 0.9,
    spacing: 0.5,
    hardness: 1.0,
    scatter: 6,
    rotationJitter: 0,
    pressureSize: 0.3,
    pressureOpacity: 0.0,
    pressureCurve: 1.0,
  },
  "chromatic-fringe": {
    id: "chromatic-fringe",
    size: 30,
    opacity: 0.85,
    flow: 0.85,
    spacing: 0.06,
    hardness: 0.7,
    scatter: 0,
    rotationJitter: 0,
    pressureSize: 0.4,
    pressureOpacity: 0.2,
    pressureCurve: 1.0,
  },
  "bokeh-dots": {
    id: "bokeh-dots",
    size: 46,
    opacity: 0.7,
    flow: 0.6,
    spacing: 0.5,
    hardness: 0.3,
    scatter: 10,
    rotationJitter: 1,
    pressureSize: 0.4,
    pressureOpacity: 0.4,
    pressureCurve: 1.0,
  },
  "stars-sparkle": {
    id: "stars-sparkle",
    size: 26,
    opacity: 1.0,
    flow: 0.9,
    spacing: 0.5,
    hardness: 1.0,
    scatter: 8,
    rotationJitter: 1,
    pressureSize: 0.4,
    pressureOpacity: 0.3,
    pressureCurve: 1.0,
  },
  "lightning-bolt": {
    id: "lightning-bolt",
    size: 34,
    opacity: 1.0,
    flow: 1.0,
    spacing: 0.8,
    hardness: 1.0,
    scatter: 0,
    rotationJitter: 1,
    pressureSize: 0.3,
    pressureOpacity: 0.2,
    pressureCurve: 1.0,
  },
  "smoke-puff": {
    id: "smoke-puff",
    size: 70,
    opacity: 0.35,
    flow: 0.3,
    spacing: 0.15,
    hardness: 0.1,
    scatter: 8,
    rotationJitter: 1,
    pressureSize: 0.5,
    pressureOpacity: 0.6,
    pressureCurve: 0.8,
  },
  confetti: {
    id: "confetti",
    size: 32,
    opacity: 1.0,
    flow: 0.9,
    spacing: 0.4,
    hardness: 1.0,
    scatter: 10,
    rotationJitter: 1,
    pressureSize: 0.4,
    pressureOpacity: 0.2,
    pressureCurve: 1.0,
  },
};

export const BRUSH_LABELS: Record<BrushId, string> = {
  "hard-round": "Hard Round",
  "soft-airbrush": "Soft Airbrush",
  "fine-liner": "Fine Liner",
  dotwork: "Dotwork",
  crosshatch: "Crosshatch",
  stipple: "Stipple",
  "wet-ink": "Wet Ink",
  eraser: "Eraser",
  charcoal: "Charcoal",
  marker: "Marker",
  calligraphy: "Calligraphy",
  spray: "Spray",
  "ink-pen": "Ink Pen",
  "noise-grain": "Noise Grain",
  "tattoo-liner-3rl": "Liner 3RL",
  "tattoo-liner-9rl": "Liner 9RL",
  "tattoo-mag-7": "Magnum 7",
  "tattoo-mag-13": "Magnum 13",
  "tattoo-curved-mag": "Curved Mag",
  "whip-shading": "Whip Shading",
  "pepper-shading": "Pepper Shade",
  "smooth-shader": "Smooth Shader",
  "blood-spatter": "Blood Spatter",
  "watercolor-wash": "Watercolor",
  "halftone-dots": "Halftone",
  "pencil-2b": "Pencil 2B",
  "gel-pen": "Gel Pen",
  "neon-glow": "Neon Glow",
  chalk: "Chalk",
  "technical-pen": "Technical Pen",
  "brush-pen": "Brush Pen",
  "dip-pen": "Dip Pen",
  "fountain-pen": "Fountain Pen",
  "hb-pencil": "HB Pencil",
  "pencil-6b": "Pencil 6B",
  "colored-pencil": "Colored Pencil",
  "conte-crayon": "Conté Crayon",
  "oil-flat": "Oil Flat",
  "oil-round": "Oil Round",
  "palette-knife": "Palette Knife",
  gouache: "Gouache",
  "acrylic-dry": "Acrylic Dry",
  "pastel-soft": "Soft Pastel",
  "glitch-stripe": "Glitch Stripe",
  "chromatic-fringe": "Chromatic Fringe",
  "bokeh-dots": "Bokeh",
  "stars-sparkle": "Stars",
  "lightning-bolt": "Lightning",
  "smoke-puff": "Smoke",
  confetti: "Confetti",
};

function rgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const n = parseInt(
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Build a brush stamp ImageData scaled to `radius` px. Cached by caller. */
export function buildStamp(b: BrushSettings, radius: number, angle: number): HTMLCanvasElement {
  const d = Math.max(2, Math.ceil(radius * 2));
  const c = document.createElement("canvas");
  c.width = d;
  c.height = d;
  const ctx = c.getContext("2d")!;
  const cx = d / 2,
    cy = d / 2;
  const [r, g, bl] = rgb(b.color);

  if (b.id === "dotwork") {
    const dots = 4 + Math.floor(radius / 6);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    for (let i = 0; i < dots; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * radius * 0.85;
      const dx = cx + Math.cos(a) * rr;
      const dy = cy + Math.sin(a) * rr;
      const ds = Math.max(0.6, radius * (0.12 + Math.random() * 0.18));
      ctx.beginPath();
      ctx.arc(dx, dy, ds, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }
  if (b.id === "stipple") {
    const dots = 12 + Math.floor(radius);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    for (let i = 0; i < dots; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * radius;
      const dx = cx + Math.cos(a) * rr;
      const dy = cy + Math.sin(a) * rr;
      ctx.beginPath();
      ctx.arc(dx, dy, 0.6 + Math.random() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }
  if (b.id === "crosshatch") {
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = `rgb(${r},${g},${bl})`;
    ctx.lineWidth = Math.max(0.5, radius * 0.07);
    const step = Math.max(1.5, radius * 0.22);
    for (let y = -radius; y <= radius; y += step) {
      ctx.beginPath();
      ctx.moveTo(-radius, y);
      ctx.lineTo(radius, y);
      ctx.stroke();
    }
    return c;
  }
  if (b.id === "charcoal") {
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},1)`);
    grad.addColorStop(0.6, `rgba(${r},${g},${bl},0.6)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    // grain
    const img = ctx.getImageData(0, 0, d, d);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 80;
      img.data[i + 3] = Math.max(0, Math.min(255, img.data[i + 3] + n));
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  if (b.id === "calligraphy") {
    // Flat oblique nib — ellipse rotated 45°.
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, Math.max(0.6, radius * 0.32), 0, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "marker") {
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},0.95)`);
    grad.addColorStop(0.85, `rgba(${r},${g},${bl},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "spray") {
    const dots = 18 + Math.floor(radius * 1.3);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    for (let i = 0; i < dots; i++) {
      const a = Math.random() * Math.PI * 2;
      // Bias toward outer ring for proper spray cone.
      const rr = Math.sqrt(Math.random()) * radius;
      const dx = cx + Math.cos(a) * rr;
      const dy = cy + Math.sin(a) * rr;
      ctx.globalAlpha = 0.35 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(dx, dy, 0.4 + Math.random() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  }
  if (b.id === "ink-pen") {
    // Pure hard nib — crisp solid disc, no falloff.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "noise-grain") {
    // Disc filled with high-frequency noise — perfect for tonal shading.
    ctx.fillStyle = `rgba(${r},${g},${bl},0.0)`;
    ctx.fillRect(0, 0, d, d);
    const img = ctx.createImageData(d, d);
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const dx = x - cx,
          dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = 1 - dist / radius;
        const a = Math.random() < falloff * 0.85 ? Math.floor(160 + Math.random() * 95) : 0;
        const i = (y * d + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = bl;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  // ---- Tranche 1: tattoo + pro ---------------------------------------------
  if (b.id === "tattoo-liner-3rl" || b.id === "tattoo-liner-9rl") {
    // Tight needle cluster — multiple crisp dots packed in a circle.
    const needles = b.id === "tattoo-liner-3rl" ? 3 : 9;
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const nr = radius * 0.22;
    if (needles === 3) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * nr * 1.2, cy + Math.sin(a) * nr * 1.2, nr, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, nr, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * nr * 2.2, cy + Math.sin(a) * nr * 2.2, nr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return c;
  }
  if (b.id === "tattoo-mag-7" || b.id === "tattoo-mag-13") {
    // Flat row of needles — wide stroke for shading/coloring.
    const needles = b.id === "tattoo-mag-7" ? 7 : 13;
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const nr = Math.max(0.6, radius * 0.18);
    const spread = radius * 1.6;
    for (let i = 0; i < needles; i++) {
      const t = i / (needles - 1) - 0.5;
      ctx.beginPath();
      ctx.arc(t * spread, 0, nr, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }
  if (b.id === "tattoo-curved-mag") {
    // Needles arranged along a slight arc.
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const needles = 11;
    const nr = Math.max(0.6, radius * 0.18);
    const spread = radius * 1.5;
    for (let i = 0; i < needles; i++) {
      const t = i / (needles - 1) - 0.5;
      const yOff = Math.cos(t * Math.PI) * radius * 0.25 - radius * 0.25;
      ctx.beginPath();
      ctx.arc(t * spread, yOff, nr, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }
  if (b.id === "whip-shading") {
    // Dense head + tapered tail of fading dots — classic whip pull.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const tailLen = radius * 1.8;
    const dots = 18;
    for (let i = 0; i < dots; i++) {
      const t = i / dots;
      const x = -t * tailLen + (Math.random() - 0.5) * radius * 0.3;
      const y = (Math.random() - 0.5) * radius * 0.5 * (1 - t * 0.6);
      const ds = Math.max(0.4, radius * (0.18 - t * 0.14));
      ctx.globalAlpha = 0.4 + (1 - t) * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, ds, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  }
  if (b.id === "pepper-shading") {
    // Loose pepper-grain dots scattered across disc.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const dots = 8 + Math.floor(radius * 0.5);
    for (let i = 0; i < dots; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * radius;
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * rr,
        cy + Math.sin(a) * rr,
        0.4 + Math.random() * (radius * 0.06),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  }
  if (b.id === "smooth-shader") {
    // Very soft, broad radial — flawless gradient blending.
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},0.55)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${bl},0.25)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "blood-spatter") {
    // Irregular blob cluster + satellite droplets.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    // central blob (irregular polygon)
    ctx.beginPath();
    const verts = 9;
    for (let i = 0; i <= verts; i++) {
      const a = (i / verts) * Math.PI * 2;
      const rr = radius * (0.55 + Math.random() * 0.4);
      const x = cx + Math.cos(a) * rr,
        y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // droplets
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = radius * (1.1 + Math.random() * 0.6);
      const ds = Math.max(0.6, radius * (0.05 + Math.random() * 0.12));
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, ds, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }
  if (b.id === "watercolor-wash") {
    // Multiple ring gradients for diffused wet edge.
    for (let layer = 0; layer < 3; layer++) {
      const rr = radius * (0.6 + layer * 0.25);
      const grad = ctx.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
      grad.addColorStop(0, `rgba(${r},${g},${bl},${0.18 - layer * 0.05})`);
      grad.addColorStop(0.85, `rgba(${r},${g},${bl},${0.05})`);
      grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }
  if (b.id === "halftone-dots") {
    // Single perfectly round dot — at high spacing this builds a halftone grid.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "pencil-2b") {
    // Graphite — soft elliptical core with grainy halo.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},0.85)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${bl},0.35)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    // grain dots
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * radius * 0.9;
      ctx.globalAlpha = 0.15 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.75, 0.4 + Math.random() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return c;
  }
  if (b.id === "gel-pen") {
    // Crisp disc with subtle inner highlight.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    const hg = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 0, cx, cy, radius);
    hg.addColorStop(0, "rgba(255,255,255,0.45)");
    hg.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "neon-glow") {
    // Bright white core surrounded by colored glow.
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    glow.addColorStop(0, "rgba(255,255,255,0.95)");
    glow.addColorStop(0.25, `rgba(${r},${g},${bl},0.7)`);
    glow.addColorStop(0.6, `rgba(${r},${g},${bl},0.3)`);
    glow.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "chalk") {
    // Rough, broken edge disc with internal streaks.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const img = ctx.createImageData(d, d);
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const dx = x - cx,
          dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = 1 - dist / radius;
        // streaky edge: bias by sin of x for ridges
        const ridge = 0.6 + 0.4 * Math.sin((x + y) * 0.7);
        const alpha = Math.random() < falloff * ridge ? Math.floor(180 + Math.random() * 75) : 0;
        const i = (y * d + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = bl;
        img.data[i + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  // ---- Tranche 2 -----------------------------------------------------------
  if (b.id === "technical-pen") {
    // Ultra-crisp tiny disc, perfectly uniform.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "brush-pen") {
    // Tapered ellipse aligned to stroke — bold sumi-e style.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "dip-pen") {
    // Split-nib: two parallel solid lines with tiny gap.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const gap = Math.max(0.6, radius * 0.18);
    const w = radius * 0.35;
    ctx.fillRect(-radius, -gap - w, radius * 2, w);
    ctx.fillRect(-radius, gap, radius * 2, w);
    return c;
  }
  if (b.id === "fountain-pen") {
    // Slight wet edge: solid core + faint halo.
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},1)`);
    grad.addColorStop(0.9, `rgba(${r},${g},${bl},0.6)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "hb-pencil") {
    // Light, scratchy grain — sparse dots inside disc.
    const img = ctx.createImageData(d, d);
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const dx = x - cx,
          dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const f = 1 - dist / radius;
        const a = Math.random() < f * 0.45 ? Math.floor(110 + Math.random() * 90) : 0;
        const i = (y * d + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = bl;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  if (b.id === "pencil-6b") {
    // Dark, dense graphite — heavier than 2B, slightly tilted ellipse.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},1)`);
    grad.addColorStop(0.85, `rgba(${r},${g},${bl},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "colored-pencil") {
    // Fine waxy lines — vertical streaks inside disc.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = `rgba(${r},${g},${bl},0.85)`;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 8; i++) {
      const yy = -radius + Math.random() * radius * 2;
      const len = radius * (0.7 + Math.random() * 0.3);
      ctx.beginPath();
      ctx.moveTo(-len / 2, yy);
      ctx.lineTo(len / 2, yy);
      ctx.stroke();
    }
    return c;
  }
  if (b.id === "conte-crayon") {
    // Chunky, broken-edged rectangle aligned to stroke.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(${r},${g},${bl},0.9)`;
    const w = radius * 1.8,
      h = radius * 1.1;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // erode edges with noise
    const img = ctx.getImageData(0, 0, d, d);
    for (let i = 3; i < img.data.length; i += 4) {
      if (img.data[i] > 0 && Math.random() < 0.35)
        img.data[i] = Math.floor(img.data[i] * Math.random());
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  if (b.id === "oil-flat") {
    // Flat brush with bristle striations along stroke direction.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const w = radius * 1.9,
      h = radius * 0.9;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // bristle streaks (darker)
    ctx.fillStyle = `rgba(0,0,0,0.18)`;
    const bristles = 6;
    for (let i = 0; i < bristles; i++) {
      const y = -h / 2 + (i + 0.5) * (h / bristles);
      ctx.fillRect(-w / 2, y - 0.3, w, 0.6);
    }
    return c;
  }
  if (b.id === "oil-round") {
    // Round bristle brush — radial fill with bristle ridges.
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},1)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0.5)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    // bristle highlights
    ctx.strokeStyle = `rgba(255,255,255,0.12)`;
    ctx.lineWidth = 0.5;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.9, i * radius * 0.15);
      ctx.lineTo(radius * 0.9, i * radius * 0.15);
      ctx.stroke();
    }
    return c;
  }
  if (b.id === "palette-knife") {
    // Long thin slab, crisp edges.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const w = radius * 2,
      h = Math.max(1, radius * 0.18);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    return c;
  }
  if (b.id === "gouache") {
    // Opaque, perfectly flat disc — body color paint.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "acrylic-dry") {
    // Dry brush — disc with scratched gaps.
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    const img = ctx.getImageData(0, 0, d, d);
    for (let y = 0; y < d; y++) {
      const stripe = y % 3 === 0;
      for (let x = 0; x < d; x++) {
        const i = (y * d + x) * 4;
        if (img.data[i + 3] === 0) continue;
        if (stripe && Math.random() < 0.55) img.data[i + 3] = 0;
        else if (Math.random() < 0.15) img.data[i + 3] = Math.floor(img.data[i + 3] * 0.4);
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  if (b.id === "pastel-soft") {
    // Soft, dusty disc with fine grain.
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${bl},0.85)`);
    grad.addColorStop(0.7, `rgba(${r},${g},${bl},0.4)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    const img = ctx.getImageData(0, 0, d, d);
    for (let i = 3; i < img.data.length; i += 4) {
      if (img.data[i] > 0) img.data[i] = Math.max(0, img.data[i] - Math.random() * 70);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  if (b.id === "glitch-stripe") {
    // Horizontal RGB-shifted bars.
    const h = Math.max(2, radius * 0.4);
    ctx.fillStyle = `rgba(255,0,80,0.85)`;
    ctx.fillRect(0, cy - h, d, h * 0.5);
    ctx.fillStyle = `rgba(0,255,200,0.85)`;
    ctx.fillRect(0, cy - h * 0.1, d, h * 0.5);
    ctx.fillStyle = `rgba(120,120,255,0.85)`;
    ctx.fillRect(0, cy + h * 0.4, d, h * 0.5);
    return c;
  }
  if (b.id === "chromatic-fringe") {
    // Three offset RGB discs.
    const off = Math.max(1, radius * 0.18);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,0,0,0.9)";
    ctx.beginPath();
    ctx.arc(cx - off, cy, radius * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,255,0,0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,255,0.9)";
    ctx.beginPath();
    ctx.arc(cx + off, cy, radius * 0.75, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "bokeh-dots") {
    // Soft glowing circle with bright center.
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(255,255,255,0.9)`);
    grad.addColorStop(0.3, `rgba(${r},${g},${bl},0.6)`);
    grad.addColorStop(0.9, `rgba(${r},${g},${bl},0.1)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }
  if (b.id === "stars-sparkle") {
    // 5-point star with glow.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    glow.addColorStop(0, `rgba(${r},${g},${bl},0.6)`);
    glow.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    ctx.beginPath();
    const pts = 5;
    for (let i = 0; i < pts * 2; i++) {
      const rr = i % 2 === 0 ? radius * 0.7 : radius * 0.28;
      const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * rr,
        y = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    return c;
  }
  if (b.id === "lightning-bolt") {
    // Jagged angular zigzag.
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.strokeStyle = `rgb(${r},${g},${bl})`;
    ctx.lineWidth = Math.max(1, radius * 0.18);
    ctx.lineCap = "round";
    ctx.beginPath();
    let x = -radius,
      y = 0;
    ctx.moveTo(x, y);
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      x = -radius + (i / steps) * radius * 2;
      y = (Math.random() - 0.5) * radius * 0.9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    return c;
  }
  if (b.id === "smoke-puff") {
    // Irregular cloud — 4 overlapping soft blobs.
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * radius * 0.4;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      const sr = radius * (0.55 + Math.random() * 0.35);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, sr);
      grad.addColorStop(0, `rgba(${r},${g},${bl},0.4)`);
      grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }
  if (b.id === "confetti") {
    // Cluster of small rotated rectangles in varied colors.
    const shapes = 5 + Math.floor(radius / 8);
    for (let i = 0; i < shapes; i++) {
      ctx.save();
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * radius;
      ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      ctx.rotate(Math.random() * Math.PI * 2);
      // shift hue per-shape
      const hr = (r + Math.floor(Math.random() * 80 - 40) + 256) % 256;
      const hg = (g + Math.floor(Math.random() * 80 - 40) + 256) % 256;
      const hb = (bl + Math.floor(Math.random() * 80 - 40) + 256) % 256;
      ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
      const w = radius * 0.18,
        h = radius * 0.32;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
    return c;
  }
  // Soft/hard round + fine-liner + wet-ink + eraser all use a radial falloff.
  const hardness = b.hardness;
  const grad = ctx.createRadialGradient(cx, cy, radius * hardness, cx, cy, radius);
  grad.addColorStop(0, `rgba(${r},${g},${bl},1)`);
  grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export type StrokeContext = {
  ctx: CanvasRenderingContext2D;
  brush: BrushSettings;
  /** Last anchor point used to space stamps. */
  lastStamp: { x: number; y: number } | null;
  /** Accumulated distance since last stamp. */
  carry: number;
  /** Angle (rad) used for directional brushes (crosshatch, wet-ink). */
  angle: number;
};

export function beginStroke(ctx: CanvasRenderingContext2D, brush: BrushSettings): StrokeContext {
  ctx.save();
  if (brush.id === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
  } else {
    ctx.globalCompositeOperation = "source-over";
  }
  return { ctx, brush, lastStamp: null, carry: 0, angle: 0 };
}

export function endStroke(sc: StrokeContext) {
  sc.ctx.restore();
}

/** Place stamps along the segment from previous → (x,y,pressure). */
export function strokeTo(sc: StrokeContext, x: number, y: number, pressure: number) {
  const b = sc.brush;
  // Apply per-brush pressure curve (gamma).
  const pAdj = Math.pow(Math.max(0, Math.min(1, pressure)), b.pressureCurve || 1);
  const pSize = 1 - b.pressureSize + b.pressureSize * pAdj;
  const radius = Math.max(0.5, (b.size * pSize) / 2);
  const pOp = 1 - b.pressureOpacity + b.pressureOpacity * pAdj;
  const stampAlpha = Math.min(1, b.opacity * b.flow * pOp);
  const spacing = Math.max(0.5, b.spacing * radius * 2);

  if (!sc.lastStamp) {
    sc.lastStamp = { x, y };
    paintStamp(sc, x, y, radius, stampAlpha);
    return;
  }
  const dx = x - sc.lastStamp.x;
  const dy = y - sc.lastStamp.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return;
  sc.angle = Math.atan2(dy, dx);
  let remaining = sc.carry + dist;
  const nx = dx / dist,
    ny = dy / dist;
  let px = sc.lastStamp.x - sc.carry * nx;
  let py = sc.lastStamp.y - sc.carry * ny;
  while (remaining >= spacing) {
    px += nx * spacing;
    py += ny * spacing;
    paintStamp(sc, px, py, radius, stampAlpha);
    remaining -= spacing;
  }
  sc.carry = remaining;
  sc.lastStamp = { x, y };
}

function paintStamp(sc: StrokeContext, x: number, y: number, radius: number, alpha: number) {
  const b = sc.brush;
  const jx = b.scatter ? (Math.random() - 0.5) * b.scatter : 0;
  const jy = b.scatter ? (Math.random() - 0.5) * b.scatter : 0;
  const angle =
    b.id === "crosshatch"
      ? sc.angle + Math.PI / 4
      : b.id === "calligraphy"
        ? sc.angle
        : b.rotationJitter
          ? Math.random() * Math.PI * 2
          : sc.angle;
  const stamp = buildStamp(b, radius, angle);
  sc.ctx.globalAlpha = alpha;
  sc.ctx.drawImage(stamp, x + jx - stamp.width / 2, y + jy - stamp.height / 2);
  if (b.id === "crosshatch") {
    // second cross direction at ~90° for true crosshatch
    const stamp2 = buildStamp(b, radius, angle + Math.PI / 2);
    sc.ctx.drawImage(stamp2, x + jx - stamp2.width / 2, y + jy - stamp2.height / 2);
  }
}
