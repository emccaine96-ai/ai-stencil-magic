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
  | "noise-grain";

export type BrushSettings = {
  id: BrushId;
  size: number;        // px
  opacity: number;     // 0..1
  flow: number;        // 0..1 — per-stamp alpha
  spacing: number;     // fraction of size, 0.02..3
  hardness: number;    // 0..1
  scatter: number;     // px jitter
  rotationJitter: number; // 0..1
  pressureSize: number;   // 0..1 — how much pressure scales size
  pressureOpacity: number; // 0..1
  /** Gamma applied to raw pressure: <1 boosts light touch, >1 demands force. */
  pressureCurve: number;
  color: string;          // hex
};

export const DEFAULTS: Record<BrushId, Omit<BrushSettings, "color">> = {
  "hard-round":   { id: "hard-round",   size: 18, opacity: 1.0, flow: 1.0, spacing: 0.05, hardness: 0.95, scatter: 0, rotationJitter: 0, pressureSize: 0.85, pressureOpacity: 0.3, pressureCurve: 1.0 },
  "soft-airbrush":{ id: "soft-airbrush",size: 80, opacity: 0.35,flow: 0.4, spacing: 0.05, hardness: 0.1,  scatter: 0, rotationJitter: 0, pressureSize: 0.6,  pressureOpacity: 0.9, pressureCurve: 0.7 },
  "fine-liner":   { id: "fine-liner",   size: 4,  opacity: 1.0, flow: 1.0, spacing: 0.04, hardness: 1.0,  scatter: 0, rotationJitter: 0, pressureSize: 0.15, pressureOpacity: 0.9, pressureCurve: 1.0 },
  "dotwork":      { id: "dotwork",      size: 22, opacity: 1.0, flow: 1.0, spacing: 0.4,  hardness: 1.0,  scatter: 4, rotationJitter: 1, pressureSize: 0.5,  pressureOpacity: 0.4, pressureCurve: 1.0 },
  "crosshatch":   { id: "crosshatch",   size: 28, opacity: 0.9, flow: 0.9, spacing: 0.2,  hardness: 1.0,  scatter: 0, rotationJitter: 0, pressureSize: 0.4,  pressureOpacity: 0.5, pressureCurve: 1.0 },
  "stipple":      { id: "stipple",      size: 30, opacity: 0.9, flow: 0.6, spacing: 0.15, hardness: 1.0,  scatter: 6, rotationJitter: 1, pressureSize: 0.4,  pressureOpacity: 0.6, pressureCurve: 1.0 },
  "wet-ink":      { id: "wet-ink",      size: 30, opacity: 1.0, flow: 0.7, spacing: 0.03, hardness: 0.6,  scatter: 0, rotationJitter: 0, pressureSize: 0.7,  pressureOpacity: 0.3, pressureCurve: 1.2 },
  "eraser":       { id: "eraser",       size: 32, opacity: 1.0, flow: 1.0, spacing: 0.05, hardness: 0.8,  scatter: 0, rotationJitter: 0, pressureSize: 0.8,  pressureOpacity: 0.5, pressureCurve: 1.0 },
  "charcoal":     { id: "charcoal",     size: 36, opacity: 0.85,flow: 0.7, spacing: 0.08, hardness: 0.7,  scatter: 3, rotationJitter: 1, pressureSize: 0.6,  pressureOpacity: 0.7, pressureCurve: 1.0 },
  "marker":       { id: "marker",       size: 26, opacity: 0.55,flow: 0.5, spacing: 0.04, hardness: 0.85, scatter: 0, rotationJitter: 0, pressureSize: 0.25, pressureOpacity: 0.2, pressureCurve: 1.0 },
  "calligraphy":  { id: "calligraphy",  size: 24, opacity: 1.0, flow: 1.0, spacing: 0.03, hardness: 1.0,  scatter: 0, rotationJitter: 0, pressureSize: 0.9,  pressureOpacity: 0.2, pressureCurve: 0.8 },
  "spray":        { id: "spray",        size: 60, opacity: 0.9, flow: 0.25,spacing: 0.08, hardness: 1.0,  scatter: 0, rotationJitter: 1, pressureSize: 0.5,  pressureOpacity: 0.6, pressureCurve: 1.0 },
  "ink-pen":      { id: "ink-pen",      size: 6,  opacity: 1.0, flow: 1.0, spacing: 0.03, hardness: 1.0,  scatter: 0, rotationJitter: 0, pressureSize: 0.95, pressureOpacity: 0.1, pressureCurve: 1.4 },
  "noise-grain":  { id: "noise-grain",  size: 44, opacity: 0.7, flow: 0.6, spacing: 0.12, hardness: 1.0,  scatter: 2, rotationJitter: 1, pressureSize: 0.4,  pressureOpacity: 0.6, pressureCurve: 1.0 },
};

export const BRUSH_LABELS: Record<BrushId, string> = {
  "hard-round": "Hard Round",
  "soft-airbrush": "Soft Airbrush",
  "fine-liner": "Fine Liner",
  "dotwork": "Dotwork",
  "crosshatch": "Crosshatch",
  "stipple": "Stipple",
  "wet-ink": "Wet Ink",
  "eraser": "Eraser",
  "charcoal": "Charcoal",
  "marker": "Marker",
  "calligraphy": "Calligraphy",
  "spray": "Spray",
  "ink-pen": "Ink Pen",
  "noise-grain": "Noise Grain",
};

function rgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  const n = parseInt(v.length === 3 ? v.split("").map(c => c + c).join("") : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Build a brush stamp ImageData scaled to `radius` px. Cached by caller. */
export function buildStamp(b: BrushSettings, radius: number, angle: number): HTMLCanvasElement {
  const d = Math.max(2, Math.ceil(radius * 2));
  const c = document.createElement("canvas");
  c.width = d; c.height = d;
  const ctx = c.getContext("2d")!;
  const cx = d / 2, cy = d / 2;
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
        const dx = x - cx, dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = 1 - dist / radius;
        const a = Math.random() < falloff * 0.85 ? Math.floor(160 + Math.random() * 95) : 0;
        const i = (y * d + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bl; img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
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
  const nx = dx / dist, ny = dy / dist;
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
  const angle = b.id === "crosshatch" ? sc.angle + Math.PI / 4 :
                b.id === "calligraphy" ? sc.angle :
                b.rotationJitter ? Math.random() * Math.PI * 2 :
                sc.angle;
  const stamp = buildStamp(b, radius, angle);
  sc.ctx.globalAlpha = alpha;
  sc.ctx.drawImage(stamp, x + jx - stamp.width / 2, y + jy - stamp.height / 2);
  if (b.id === "crosshatch") {
    // second cross direction at ~90° for true crosshatch
    const stamp2 = buildStamp(b, radius, angle + Math.PI / 2);
    sc.ctx.drawImage(stamp2, x + jx - stamp2.width / 2, y + jy - stamp2.height / 2);
  }
}