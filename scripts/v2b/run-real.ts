import sharp from "sharp";
import { prepareV2, renderV2, exportV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
const [,, inp, outPrefix, maxEdge = "1000", expScale = "2"] = process.argv;
const img = sharp(inp).rotate(); const m = await img.metadata();
const s = Math.min(1, +maxEdge / Math.max(m.width!, m.height!));
const w = Math.round(m.width! * s), h = Math.round(m.height! * s);
const raw = await img.resize(w, h).ensureAlpha().raw().toBuffer();
const rgba = new Uint8ClampedArray(raw);
const T: Record<string, number> = {}; let t = performance.now();
const pre = prepareV2(rgba, w, h); T.prepare = performance.now() - t; t = performance.now();
const opts = tuningToOptions(DEFAULT_TUNING, pre.darkKeyed);
const r = renderV2(pre, opts); T.render = performance.now() - t; t = performance.now();
const E = +expScale;
const mask = exportV2(r, { width: Math.round(w * E), height: Math.round(h * E), minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 }); T.export = performance.now() - t;
// preview (soft) and export (binary) images
const pv = Buffer.alloc(w * h); for (let i = 0; i < w * h; i++) pv[i] = Math.round(255 * (1 - Math.min(1, r.ink[i])));
await sharp(pv, { raw: { width: w, height: h, channels: 1 } }).png().toFile(`${outPrefix}-preview.png`);
const ew = Math.round(w * E), eh = Math.round(h * E); const eb = Buffer.alloc(ew * eh); for (let i = 0; i < eb.length; i++) eb[i] = mask[i] ? 0 : 255;
await sharp(eb, { raw: { width: ew, height: eh, channels: 1 } }).png().toFile(`${outPrefix}-export.png`);
let ink = 0, nonbin = 0; for (let i = 0; i < mask.length; i++) { if (mask[i] === 255) ink++; else if (mask[i] !== 0) nonbin++; }
let pInk = 0; for (let i = 0; i < r.ink.length; i++) if (r.ink[i] > 0.5) pInk++;
let nan = 0; for (const a of [pre.tone, pre.orientation, pre.trust, r.ink, r.lines]) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) nan++;
console.log(JSON.stringify({ file: inp.split("/").pop(), analysis: `${w}x${h}`, export: `${ew}x${eh}`, darkKeyed: pre.darkKeyed, strokes: r.hatch.strokes.length,
  ms: { prepare: Math.round(T.prepare), render: Math.round(T.render), export: Math.round(T.export) },
  previewInk: +(100 * pInk / (w * h)).toFixed(1), exportInk: +(100 * ink / mask.length).toFixed(1), nonBinaryExportPx: nonbin, nonFinite: nan }));
