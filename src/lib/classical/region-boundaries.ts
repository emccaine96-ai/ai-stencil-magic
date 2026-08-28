/**
 * Module 14 — Tone boundary extraction.
 *
 * Boundaries are pixels where two adjacent flat tone regions meet —
 * exactly what grey-wash guide lines mark.
 *
 * Part of the Shading Guide + Ink Style Add-On.
 */

export function extractToneBoundaries(toneIdx: Uint8Array, w: number, h: number): Uint8Array {
  const boundary = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = toneIdx[i];
      if ((x + 1 < w && toneIdx[i + 1] !== t) || (y + 1 < h && toneIdx[i + w] !== t)) {
        boundary[i] = 1;
      }
    }
  }
  return boundary;
}
