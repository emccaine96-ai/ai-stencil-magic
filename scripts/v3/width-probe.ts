// Which layer sets the measured stroke width? Render with ONE layer active at a time and score its stroke width
// with the repo's own strokeWidth(). Layers are zeroed through the debug hook by rendering, then re-compositing.
import { loadPairs, presetConfig } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
import { scorePair, meanRow } from '../../src/lib/calibration/engine-metrics.js';
const pairs = await loadPairs();
const mask = (l: string) => (cfgLayers: any) => cfgLayers;
const run = (label: string, over: any) => {
  const rows: any[] = [];
  for (const p of pairs) {
    const o: any = renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any, { ...presetConfig('tattoo-clean'), inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false, anchorGateScale: 1.5, ...over });
    rows.push(scorePair(o, p.ref, { source: p.photo }));
  }
  const m: any = meanRow(rows);
  console.log(`${label.padEnd(44)} ink ${m.predCoverage.toFixed(3)}  stroke ${m.widthMedian.toFixed(2)}  p90 ${m.widthP90.toFixed(2)}  F1 ${m.f1_2.toFixed(3)}`);
};
run('all layers (gate x1.5)', {});
run('detail gain 0 (no fine veins)', { fineDetailGain: 0 });
run('anchor weight 0 (no anchors)', { anchorWeight: 0 });
run('haloProtection 0', { haloProtection: 0 });
run('localContrastBoost 0', { localContrastBoost: 0 });
run('detail 0 + localContrast 0', { fineDetailGain: 0, localContrastBoost: 0 });
