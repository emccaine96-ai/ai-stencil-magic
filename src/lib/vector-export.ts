/**
 * Vector export — VectorStroke[] → crisp SVG and PDF (via pdf-lib if present,
 * otherwise SVG fallback).
 */
import type { VectorStroke } from "./stroke-vector";
import { fitBeziers, simplifyRDP, strokeToSvgPath } from "./stroke-vector";

export type ExportDoc = {
  width: number;
  height: number;
  strokes: VectorStroke[];
  background?: string; // hex
};

export function exportSVG(doc: ExportDoc): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.width} ${doc.height}" width="${doc.width}" height="${doc.height}">`);
  if (doc.background) parts.push(`<rect width="100%" height="100%" fill="${doc.background}"/>`);
  for (const s of doc.strokes) {
    const strokeCopy: VectorStroke = { ...s, beziers: s.beziers ?? fitBeziers(simplifyRDP(s.samples)) };
    const d = strokeToSvgPath(strokeCopy);
    if (!d) continue;
    parts.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}

/** Thermal-stencil TIFF/PNG — 1-bit, no anti-aliasing, ready for stencil printers. */
export function exportThermalPng(doc: ExportDoc): string {
  const c = document.createElement("canvas");
  c.width = doc.width; c.height = doc.height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  for (const s of doc.strokes) {
    const bez = s.beziers ?? fitBeziers(simplifyRDP(s.samples));
    if (!bez.length) continue;
    ctx.lineWidth = Math.max(1, s.size);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(bez[0].p0[0], bez[0].p0[1]);
    for (const b of bez) ctx.bezierCurveTo(b.c1[0], b.c1[1], b.c2[0], b.c2[1], b.p1[0], b.p1[1]);
    ctx.stroke();
  }
  // Hard 1-bit threshold.
  const img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    const b = v < 128 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export function downloadString(filename: string, mime: string, data: string) {
  const blob = data.startsWith("data:")
    ? null
    : new Blob([data], { type: mime });
  const url = blob ? URL.createObjectURL(blob) : data;
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  if (blob) setTimeout(() => URL.revokeObjectURL(url), 1000);
}
