import sharp from "sharp";
import { gaussian } from "../../src/lib/classical-v2b/filters";
import { prepareV2 } from "../../src/lib/classical-v2b/pipeline";
import { clamp, resampleBilinear } from "../../src/lib/classical-v2b/fieldops";
const src = process.argv[2], edge = +process.argv[3];
const meta = await sharp(src).metadata(); const s = edge / Math.max(meta.width!, meta.height!);
const w = Math.round(meta.width! * s), h = Math.round(meta.height! * s);
const raw = await sharp(src).resize(w, h).ensureAlpha().raw().toBuffer();
const pre = prepareV2(new Uint8ClampedArray(raw), w, h); const tone = pre.tone;
const source = gaussian(tone, w, h, 2);
const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x;
  gx[i] = -source[i-w-1] - 2*source[i-1] - source[i+w-1] + source[i-w+1] + 2*source[i+1] + source[i+w+1];
  gy[i] = -source[i-w-1] - 2*source[i-w] - source[i-w+1] + source[i+w-1] + 2*source[i+w] + source[i+w+1]; }
const trustFrom = (xx: Float32Array, xy: Float32Array, yy: Float32Array, W: number, H: number, sigma: number) => {
  const a = gaussian(xx, W, H, sigma), b = gaussian(xy, W, H, sigma), c = gaussian(yy, W, H, sigma); const t = new Float32Array(W * H);
  for (let i = 0; i < t.length; i++) { const e = a[i] + c[i]; t[i] = e > 1e-10 ? clamp(Math.hypot(a[i] - c[i], 2 * b[i]) / e, 0, 1) : 0; } return t; };
const sigma = Math.max(1, 0.012 * Math.max(w, h));
const full = (() => { const xx = new Float32Array(w*h), xy = new Float32Array(w*h), yy = new Float32Array(w*h); for (let i = 0; i < xx.length; i++) { xx[i] = gx[i]*gx[i]; xy[i] = gx[i]*gy[i]; yy[i] = gy[i]*gy[i]; } return trustFrom(xx, xy, yy, w, h, sigma); })();
const tF = (() => { const t = performance.now(); (() => { const xx = new Float32Array(w*h), xy = new Float32Array(w*h), yy = new Float32Array(w*h); for (let i = 0; i < xx.length; i++) { xx[i] = gx[i]*gx[i]; xy[i] = gx[i]*gy[i]; yy[i] = gy[i]*gy[i]; } trustFrom(xx, xy, yy, w, h, sigma); })(); return performance.now() - t; })();
console.log(`full-res trust: ${Math.round(tF)} ms (sigma ${sigma.toFixed(1)})`);
for (const f of [2, 3, 4, 6]) {
  const t0 = performance.now(); const W = Math.max(2, Math.ceil(w / f)), H = Math.max(2, Math.ceil(h / f));
  // reduce the TENSOR (box-average of gx*gx etc.), not the image: preserves orientation info
  const xx = new Float32Array(W*H), xy = new Float32Array(W*H), yy = new Float32Array(W*H), cnt = new Float32Array(W*H);
  for (let y = 0; y < h; y++) { const Y = Math.min(H-1, Math.floor(y / f)); for (let x = 0; x < w; x++) { const X = Math.min(W-1, Math.floor(x / f)); const i = y*w+x, j = Y*W+X; xx[j] += gx[i]*gx[i]; xy[j] += gx[i]*gy[i]; yy[j] += gy[i]*gy[i]; cnt[j]++; } }
  for (let j = 0; j < cnt.length; j++) { const c = cnt[j] || 1; xx[j] /= c; xy[j] /= c; yy[j] /= c; }
  const tl = trustFrom(xx, xy, yy, W, H, sigma / f); const up = resampleBilinear(tl, W, H, w, h); const ms = performance.now() - t0;
  let mae = 0, mx = 0, big = 0; for (let i = 0; i < up.length; i++) { const d = Math.abs(up[i] - full[i]); mae += d; mx = Math.max(mx, d); if (d > 0.1) big++; } mae /= up.length;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; const n = up.length; for (let i = 0; i < n; i++) { sa += up[i]; sb += full[i]; saa += up[i]*up[i]; sbb += full[i]*full[i]; sab += up[i]*full[i]; }
  const corr = (sab/n - sa/n*sb/n) / Math.sqrt((saa/n - (sa/n)**2) * (sbb/n - (sb/n)**2));
  console.log(`factor ${f}: ${Math.round(ms)} ms (${(tF/ms).toFixed(1)}x faster)  MAE ${mae.toFixed(4)}  max ${mx.toFixed(3)}  px>0.1 off: ${(100*big/n).toFixed(2)}%  corr ${corr.toFixed(4)}`);
}
