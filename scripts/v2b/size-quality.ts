import sharp from "sharp"; import fs from "fs";
import { prepareV2, renderV2, exportV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
// Same FINAL output size (1600 long edge) from different ANALYSIS sizes, so quality is comparable.
const src = process.argv[2], name = process.argv[3]; const FINAL = 1600;
const meta = await sharp(src).metadata(); const aspect = meta.width! / meta.height!;
const fw = aspect >= 1 ? FINAL : Math.round(FINAL * aspect), fh = aspect >= 1 ? Math.round(FINAL / aspect) : FINAL;
fs.mkdirSync("../lab/v2b-size", { recursive: true });
for (const edge of [600, 800, 1000, 1280, 1600]) {
  const s = edge / Math.max(meta.width!, meta.height!); const w = Math.round(meta.width! * s), h = Math.round(meta.height! * s);
  const raw = await sharp(src).resize(w, h).ensureAlpha().raw().toBuffer();
  const t = performance.now(); const pre = prepareV2(new Uint8ClampedArray(raw), w, h); const r = renderV2(pre, tuningToOptions(DEFAULT_TUNING, pre.darkKeyed));
  const m = exportV2(r, { width: fw, height: fh, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 }); const ms = Math.round(performance.now() - t);
  const o = Buffer.alloc(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 255;
  await sharp(o, { raw: { width: fw, height: fh, channels: 1 } }).png().toFile(`../lab/v2b-size/${name}-a${edge}.png`);
  console.log(name, "analysis", edge, `${w}x${h}`, "total", ms + "ms", "strokes", r.hatch.strokes.length);
}
