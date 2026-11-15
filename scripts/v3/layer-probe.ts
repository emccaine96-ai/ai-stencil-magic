// Which layer sets the stroke width? For each layer: share of pixels above the paper gate, before/after thinning.
import { loadPairs, presetConfig } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
const pairs = await loadPairs();
const sel = ['hibiscus', 'portrait', 'aztec'];
for (const p of pairs.filter((x) => sel.includes(x.id))) {
  for (const thin of [false, true]) {
    let L: any; renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any, { ...presetConfig('tattoo-clean'), inkBudget: 0.30, broadDoG: false, hessianSigma32: false, thin, debugLayers: (l: any) => (L = l) });
    const N = L.width * L.height; const share = (a: Float32Array, k = 1) => { let n = 0; for (let i = 0; i < N; i++) if (a[i] * k > 0.035) n++; return (n / N).toFixed(3); };
    const at = (a: Float32Array, k: number, thr: number) => { let n = 0; for (let i = 0; i < N; i++) if (a[i] * k >= thr) n++; return (n / N).toFixed(3); };
    console.log(`${p.id.padEnd(9)} thin=${String(thin).padEnd(5)} >gate: anchor ${share(L.anchorLines)} detail ${share(L.detailLines, 0.72)} pin ${share(L.coreDarkPin, 0.88)} | >=0.30 (visible ink): anchor ${at(L.anchorLines, 1, 0.3)} detail ${at(L.detailLines, 0.72, 0.3)} pin ${at(L.coreDarkPin, 0.88, 0.3)} | >=0.50: anchor ${at(L.anchorLines, 1, 0.5)} detail ${at(L.detailLines, 0.72, 0.5)} pin ${at(L.coreDarkPin, 0.88, 0.5)}`);
  }
}
