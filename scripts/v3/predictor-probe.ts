// Which cheap image statistic predicts how much ink the engine produces? (The adaptive mapping needs a predictor.)
// For each photo: edge density (512), mean darkness, tonal spread (p98-p2), fraction of dark pixels, and the
// engine's own ink at budget OFF and at the best-known setting. Then Pearson r against each.
import { loadPairs, presetConfig } from './sweep-lib';
import { resizeLumBilinear, measureEdgeDensity, renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
import { scorePair } from '../../src/lib/calibration/engine-metrics.js';
const pairs = await loadPairs();
const lumOf = (img: any) => { const N = img.width * img.height, l = new Float32Array(N); for (let i = 0; i < N; i++) l[i] = (0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]) / 255; return l; };
const pr = (a: number[], b: number[]) => { const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb); };
const rows: any[] = [];
for (const p of pairs) {
  const lum = lumOf(p.photo); const long = Math.max(p.photo.width, p.photo.height), s = 512 / long; const nw = Math.round(p.photo.width * s), nh = Math.round(p.photo.height * s);
  const sm = resizeLumBilinear(lum, p.photo.width, p.photo.height, nw, nh);
  const dens = measureEdgeDensity(sm, nw, nh);
  const sorted = Float32Array.from(sm).sort(); const p2 = sorted[Math.floor(sorted.length * 0.02)], p98 = sorted[Math.floor(sorted.length * 0.98)];
  const dark = sm.reduce((n, v) => n + (v < 0.35 ? 1 : 0), 0) / sm.length, mean = sm.reduce((a, v) => a + v, 0) / sm.length;
  const mk = () => ({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any);
  const base: any = scorePair(renderHectographStencilV3(mk(), { ...presetConfig('tattoo-clean'), inkBudget: 1 }) as any, p.ref, { source: p.photo });
  rows.push({ id: p.id, dens, spread: p98 - p2, dark, bright: mean, inkBase: base.predCoverage, inkRef: base.refCoverage });
}
console.log('| Photo | density512 | tonal spread | dark frac | mean lum | baseline ink | Gemini ink |\n|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.id} | ${r.dens.toFixed(4)} | ${r.spread.toFixed(3)} | ${r.dark.toFixed(3)} | ${r.bright.toFixed(3)} | ${r.inkBase.toFixed(3)} | ${r.inkRef.toFixed(3)} |`);
const col = (k: string) => rows.map((r) => r[k]);
console.log('\nPearson r with the engine\'s baseline ink: density512', pr(col('dens'), col('inkBase')).toFixed(2), '| tonal spread', pr(col('spread'), col('inkBase')).toFixed(2), '| dark fraction', pr(col('dark'), col('inkBase')).toFixed(2), '| mean luminance', pr(col('bright'), col('inkBase')).toFixed(2));
console.log('Pearson r with the GEMINI reference ink:  density512', pr(col('dens'), col('inkRef')).toFixed(2), '| tonal spread', pr(col('spread'), col('inkRef')).toFixed(2), '| dark fraction', pr(col('dark'), col('inkRef')).toFixed(2));
