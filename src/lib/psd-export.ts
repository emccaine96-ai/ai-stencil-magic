/**
 * Minimal PSD writer — exports a flattened-plus-layered .psd file with
 * raster layers and per-layer blend mode + opacity. Works at small/medium
 * resolutions; for huge docs use the flatten() path.
 *
 * Spec ref: Adobe Photoshop File Formats Specification (PSD).
 */

import type { Layer, LayerBlendMode } from "./layer-system";

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

class Writer {
  parts: Uint8Array[] = [];
  push(...bytes: number[]) {
    this.parts.push(new Uint8Array(bytes));
  }
  u16(v: number) {
    this.parts.push(new Uint8Array([(v >> 8) & 0xff, v & 0xff]));
  }
  u32(v: number) {
    this.parts.push(
      new Uint8Array([(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]),
    );
  }
  i32(v: number) {
    this.u32(v >>> 0);
  }
  i16(v: number) {
    this.u16(v & 0xffff);
  }
  ascii(s: string) {
    this.parts.push(new TextEncoder().encode(s));
  }
  raw(a: Uint8Array) {
    this.parts.push(a);
  }
  pascalPad4(s: string) {
    const enc = new TextEncoder().encode(s);
    const total = enc.length + 1;
    const pad = (4 - (total % 4)) % 4;
    this.parts.push(new Uint8Array([enc.length]));
    this.parts.push(enc);
    this.parts.push(new Uint8Array(pad));
  }
  build(): Uint8Array {
    const len = this.parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

function planarRGBA(canvas: HTMLCanvasElement): {
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  a: Uint8Array;
} {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const n = canvas.width * canvas.height;
  const r = new Uint8Array(n),
    g = new Uint8Array(n),
    b = new Uint8Array(n),
    a = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    r[i] = img.data[i * 4];
    g[i] = img.data[i * 4 + 1];
    b[i] = img.data[i * 4 + 2];
    a[i] = img.data[i * 4 + 3];
  }
  return { r, g, b, a };
}

/** Build a PSD Blob. layers[0] = bottom. */
export function exportPSD(
  width: number,
  height: number,
  layers: Layer[],
  composited: HTMLCanvasElement,
): Blob {
  const w = new Writer();
  // === File Header ===
  w.ascii("8BPS");
  w.u16(1);
  w.raw(new Uint8Array(6));
  w.u16(4);
  w.u32(height);
  w.u32(width);
  w.u16(8);
  w.u16(3); // RGB, 8bpc, 4 channels (RGBA)

  // === Color Mode Data === (empty for RGB)
  w.u32(0);

  // === Image Resources === (empty)
  w.u32(0);

  // === Layer & Mask Information ===
  const rasterLayers = layers.filter((l) => l.canvas && l.kind === "raster");
  const layerInfo = new Writer();
  layerInfo.i16(rasterLayers.length);

  // Per-layer records
  const channelData: Uint8Array[] = [];
  for (const layer of rasterLayers) {
    const c = layer.canvas!;
    layerInfo.u32(0);
    layerInfo.u32(0);
    layerInfo.u32(c.height);
    layerInfo.u32(c.width);
    layerInfo.u16(4); // channels
    // channel info: id (-1=A, 0=R, 1=G, 2=B), length
    const planes = planarRGBA(c);
    const channels = [
      { id: 0, data: planes.r },
      { id: 1, data: planes.g },
      { id: 2, data: planes.b },
      { id: -1, data: planes.a },
    ];
    // Each channel: 2-byte compression (0=raw) + raw bytes
    for (const ch of channels) {
      const len = 2 + ch.data.length;
      layerInfo.i16(ch.id);
      layerInfo.u32(len);
      const buf = new Uint8Array(len);
      buf[0] = 0;
      buf[1] = 0;
      buf.set(ch.data, 2);
      channelData.push(buf);
    }
    layerInfo.ascii("8BIM");
    layerInfo.ascii(BLEND_MAP[layer.blendMode] || "norm");
    layerInfo.push(Math.round(layer.opacity * 255));
    layerInfo.push(0); // clipping
    layerInfo.push(layer.visible ? 0 : 0x02);
    layerInfo.push(0);
    // Extra data: length + (mask=0) + (blending ranges=0) + name (pascal padded to 4)
    const extra = new Writer();
    extra.u32(0); // mask
    extra.u32(0); // blending ranges
    extra.pascalPad4(layer.name);
    const extraBytes = extra.build();
    layerInfo.u32(extraBytes.length);
    layerInfo.raw(extraBytes);
  }
  // Append channel image data
  for (const buf of channelData) layerInfo.raw(buf);
  // Round to even
  const liBytes = layerInfo.build();
  const padLi = liBytes.length % 2;

  const layerAndMask = new Writer();
  // Section length (4 bytes) — wrapping: u32(len of (i16 count + records + channelData + globalMask=0))
  // Compute: i16(count) is already in liBytes; globalMask = 4 bytes 0
  const layerSectionLen = liBytes.length + padLi + 4; // +globalMask(4)=u32(0)
  layerAndMask.u32(layerSectionLen);
  // Inside: layerInfo length (4) + liBytes
  const innerLen = liBytes.length + padLi;
  // The PSD spec actually nests: [u32 layerInfoLen][layerInfo bytes][globalMaskInfoLen u32][globalMaskInfo]
  // Simplify: re-emit with proper structure
  // -- Rebuild:
  const lm = new Writer();
  lm.u32(innerLen + 4 /* trailing globalMaskInfoLen field */);
  lm.u32(innerLen);
  lm.raw(liBytes);
  if (padLi) lm.raw(new Uint8Array(padLi));
  lm.u32(0); // global mask info length

  w.raw(lm.build());

  // === Image Data Section (composited) ===
  w.u16(0); // raw
  const planes = planarRGBA(composited);
  w.raw(planes.r);
  w.raw(planes.g);
  w.raw(planes.b);
  w.raw(planes.a);

  return new Blob([w.build() as BlobPart], { type: "image/vnd.adobe.photoshop" });
}
