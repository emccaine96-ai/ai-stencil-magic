// New options must not change default output. Compare engine defaults against explicit "off" values on all nine photos,
// and against the ORIGINAL main code with the budget disabled (the only intended default change is inkBudget 0.30).
import { loadPairs, presetConfig } from './sweep-lib';
import { renderHectographStencilV3, DEFAULT_HECTOGRAPH_V3_CONFIG } from '../../src/lib/classical-v3/hectograph-engine';
const pairs = await loadPairs();
const off = { thin: false, thinWidth: 3, anchorGateScale: 1, hessianSigma19Weight: 1, hessianSigma12: false, ridgeAnisotropy: 0.35, strongSpeckPixels: 0, inkFloorCap: 0.5, broadDoG: true, hessianSigma32: true };
let bad = 0;
for (const p of pairs) for (const preset of ['tattoo-clean', 'hectograph-rich'] as const) {
  const mk = () => ({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any);
  const a: any = renderHectographStencilV3(mk(), presetConfig(preset));
  const b: any = renderHectographStencilV3(mk(), { ...presetConfig(preset), ...off });
  const same = Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
  if (!same) { bad++; console.log('DIFF', p.id, preset); }
}
const d: any = DEFAULT_HECTOGRAPH_V3_CONFIG;
console.log(`defaults == explicit-off on ${pairs.length * 2} renders: ${bad === 0 ? 'PASS' : bad + ' DIFFER'}`);
console.log('default values:', JSON.stringify({ inkBudget: d.inkBudget, inkFloorCap: d.inkFloorCap, thin: d.thin, thinWidth: d.thinWidth, anchorGateScale: d.anchorGateScale, hessianSigma19Weight: d.hessianSigma19Weight, hessianSigma12: d.hessianSigma12, ridgeAnisotropy: d.ridgeAnisotropy, strongSpeckPixels: d.strongSpeckPixels, broadDoG: d.broadDoG, hessianSigma32: d.hessianSigma32, debugLayers: d.debugLayers, debugAnchorSource: d.debugAnchorSource }));
process.exit(bad ? 1 : 0);
