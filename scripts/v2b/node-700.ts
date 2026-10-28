import sharp from "sharp"; import fs from "fs";
import { prepareV2, renderV2, exportV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
// Same pipeline input as the browser: canvas drawImage downscale to 525x700, then RGBA
const meta = await sharp("public/examples/portrait-before.jpg").metadata();
const s = Math.min(1, 700 / Math.max(meta.width!, meta.height!)); const w = Math.round(meta.width! * s), h = Math.round(meta.height! * s);
const raw = await sharp("public/examples/portrait-before.jpg").resize(w, h).ensureAlpha().raw().toBuffer();
const pre = prepareV2(new Uint8ClampedArray(raw), w, h); const r = renderV2(pre, tuningToOptions(DEFAULT_TUNING, pre.darkKeyed));
const m = exportV2(r, { width: w * 2, height: h * 2, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 });
const o = Buffer.alloc(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 255;
await sharp(o, { raw: { width: w * 2, height: h * 2, channels: 1 } }).png().toFile("../lab/v2b-out/node-portrait-700.png");
console.log("node export", w * 2, h * 2);
