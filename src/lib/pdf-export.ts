/**
 * Minimal PDF writer — single-page PDF wrapping a JPEG/PNG image. Used for
 * print-ready stencil delivery (no anti-alias bleed at 1:1 scale).
 */

function num(n: number) { return Math.round(n * 1000) / 1000; }

async function blobToBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

export async function exportPDF(canvas: HTMLCanvasElement, opts: {
  dpi?: number;
  title?: string;
  author?: string;
} = {}): Promise<Blob> {
  const dpi = opts.dpi ?? 300;
  const wPt = (canvas.width / dpi) * 72;
  const hPt = (canvas.height / dpi) * 72;
  const jpegBlob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.95)!);
  const img = await blobToBytes(jpegBlob);

  const chunks: Uint8Array[] = [];
  const enc = new TextEncoder();
  const offsets: number[] = [];
  let offset = 0;
  const write = (s: string | Uint8Array) => {
    const buf = typeof s === "string" ? enc.encode(s) : s;
    chunks.push(buf); offset += buf.length;
  };
  const obj = (id: number, body: string, extra?: Uint8Array) => {
    offsets[id] = offset;
    write(`${id} 0 obj\n${body}\n`);
    if (extra) { write(extra); write("\n"); }
    write("endobj\n");
  };

  write("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(wPt)} ${num(hPt)}] /Resources << /XObject << /Im0 5 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 4 0 R >>`);
  const stream = `q\n${num(wPt)} 0 0 ${num(hPt)} 0 0 cm\n/Im0 Do\nQ`;
  obj(4, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const imgHeader = `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`;
  offsets[5] = offset;
  write(`5 0 obj\n${imgHeader}`);
  write(img);
  write("\nendstream\nendobj\n");

  const info = `<< /Title (${opts.title ?? "PrimalCanvas Stencil"}) /Author (${opts.author ?? "PrimalCanvas 2.0"}) /Producer (PrimalCanvas) >>`;
  obj(6, info);

  const xrefOffset = offset;
  write(`xref\n0 7\n0000000000 65535 f \n`);
  for (let i = 1; i <= 6; i++) {
    write(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  write(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
