/**
 * Color management — sRGB ↔ Linear ↔ OKLCH conversions plus Kubelka-Munk
 * pigment mixing for the ink simulation engine.
 */

export type RGB = [number, number, number]; // 0..1
export type OKLCH = { L: number; C: number; h: number };

const SRGB_GAMMA = 2.4;

export function srgbToLinear(v: number) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, SRGB_GAMMA);
}
export function linearToSrgb(v: number) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / SRGB_GAMMA) - 0.055;
}

export function rgbToLinear([r, g, b]: RGB): RGB {
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}
export function linearToRgb([r, g, b]: RGB): RGB {
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}

/** Linear-sRGB → OKLab → OKLCH (Björn Ottosson). */
export function rgbToOklch(rgb: RGB): OKLCH {
  const [r, g, b] = rgbToLinear(rgb);
  const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
  const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
  const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_;
  const a = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_;
  const b2= 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_;
  return { L, C: Math.hypot(a, b2), h: Math.atan2(b2, a) };
}
export function oklchToRgb({ L, C, h }: OKLCH): RGB {
  const a = Math.cos(h) * C, b = Math.sin(h) * C;
  const l_ = L + 0.3963377774*a + 0.2158037573*b;
  const m_ = L - 0.1055613458*a - 0.0638541728*b;
  const s_ = L - 0.0894841775*a - 1.2914855480*b;
  const l = l_**3, m = m_**3, s = s_**3;
  return linearToRgb([
     4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
    -0.0041960863*l - 0.7034186147*m + 1.7076147010*s,
  ]);
}

export function hexToRgb(hex: string): RGB {
  const v = hex.replace("#", "");
  const n = parseInt(v.length === 3 ? v.split("").map(c => c + c).join("") : v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(rgb: RGB): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return "#" + c(rgb[0]) + c(rgb[1]) + c(rgb[2]);
}

/**
 * Kubelka-Munk pigment mixing — physically correct subtractive blend for inks.
 *   K/S = (1 - R)^2 / (2R)  →  per-channel.
 *   R_mix = 1 + K/S - √((K/S)² + 2K/S)
 * Useful for true tattoo ink color when layering or mixing.
 */
function ksFromR(R: number): number {
  R = Math.max(0.001, Math.min(0.999, R));
  return (1 - R) * (1 - R) / (2 * R);
}
function rFromKs(ks: number): number {
  return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
}

export function mixKubelkaMunk(a: RGB, b: RGB, weight = 0.5): RGB {
  const al = rgbToLinear(a), bl = rgbToLinear(b);
  const out: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const ks = ksFromR(al[i]) * (1 - weight) + ksFromR(bl[i]) * weight;
    out[i] = rFromKs(ks);
  }
  return linearToRgb(out);
}

/** Layer ink on substrate (skin) — opacity-weighted KM. */
export function layerInk(substrate: RGB, ink: RGB, opacity: number): RGB {
  return mixKubelkaMunk(substrate, ink, opacity);
}
