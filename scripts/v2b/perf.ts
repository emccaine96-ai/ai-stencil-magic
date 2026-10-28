import sharp from "sharp";
import { prepareV2, renderV2, exportV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
const src = process.argv[2];
const rows: any[] = [];
for (const edge of [512, 1024, 1600, 2400]) {
  const meta = await sharp(src).metadata(); const s = edge / Math.max(meta.width!, meta.height!);
  const w = Math.round(meta.width! * s), h = Math.round(meta.height! * s);
  const raw = await sharp(src).resize(w, h).ensureAlpha().raw().toBuffer(); const rgba = new Uint8ClampedArray(raw);
  global.gc?.(); const m0 = process.memoryUsage();
  let t = performance.now(); const pre = prepareV2(rgba, w, h); const tp = performance.now() - t;
  t = performance.now(); const r = renderV2(pre, tuningToOptions(DEFAULT_TUNING, pre.darkKeyed)); const tr = performance.now() - t;
  t = performance.now(); const ex = exportV2(r, { width: w * 2, height: h * 2, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 }); const te = performance.now() - t;
  const m1 = process.memoryUsage();
  rows.push({ edge, mp: +(w * h / 1e6).toFixed(2), prepareMs: Math.round(tp), renderMs: Math.round(tr), exportMs: Math.round(te), totalSec: +((tp + tr + te) / 1000).toFixed(1), strokes: r.hatch.strokes.length, peakRSS_MB: Math.round(m1.rss / 1e6), heapDelta_MB: Math.round((m1.heapUsed - m0.heapUsed) / 1e6), arrayBuffersMB: Math.round(m1.arrayBuffers / 1e6), exportPx: ex.length });
}
console.table(rows);
