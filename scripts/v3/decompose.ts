// Layer decomposition on the REAL pipeline. For one photo: render the full output, then render again with each source
// left out INSIDE the engine (debugDropLayer), so the colour ramp, floor, budget and speck removal all apply exactly.
// Also reports each layer's own coverage and stroke from the debugLayers hook. Scored with the same masks as scorePair.
import { pairs } from './score-cache';
import { presetConfig } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
import { scorePair, normalisePair } from '../../src/lib/calibration/engine-metrics.js';
import { robustStroke } from './stroke-metrics';
const ids = (process.env.PHOTOS || 'baby').split(',');
const preset = (process.env.PRESET || 'tattoo-clean') as 'tattoo-clean' | 'hectograph-rich';
const over = process.env.CFG ? JSON.parse(process.env.CFG) : { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false, strongSpeckPixels: 12, ridgeAnisotropy: 4 };
const ps = await pairs();
const render = (p: any, extra: any) => renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any, { ...presetConfig(preset), ...over, ...extra }) as any;
const measure = (out: any, p: any) => { const s: any = scorePair(out, p.ref, { source: p.photo }); const { w, h, predMask } = normalisePair(out, p.ref) as any; return { ink: s.predCoverage, f1: s.f1_2, spSP: s.widthMedian, skel: robustStroke(predMask, w, h).skelDt, robust: robustStroke(predMask, w, h).robust, specks: s.specks100k }; };
for (const id of ids) {
  const p = ps.find((x) => x.id === id)!;
  let L: any = null; const full = measure(render(p, { debugLayers: (l: any) => (L = l) }), p);
  const N = L.width * L.height; const THR = 90 / 255;
  const own = (v: Float32Array, k: number) => { const m = new Uint8Array(N); let n = 0; for (let i = 0; i < N; i++) if (v[i] * k >= THR) { m[i] = 1; n++; } const r = robustStroke(m, L.width, L.height); return { cov: n / N, skel: r.skelDt }; };
  const boost = new Float32Array(N); for (let i = 0; i < N; i++) boost[i] = Math.min(L.boostCap, L.anchorLines[i] * 0.25 + L.coreDarkPin[i] * 0.88 * 0.2);
  const ownOf: Record<string, { cov: number; skel: number }> = { anchor: own(L.anchorLines, 1), detail: own(L.detailLines, 0.72), pin: own(L.coreDarkPin, 0.88), shading: own(L.smoothShading, 0.52), boost: own(boost, 1) };
  console.log(`\n### ${id} (${preset}) ${L.width}x${L.height}   FULL: ink ${full.ink.toFixed(3)}  F1 ${full.f1.toFixed(3)}  stroke scorePair ${full.spSP.toFixed(2)}  skel-DT ${full.skel.toFixed(2)}  area/skel ${full.robust.toFixed(2)}  specks ${full.specks.toFixed(1)}`);
  console.log('| Layer | own coverage | own skel-DT | final ink without it | d ink | final skel-DT without it | d skel-DT | final area/skel without it | d F1 |\n|---|---|---|---|---|---|---|---|---|');
  for (const k of ['anchor', 'detail', 'pin', 'shading', 'boost'] as const) {
    const m = measure(render(p, { debugDropLayer: k }), p); const o = ownOf[k]; const sg = (v: number, d = 3) => (v >= 0 ? '+' : '') + v.toFixed(d);
    console.log(`| ${k} | ${o.cov.toFixed(3)} | ${o.skel.toFixed(2)} | ${m.ink.toFixed(3)} | ${sg(m.ink - full.ink)} | ${m.skel.toFixed(2)} | ${sg(m.skel - full.skel, 2)} | ${m.robust.toFixed(2)} | ${sg(m.f1 - full.f1)} |`);
  }
}
console.log('DECOMP-DONE');
