// src/lib/artist-pack/units.ts
/**
 * Physical-size maths for the Artist Pack. Pure functions, no DOM, so every number here can be unit-tested.
 * A stencil is a raster; its physical size is only meaningful together with a DPI. All conversions go through
 * millimetres (1 inch = 25.4 mm exactly, by definition).
 */
export const MM_PER_INCH = 25.4;

export type Unit = 'mm' | 'cm' | 'in';

/** Convert a length to millimetres. Non-finite or negative input returns NaN rather than a plausible-looking number. */
export function toMm(value: number, unit: Unit): number {
  if (!Number.isFinite(value) || value < 0) return NaN;
  return unit === 'mm' ? value : unit === 'cm' ? value * 10 : value * MM_PER_INCH;
}

export function fromMm(mm: number, unit: Unit): number {
  return unit === 'mm' ? mm : unit === 'cm' ? mm / 10 : mm / MM_PER_INCH;
}

/** Pixels needed to span `mm` at `dpi`. */
export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}

/** Millimetres spanned by `px` at `dpi`. */
export function pxToMm(px: number, dpi: number): number {
  return (px / dpi) * MM_PER_INCH;
}

export type FitMode = 'width' | 'height' | 'longest';

export interface TrueSize {
  /** Target size of the design on the body/paper, in mm (aspect ratio preserved). */
  widthMm: number;
  heightMm: number;
  /** Output raster size in pixels at the requested DPI. */
  widthPx: number;
  heightPx: number;
  /** Uniform scale factor from the source raster to the output raster. */
  scale: number;
  /** DPI the SOURCE raster would have if printed at the requested physical size. Below ~150 the print will look soft. */
  effectiveSourceDpi: number;
}

/**
 * Work out the output raster for a design printed at a stated physical size. The stated size applies to the chosen
 * edge (`fit`); the other edge follows from the aspect ratio, so the design is never stretched.
 */
export function planTrueSize(srcW: number, srcH: number, targetMm: number, fit: FitMode, dpi: number): TrueSize | null {
  if (!(srcW > 0) || !(srcH > 0) || !(targetMm > 0) || !(dpi > 0) || !Number.isFinite(targetMm + dpi + srcW + srcH)) return null;
  const edge = fit === 'width' ? srcW : fit === 'height' ? srcH : Math.max(srcW, srcH);
  const edgeMm = targetMm;
  const mmPerSrcPx = edgeMm / edge;
  const widthMm = srcW * mmPerSrcPx;
  const heightMm = srcH * mmPerSrcPx;
  const widthPx = Math.max(1, Math.round(mmToPx(widthMm, dpi)));
  const heightPx = Math.max(1, Math.round(mmToPx(heightMm, dpi)));
  return {
    widthMm,
    heightMm,
    widthPx,
    heightPx,
    scale: widthPx / srcW,
    effectiveSourceDpi: (edge / edgeMm) * MM_PER_INCH,
  };
}

/** Standard paper sizes in mm (portrait). Thermal stencil paper is usually Letter or A4. */
export const PAPER_MM: Record<string, { w: number; h: number }> = {
  letter: { w: 215.9, h: 279.4 },
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
  legal: { w: 215.9, h: 355.6 },
};

/** Does a w x h mm design fit on the named paper with a margin, in either orientation? */
export function fitsOnPaper(widthMm: number, heightMm: number, paper: keyof typeof PAPER_MM, marginMm = 6.35): { fits: boolean; rotated: boolean } {
  const p = PAPER_MM[paper];
  if (!p) return { fits: false, rotated: false };
  const aw = p.w - 2 * marginMm;
  const ah = p.h - 2 * marginMm;
  if (widthMm <= aw && heightMm <= ah) return { fits: true, rotated: false };
  if (widthMm <= ah && heightMm <= aw) return { fits: true, rotated: true };
  return { fits: false, rotated: false };
}
