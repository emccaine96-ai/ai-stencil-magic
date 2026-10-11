/**
 * classical-v2 / session
 * The free client-side engine as a STANDALONE unit: no style presets, no provider
 * plumbing. One photo in, soft purple/black ink out.
 *
 *   const s = await createV2Session(img);        // heavy work once per photo
 *   const out = s.render(DEFAULT_TUNING);        // default = calibrated look
 *   const out2 = s.render({ ...DEFAULT_TUNING, strokeWeight: 0.4 });  // cheap re-render
 */
import { prepareV2, renderV2, type V2Prepared, type V2Result } from "./pipeline";
import { tuningToOptions, type V2Tuning } from "./tuning";

/** Same long-edge cap the standard engine applies (mobile memory ceiling). */
export const V2_MAX_EDGE = 2400;

export interface V2Output {
  dataUrl: string;
  width: number;
  height: number;
  processingTime: number;
  /** Fields the existing InkStylePanel consumes. */
  intermediate: { primaryLines: Uint8ClampedArray; toneIdx: Uint8Array; toneGray: Float32Array; width: number; height: number };
}

export interface V2RenderOptions {
  purpleTint?: boolean;
  /** Pixels where this is truthy are forced to paper (smart-erase exclusion). Length = width*height. */
  exclusion?: ArrayLike<number> | null;
}

export interface V2Session {
  width: number;
  height: number;
  render(tuning: V2Tuning, opts?: V2RenderOptions): V2Output;
}

export function v2WorkingSize(srcW: number, srcH: number) {
  const scale = Math.min(1, V2_MAX_EDGE / Math.max(srcW, srcH));
  return { w: Math.max(1, Math.round(srcW * scale)), h: Math.max(1, Math.round(srcH * scale)) };
}

export function createV2Session(img: HTMLImageElement): V2Session {
  const { w, h } = v2WorkingSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;

  const pre: V2Prepared = prepareV2(rgba, w, h);
  const toneGray = new Float32Array(w * h);
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    toneGray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }

  return {
    width: w,
    height: h,
    render(tuning, opts = {}) {
      const t0 = performance.now();
      const o = tuningToOptions(tuning, pre.ladder, pre.darkKeyed);
      const r: V2Result = renderV2(pre, o);

      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const octx = out.getContext("2d")!;
      const img2 = octx.createImageData(w, h);
      const [cr, cg, cb] = (opts.purpleTint ?? true) ? [168, 85, 247] : [0, 0, 0];
      const ex = opts.exclusion ?? null;
      const primary = new Uint8ClampedArray(w * h);
      for (let i = 0, p = 0; p < w * h; i += 4, p++) {
        const a = ex && ex[p] ? 0 : r.ink[p];
        img2.data[i] = cr;
        img2.data[i + 1] = cg;
        img2.data[i + 2] = cb;
        img2.data[i + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
        primary[p] = a > 0.5 ? 255 : 0;
      }
      octx.putImageData(img2, 0, 0);
      return {
        dataUrl: out.toDataURL("image/png"),
        width: w,
        height: h,
        processingTime: Math.round(performance.now() - t0),
        intermediate: { primaryLines: primary, toneIdx: new Uint8Array(w * h), toneGray, width: w, height: h },
      };
    },
  };
}
