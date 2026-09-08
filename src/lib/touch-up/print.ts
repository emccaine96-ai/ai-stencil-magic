/**
 * Touch-Up Studio — true-size print math. Mirror is applied only at
 * print/export time via a canvas transform, never mutating the stored
 * stencil.
 */
export const pixelsForInches = (inches: number, dpi: number) => Math.round(inches * dpi);
export const pixelsToInches = (pixels: number, dpi: number) => pixels / dpi;
export const inchesToMm = (inches: number) => inches * 25.4;

export interface PaperSize {
  id: string;
  name: string;
  widthIn: number;
  heightIn: number;
}

export const PAPER_SIZES: PaperSize[] = [
  { id: "letter", name: "Letter", widthIn: 8.5, heightIn: 11 },
  { id: "a4", name: "A4", widthIn: 8.27, heightIn: 11.69 },
  { id: "a5", name: "A5", widthIn: 5.83, heightIn: 8.27 },
  { id: "legal", name: "Legal", widthIn: 8.5, heightIn: 14 },
];

/**
 * Draws `source` onto `destCtx` mirrored horizontally, without ever
 * mutating `source` itself -- for print/export only.
 */
export function drawMirrored(
  destCtx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  w: number,
  h: number,
) {
  destCtx.save();
  destCtx.translate(w, 0);
  destCtx.scale(-1, 1);
  destCtx.drawImage(source, 0, 0, w, h);
  destCtx.restore();
}

/** Compose a paper-sized canvas with the stencil at true size (1 source pixel = 1 print pixel at the chosen DPI), centered, scaled down only if it would overflow the page. Mirror is a draw-time transform. */
export function composePrintCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  opts: { dpi: number; paper: PaperSize; mirror: boolean },
): HTMLCanvasElement {
  const paperW = pixelsForInches(opts.paper.widthIn, opts.dpi);
  const paperH = pixelsForInches(opts.paper.heightIn, opts.dpi);
  const canvas = document.createElement("canvas");
  canvas.width = paperW;
  canvas.height = paperH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, paperW, paperH);

  let dw = srcW;
  let dh = srcH;
  if (dw > paperW || dh > paperH) {
    const s = Math.min(paperW / dw, paperH / dh);
    dw = Math.round(dw * s);
    dh = Math.round(dh * s);
  }
  const x = Math.round((paperW - dw) / 2);
  const y = Math.round((paperH - dh) / 2);
  if (opts.mirror) {
    ctx.save();
    ctx.translate(x + dw, y);
    ctx.scale(-1, 1);
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(source, 0, 0, srcW, srcH, x, y, dw, dh);
  }
  return canvas;
}

export function printCanvas(canvas: HTMLCanvasElement, title = "Stencil"): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const frame = window.open(url, "_blank");
    if (!frame) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "-").toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return;
    }
    frame.addEventListener("load", () => {
      try { frame.print(); } catch { /* popup print blocked — image is still open */ }
    });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, "image/png");
}
