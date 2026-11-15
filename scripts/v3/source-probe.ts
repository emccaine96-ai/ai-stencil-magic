import { loadPairs, presetConfig } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
const pairs = await loadPairs();
for (const p of pairs.filter((x) => ['hibiscus', 'aztec', 'portrait'].includes(x.id))) {
  let afterHess: Float32Array | null = null, afterEdges: Float32Array | null = null;
  renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any,
    { ...presetConfig('tattoo-clean'), inkBudget: 0.30, broadDoG: false, hessianSigma32: false, debugAnchorSource2: (a) => (afterHess = a), debugAnchorSource: (a) => (afterEdges = a) });
  const N = p.photo.width * p.photo.height; const c = (a: Float32Array | null, t: number) => { let n = 0; for (let i = 0; i < N; i++) if (a![i] >= t) n++; return (n / N).toFixed(3); };
  console.log(`${p.id.padEnd(9)} Hessian sigma1.9 only: >=0.3 ${c(afterHess, 0.3)}  >=0.5 ${c(afterHess, 0.5)}  | + step edges: >=0.3 ${c(afterEdges, 0.3)}  >=0.5 ${c(afterEdges, 0.5)}`);
}
