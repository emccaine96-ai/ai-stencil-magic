/**
 * PSD writer: layered Photoshop document (RGB, 8 bit) with per-layer blend mode, opacity,
 * visibility and Unicode names. Layer pixels and the merged preview are PackBits (RLE) compressed.
 *
 * Spec: Adobe Photoshop File Formats Specification. Layout used here:
 *   Header | Color Mode Data | Image Resources | Layer and Mask Information | Image Data
 *
 * Verified against psd-tools (see scripts/verify-psd.mjs).
 */

import type { Layer, LayerBlendMode } from "./layer-system";

/** Photoshop's hard limit per side for the standard (non-PSB) format. */
export const PSD_MAX_DIMENSION = 30000;

const BLEND_MAP: Record<LayerBlendMode, string> = {
  normal: "norm",
  multiply: "mul ",
  screen: "scrn",
  overlay: "over",
  darken: "dark",
  lighten: "lite",
  "color-dodge": "div ",
  "color-burn": "idiv",
  "hard-light": "hLit",
  "soft-light": "sLit",
  difference: "diff",
  exclusion: "smud",
  hue: "hue ",
  saturation: "sat ",
  color: "colr",
  luminosity: "lum ",
};

/** Growable big-endian byte buffer. */
class Writer {
  private buf = new Uint8Array(1024);
  private len = 0;
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  get length() {
    return this.len;
  }
  u8(v: number) {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }
  u16(v: number) {
    this.ensure(2);
    this.buf[this.len++] = (v >> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }
  i16(v: number) {
    this.u16(v & 0xffff);
  }
  u32(v: number) {
    this.ensure(4);
    this.buf[this.len++] = (v >>> 24) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }
  i32(v: number) {
    this.u32(v >>> 0);
  }
  ascii(s: string) {
    this.ensure(s.length);
    for (let i = 0; i < s.length; i++) this.buf[this.len++] = s.charCodeAt(i) & 0xff;
  }
  raw(a: Uint8Array) {
    this.ensure(a.length);
    this.buf.set(a, this.len);
    this.len += a.length;
  }
  zeros(n: number) {
    this.ensure(n);
    this.len += n; // buffer is zero-initialised and never reused
  }
  /** Pad with zeros until length is a multiple of `m`. */
  padTo(m: number) {
    const r = this.len % m;
    if (r) this.zeros(m - r);
  }
  bytes(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

/** Legacy Pascal string: 1-byte length + up to 255 ASCII bytes, padded so the total is a multiple of `m`. */
function pascal(w: Writer, s: string, m: number) {
  const ascii = toAsciiFallback(s).slice(0, 255);
  w.u8(ascii.length);
  w.ascii(ascii);
  const total = 1 + ascii.length;
  const pad = (m - (total % m)) % m;
  w.zeros(pad);
}

/** Printable-ASCII version of a name for the legacy field; the real name goes in the `luni` block. */
function toAsciiFallback(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x20 && c < 0x7f ? ch : "_";
  }
  return out;
}

/** Unicode string as used by `luni`: u32 UTF-16 code unit count, then big-endian code units. */
function unicodeString(w: Writer, s: string) {
  const units: number[] = [];
  for (let i = 0; i < s.length; i++) units.push(s.charCodeAt(i));
  w.u32(units.length);
  for (const u of units) w.u16(u);
}

/** PackBits-encode one scanline. */
function packBitsRow(row: Uint8Array, out: number[]) {
  const n = row.length;
  let i = 0;
  while (i < n) {
    let run = 1;
    while (i + run < n && run < 128 && row[i + run] === row[i]) run++;
    if (run > 1) {
      out.push(257 - run, row[i]); // -(run-1) as unsigned byte
      i += run;
      continue;
    }
    // literal run until the next repeat of 2+ or 128 bytes
    let start = i;
    i++;
    while (i < n && i - start < 128 && !(i + 1 < n && row[i] === row[i + 1])) i++;
    out.push(i - start - 1);
    for (let k = start; k < i; k++) out.push(row[k]);
  }
}

/** Compress one channel plane. Returns [rowByteCounts(u16 each), data]. */
function rleChannel(plane: Uint8Array, width: number, height: number): { counts: number[]; data: Uint8Array } {
  const counts: number[] = [];
  const out: number[] = [];
  for (let y = 0; y < height; y++) {
    const before = out.length;
    packBitsRow(plane.subarray(y * width, (y + 1) * width), out);
    counts.push(out.length - before);
  }
  return { counts, data: Uint8Array.from(out) };
}

type Planes = { r: Uint8Array; g: Uint8Array; b: Uint8Array; a: Uint8Array };

function planesOf(canvas: HTMLCanvasElement, w: number, h: number): Planes {
  const img = canvas.getContext("2d")!.getImageData(0, 0, w, h);
  const n = w * h;
  const r = new Uint8Array(n);
  const g = new Uint8Array(n);
  const b = new Uint8Array(n);
  const a = new Uint8Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    r[i] = d[i * 4];
    g[i] = d[i * 4 + 1];
    b[i] = d[i * 4 + 2];
    a[i] = d[i * 4 + 3];
  }
  return { r, g, b, a };
}

/** Encode one channel as a PSD RLE channel block: compression(2) + row counts + data. */
function rleBlock(plane: Uint8Array, w: number, h: number): Uint8Array {
  const { counts, data } = rleChannel(plane, w, h);
  const out = new Writer();
  out.u16(1); // RLE
  for (const c of counts) out.u16(c);
  out.raw(data);
  return out.bytes().slice();
}

export class PSDExportError extends Error {}

/**
 * Build a PSD Blob. `layers[0]` is the bottom layer.
 * Only raster layers with a canvas are written. Layer canvases larger than the document are cropped
 * to it; smaller canvases are written at their own size, positioned at the origin.
 */
export function exportPSD(
  width: number,
  height: number,
  layers: Layer[],
  composited: HTMLCanvasElement,
): Blob {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new PSDExportError(`Invalid document size ${width}x${height}`);
  }
  if (width > PSD_MAX_DIMENSION || height > PSD_MAX_DIMENSION) {
    throw new PSDExportError(
      `PSD supports at most ${PSD_MAX_DIMENSION}px per side (got ${width}x${height})`,
    );
  }

