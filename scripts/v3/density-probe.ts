// Edge density of the nine photos: OLD (as the engine measures it, at the photo's own size) vs NEW (512 px long edge, bilinear).
import { loadPairs } from './sweep-lib';
import { gaussianBlurFloat, resizeLumBilinear, measureEdgeDensity } from '../../src/lib/classical-v3/hectograph-engine';
const pairs = await loadPairs();
const lumOf = (img: any) => { const N = img.width * img.height, l = new Float32Array(N); for (let i = 0; i < N; i++) l[i] = (0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]) / 255; return l; };
console.log('| Photo | size | OLD density (full) | NEW density (512) | ratio new/old | old class | ');
console.log('|---|---|---|---|---|---|');
const rows: any[] = [];
for (const p of pairs) {
  const lum = lumOf(p.photo); const oldD = measureEdgeDensity(lum, p.photo.width, p.photo.height);
  const long = Math.max(p.photo.width, p.photo.height); const s = 512 / long; const nw = Math.max(2, Math.round(p.photo.width * s)), nh = Math.max(2, Math.round(p.photo.height * s));
  const small = resizeLumBilinear(lum, p.photo.width, p.photo.height, nw, nh); const newD = measureEdgeDensity(small, nw, nh);
  const cls = oldD > 0.125 ? 'dense' : oldD < 0.072 ? 'soft' : 'mid';
  rows.push({ id: p.id, oldD, newD }); console.log(`| ${p.id} | ${p.photo.width}x${p.photo.height} | ${oldD.toFixed(4)} | ${newD.toFixed(4)} | ${(newD / oldD).toFixed(2)} | ${cls} |`);
}
const sorted = [...rows].sort((a, b) => a.newD - b.newD); console.log('\nsorted by NEW density:', sorted.map((r) => `${r.id} ${r.newD.toFixed(4)}`).join(' < '));
