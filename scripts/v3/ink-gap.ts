// Why does a 0.30 budget leave scored ink at ~0.35? Compare non-white pixels vs scorer-ink (>=90) per pair.
import { loadPairs, presetConfig } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
const pairs = await loadPairs();
let tot = { nonwhite: 0, scored: 0, n: 0 };
for (const p of pairs) {
  const o: any = renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any, { ...presetConfig('tattoo-clean'), inkBudget: 0.30 });
  let nw = 0, sc = 0; const N = o.width * o.height;
  for (let i = 0; i < o.data.length; i += 4) { const m = Math.min(o.data[i], o.data[i + 1], o.data[i + 2]); if (m < 255) nw++; if (255 - m >= 90) sc++; }
  console.log(p.id.padEnd(12), 'non-white', (nw / N).toFixed(3), ' scored-ink(>=90)', (sc / N).toFixed(3));
  tot.nonwhite += nw / N; tot.scored += sc / N; tot.n++;
}
console.log('MEAN'.padEnd(12), 'non-white', (tot.nonwhite / tot.n).toFixed(3), ' scored-ink', (tot.scored / tot.n).toFixed(3));
