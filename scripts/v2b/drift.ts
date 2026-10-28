import sharp from "sharp";
import { prepareV2, renderV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
const src = process.argv[2];
const meta = await sharp(src).metadata();
console.log("analysis | contour ink% | hatch ink% (display>0.5) | combined% | strokes | strokes/MP | xdog px of 1MP");
for (const edge of [512, 768, 1024, 1536]) {
  const s = edge / Math.max(meta.width!, meta.height!); const w = Math.round(meta.width! * s), h = Math.round(meta.height! * s);
  const raw = await sharp(src).resize(w, h).ensureAlpha().raw().toBuffer();
  const pre = prepareV2(new Uint8ClampedArray(raw), w, h); const r = renderV2(pre, tuningToOptions(DEFAULT_TUNING, pre.darkKeyed));
  let c = 0, hh = 0, a = 0; for (let i = 0; i < w * h; i++) { if (r.lines[i] > 0.5) c++; if (r.hatch.display[i] > 0.5) hh++; if (r.ink[i] > 0.5) a++; }
  const n = w * h;
  console.log(`${String(edge).padStart(8)} | ${(100*c/n).toFixed(2).padStart(11)} | ${(100*hh/n).toFixed(2).padStart(24)} | ${(100*a/n).toFixed(2).padStart(9)} | ${String(r.hatch.strokes.length).padStart(7)} | ${(r.hatch.strokes.length/(n/1e6)).toFixed(0).padStart(10)}`);
}
