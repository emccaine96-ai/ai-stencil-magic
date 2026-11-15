// Why does scorePair report 1.00 px on hibiscus and poseidon? Measure ridge samples by component size.
import { loadPairs, presetConfig } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
import { normalisePair, scorePair } from '../../src/lib/calibration/engine-metrics.js';
import { strokeBoth, dropSmall } from './stroke-metrics';
const pairs = await loadPairs();
const best = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false, strongSpeckPixels: 12, ridgeAnisotropy: 4 };
const T = (p: any, cfg: any) => renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any, cfg) as any;
console.log('| Photo | scorePair width | robust (area/skel) | skeleton-DT median | comps | comps<12px | ink in comps<12px | ink in comps>=12 | skel len |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const p of pairs) {
  const out = T(p, { ...presetConfig('tattoo-clean'), ...best });
  const s: any = scorePair(out, p.ref, { source: p.photo });
  const { w, h, predMask } = normalisePair(out, p.ref) as any;
  const big = dropSmall(predMask, w, h, 12); let all = 0, bigN = 0; for (let i = 0; i < predMask.length; i++) { all += predMask[i]; bigN += big[i]; }
  const b = strokeBoth(out, p.ref);
  console.log(`| ${p.id} | ${s.widthMedian.toFixed(2)} | ${b.pred.robust.toFixed(2)} | ${b.pred.skelDt.toFixed(2)} | ${(s.components100k * w * h / 1e5).toFixed(0)} | ${(s.specks100k * w * h / 1e5).toFixed(0)} | ${((all - bigN) / all * 100).toFixed(1)}% | ${(bigN / all * 100).toFixed(1)}% | ${b.pred.skelLen} |`);
}
