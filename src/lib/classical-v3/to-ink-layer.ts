// src/lib/classical-v3/to-ink-layer.ts
/**
 * The rest of the app (stencil preview, vault export, tattooability scoring) treats a stencil as
 * "ink in the alpha channel on a transparent background". The V3 engine renders an opaque image on
 * white paper. This converts one to the other WITHOUT flattening the tones:
 *
 *   - paper-white pixels become fully transparent
 *   - everything else keeps its colour and gets an alpha proportional to how far it is from paper
 *
 * Soft lavender shading therefore stays soft (low alpha) and deep anchor lines stay solid, so the
 * multi-tone look survives and alpha-based consumers (scoreStencil: alpha > 10 means ink) still work.
 */

/** pixels whose darkness is below this are treated as bare paper (no ink at all) */
export const PAPER_CUTOFF = 0.04;

/**
 * Convert an opaque stencil on white paper into an ink layer on transparent.
 * Returns a new ImageData; the input is not modified.
 */
export function stencilToInkLayer(src: ImageData): ImageData {
  const { width, height, data } = src;
  const out = new ImageData(width, height);
  const o = out.data;

  for (let i = 0; i < data.length; i += 4) {
    const a0 = data[i + 3] / 255;
    // composite over white first, so an input that already has transparency behaves
    const r = data[i] * a0 + 255 * (1 - a0);
    const g = data[i + 1] * a0 + 255 * (1 - a0);
    const b = data[i + 2] * a0 + 255 * (1 - a0);

    // how far this pixel is from white paper, using the darkest channel (so a pale lavender still reads as ink)
    const darkness = (255 - Math.min(r, g, b)) / 255;

    if (darkness <= PAPER_CUTOFF) {
      o[i] = 255;
      o[i + 1] = 255;
      o[i + 2] = 255;
      o[i + 3] = 0;
      continue;
    }

    // un-premultiply: the colour we show at alpha `a` over white must equal the original opaque colour
    //   shown = c * a + 255 * (1 - a)  =>  c = (shown - 255 * (1 - a)) / a
    // a is chosen from darkness so strong ink is opaque and faint shading is translucent
    const a = Math.min(1, darkness / 0.55);
    const inv = 1 - a;
    o[i] = clamp8((r - 255 * inv) / a);
    o[i + 1] = clamp8((g - 255 * inv) / a);
    o[i + 2] = clamp8((b - 255 * inv) / a);
    o[i + 3] = Math.round(a * 255);
  }
  return out;
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
