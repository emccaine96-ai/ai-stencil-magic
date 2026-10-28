import sharp from "sharp"; import fs from "fs";
import { prepareV2, renderV2, exportV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const photos = ["public/examples/portrait-before.jpg","public/examples/floral-back-before.jpg","public/examples/shoulder-before.jpg","public/examples/detail-before.jpg","src/assets/sample-1.jpg"];
for (const p of photos) {
  const meta = await sharp(p).metadata(); const s = Math.min(1, 800 / Math.max(meta.width!, meta.height!)); const w = Math.round(meta.width! * s), h = Math.round(meta.height! * s);
  const raw = await sharp(p).resize(w, h).ensureAlpha().raw().toBuffer();
  const t = performance.now(); const pre = prepareV2(new Uint8ClampedArray(raw), w, h); const tp = Math.round(performance.now() - t);
  const r = renderV2(pre, tuningToOptions(DEFAULT_TUNING, pre.darkKeyed));
  const m = exportV2(r, { width: w * 2, height: h * 2, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 });
  const o = Buffer.alloc(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 255;
  const name = p.split("/").pop()!.replace(/\.\w+$/, "");
  await sharp(o, { raw: { width: w * 2, height: h * 2, channels: 1 } }).png().toFile(`${out}/${name}.png`);
  fs.writeFileSync(`${out}/${name}.trust.bin`, Buffer.from(pre.trust.buffer));
  console.log(name, `${w}x${h}`, "prepare", tp + "ms", "strokes", r.hatch.strokes.length);
}
