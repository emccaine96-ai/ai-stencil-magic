import { jsPDF } from "jspdf";

export type ExportFormat = "png" | "png-transparent" | "jpg" | "pdf" | "svg";

export interface ExportOptions {
  format: ExportFormat;
  filename: string;
  quality?: number; // jpg
  bgColor?: string; // png/jpg
}

export async function exportCanvas(canvas: HTMLCanvasElement, opts: ExportOptions) {
  const name = sanitize(opts.filename || "stencil");
  switch (opts.format) {
    case "png": {
      const c = withBg(canvas, opts.bgColor ?? "#ffffff");
      download(c.toDataURL("image/png"), `${name}.png`);
      return;
    }
    case "png-transparent": {
      download(canvas.toDataURL("image/png"), `${name}.png`);
      return;
    }
    case "jpg": {
      const c = withBg(canvas, opts.bgColor ?? "#ffffff");
      download(c.toDataURL("image/jpeg", opts.quality ?? 0.92), `${name}.jpg`);
      return;
    }
    case "pdf": {
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
        unit: "pt",
        format: [canvas.width, canvas.height],
      });
      const c = withBg(canvas, opts.bgColor ?? "#ffffff");
      pdf.addImage(c.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, canvas.width, canvas.height);
      pdf.save(`${name}.pdf`);
      return;
    }
    case "svg": {
      const data = canvas.toDataURL("image/png");
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image href="${data}" width="${canvas.width}" height="${canvas.height}" />
</svg>`;
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      download(url, `${name}.svg`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
  }
}

/* Tiled print at true stencil size */
export interface TilePrintOptions {
  filename: string;
  pageSize: "a4" | "letter";
  orientation: "portrait" | "landscape";
  marginIn: number; // inches
  targetWidthIn: number; // physical width of the stencil (inches)
  overlapIn: number; // overlap between tiles (inches)
  crosshairs: boolean;
}

const PAGE_PT: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export async function exportTiledPrint(canvas: HTMLCanvasElement, o: TilePrintOptions) {
  const [pw, ph] =
    o.orientation === "landscape"
      ? [PAGE_PT[o.pageSize][1], PAGE_PT[o.pageSize][0]]
      : PAGE_PT[o.pageSize];
  const pdf = new jsPDF({ orientation: o.orientation, unit: "pt", format: [pw, ph] });

  const margin = o.marginIn * 72;
  const overlap = o.overlapIn * 72;
  const printableW = pw - margin * 2;
  const printableH = ph - margin * 2;

  const targetWpt = o.targetWidthIn * 72;
  const scale = targetWpt / canvas.width;
  const targetHpt = canvas.height * scale;

  const stepX = printableW - overlap;
  const stepY = printableH - overlap;
  const cols = Math.max(1, Math.ceil((targetWpt - overlap) / stepX));
  const rows = Math.max(1, Math.ceil((targetHpt - overlap) / stepY));

  const fullDataUrl = canvas.toDataURL("image/jpeg", 0.95);
  // Pre-render to a high-res offscreen sized in points to slice from
  const full = document.createElement("canvas");
  full.width = Math.round(targetWpt * 2);
  full.height = Math.round(targetHpt * 2);
  await new Promise<void>((res) => {
    const img = new Image();
    img.onload = () => {
      const ctx = full.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, full.width, full.height);
      ctx.drawImage(img, 0, 0, full.width, full.height);
      res();
    };
    img.src = fullDataUrl;
  });

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r || c) pdf.addPage();
      const srcX = ((c * stepX) / targetWpt) * full.width;
      const srcY = ((r * stepY) / targetHpt) * full.height;
      const srcW = (printableW / targetWpt) * full.width;
      const srcH = (printableH / targetHpt) * full.height;
      const tile = document.createElement("canvas");
      tile.width = Math.max(1, Math.round(srcW));
      tile.height = Math.max(1, Math.round(srcH));
      const tctx = tile.getContext("2d")!;
      tctx.fillStyle = "#fff";
      tctx.fillRect(0, 0, tile.width, tile.height);
      tctx.drawImage(full, -srcX, -srcY);
      const drawW = Math.min(printableW, targetWpt - c * stepX);
      const drawH = Math.min(printableH, targetHpt - r * stepY);
      pdf.addImage(tile.toDataURL("image/jpeg", 0.9), "JPEG", margin, margin, drawW, drawH);

      if (o.crosshairs) {
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.5);
        // outer rect
        pdf.rect(margin, margin, drawW, drawH);
        // crop marks
        const mk = 12;
        pdf.line(margin - mk, margin, margin + mk, margin);
        pdf.line(margin, margin - mk, margin, margin + mk);
        pdf.line(margin + drawW - mk, margin, margin + drawW + mk, margin);
        pdf.line(margin + drawW, margin - mk, margin + drawW, margin + mk);
        pdf.line(margin - mk, margin + drawH, margin + mk, margin + drawH);
        pdf.line(margin, margin + drawH - mk, margin, margin + drawH + mk);
        pdf.line(margin + drawW - mk, margin + drawH, margin + drawW + mk, margin + drawH);
        pdf.line(margin + drawW, margin + drawH - mk, margin + drawW, margin + drawH + mk);
      }
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(
        `Tile ${r + 1}-${c + 1}  ·  ${cols}×${rows}  ·  ${o.targetWidthIn}" wide`,
        margin,
        ph - margin / 2,
      );
    }
  }
  pdf.save(`${sanitize(o.filename)}-tiled.pdf`);
}

function withBg(src: HTMLCanvasElement, color: string) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
}
function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function sanitize(n: string) {
  return n.replace(/[^a-z0-9\-_]+/gi, "_").slice(0, 80) || "stencil";
}