  const w = new Writer();

  // === File header ===
  w.ascii("8BPS");
  w.u16(1); // version 1 (PSD)
  w.zeros(6);
  w.u16(4); // channels in the merged image: R, G, B + transparency
  w.u32(height);
  w.u32(width);
  w.u16(8); // bits per channel
  w.u16(3); // RGB

  // === Color mode data (none for RGB) ===
  w.u32(0);

  // === Image resources (none) ===
  w.u32(0);

  // === Layer and mask information ===
  const raster = layers.filter((l) => l.kind === "raster" && l.canvas);

  const records = new Writer(); // layer records
  const pixelData = new Writer(); // channel image data, same order as records

  for (const layer of raster) {
    const c = layer.canvas!;
    const lw = Math.max(1, Math.min(c.width, width));
    const lh = Math.max(1, Math.min(c.height, height));
    const p = planesOf(c, lw, lh);

    const blocks = [
      { id: 0, data: rleBlock(p.r, lw, lh) },
      { id: 1, data: rleBlock(p.g, lw, lh) },
      { id: 2, data: rleBlock(p.b, lw, lh) },
      { id: -1, data: rleBlock(p.a, lw, lh) },
    ];

    // rectangle: top, left, bottom, right
    records.i32(0);
    records.i32(0);
    records.i32(lh);
    records.i32(lw);
    records.u16(blocks.length);
    for (const b of blocks) {
      records.i16(b.id);
      records.u32(b.data.length);
    }
    records.ascii("8BIM");
    records.ascii(BLEND_MAP[layer.blendMode] ?? "norm");
    records.u8(Math.max(0, Math.min(255, Math.round(layer.opacity * 255))));
    records.u8(layer.clipped ? 1 : 0); // 0 = base, 1 = clipped to the layer below
    records.u8(layer.visible ? 0 : 0x02); // bit 1 = hidden
    records.u8(0); // filler

    // Extra data: layer mask (none), blending ranges (none), legacy name, additional info blocks
    const extra = new Writer();
    extra.u32(0); // layer mask data
    extra.u32(0); // layer blending ranges
    pascal(extra, layer.name, 4);

    // `luni`: Unicode layer name, length padded to a multiple of 4
    const luni = new Writer();
    unicodeString(luni, layer.name);
    luni.padTo(4);
    extra.ascii("8BIM");
    extra.ascii("luni");
    extra.u32(luni.length);
    extra.raw(luni.bytes());

    records.u32(extra.length);
    records.raw(extra.bytes());

    for (const b of blocks) pixelData.raw(b.data);
  }

  // Layer info = layer count + records + channel pixel data, padded to an even length.
  // Negative count => the first alpha channel of the merged image holds real transparency.
  const layerInfo = new Writer();
  layerInfo.i16(raster.length === 0 ? 0 : -raster.length);
  layerInfo.raw(records.bytes());
  layerInfo.raw(pixelData.bytes());
  layerInfo.padTo(2);

  const layerAndMask = new Writer();
  layerAndMask.u32(layerInfo.length); // length of layer info
  layerAndMask.raw(layerInfo.bytes());
  layerAndMask.u32(0); // global layer mask info (none)

  w.u32(layerAndMask.length); // length of the whole Layer and Mask section
  w.raw(layerAndMask.bytes());

  // === Image data: merged preview, RLE. All row counts first (channel-major), then all data ===
  const m = planesOf(composited, width, height);
  const planes = [m.r, m.g, m.b, m.a].map((pl) => rleChannel(pl, width, height));
  w.u16(1); // RLE
  for (const pl of planes) for (const c of pl.counts) w.u16(c);
  for (const pl of planes) w.raw(pl.data);

  return new Blob([w.bytes() as BlobPart], { type: "image/vnd.adobe.photoshop" });
}
