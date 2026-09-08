/**
 * Touch-Up Studio — Ink Lab: color palette + non-destructive tint.
 * Separate, richer palette from src/lib/classical/ink-color.ts's InkColor
 * (which is the existing, working generation-time Ink Style Add-On palette
 * — left completely untouched). This one is scoped to the new Touch-Up
 * Studio screen and matches the reference screenshot's 6-swatch row plus a
 * custom picker.
 *
 * Bug fix vs. the earlier draft: must never touch alpha and must never
 * force a literal white background. This app's whole existing convention
 * (confirmed throughout the classical engine) is ink=opaque, background=
 * alpha 0 — forcing white RGB on background pixels while leaving alpha
 * untouched would silently break transparent PNG export and the overlay/
 * Tattoo-Mode view, both of which rely on alpha=0 background.
 */
export interface InkColor { id: string; name: string; hex: string; }

export const INK_COLORS: InkColor[] = [
  { id: "black",   name: "Black",   hex: "#000000" },
  { id: "red",     name: "Red",     hex: "#D62828" },
  { id: "blue",    name: "Blue",    hex: "#1D4ED8" },
  { id: "purple",  name: "Purple",  hex: "#7C3AED" },
  { id: "orange",  name: "Orange",  hex: "#EA580C" },
  { id: "magenta", name: "Magenta", hex: "#DB2777" },
];
// "custom" is handled separately via a color-wheel picker, not a fixed swatch.

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace("#", "");
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function tintInkMask(mask: ImageData, hex: string): ImageData {
  const out = new ImageData(new Uint8ClampedArray(mask.data), mask.width, mask.height);
  const { r, g, b } = hexToRgb(hex);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue; // transparent background stays transparent
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; // alpha untouched
  }
  return out;
}

/** Sample ink RGB at a pixel. Returns null on transparent/background pixels. */
export function sampleInkHex(data: ImageData, x: number, y: number): string | null {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= data.width || py >= data.height) return null;
  const i = (py * data.width + px) * 4;
  if (data.data[i + 3] === 0) return null;
  return rgbToHex(data.data[i], data.data[i + 1], data.data[i + 2]);
}
