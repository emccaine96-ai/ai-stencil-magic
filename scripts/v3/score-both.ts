// Re-score rows with BOTH stroke measures. Mean over the nine pairs, plus the Gemini reference's own values.
import { loadPairs, presetConfig, runPair, mean } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
import { strokeBoth } from './stroke-metrics';
const pairs = await loadPairs();
const best = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false, strongSpeckPixels: 12, ridgeAnisotropy: 4 };
const rows: [string, any][] = [['baseline (original main, budget off)', { inkBudget: 1 }], ['best-known (budget .30, cap .8, aniso 4, speck 12, DoG+s3.2 off)', best]];
console.log('| Preset | Row | F1 | Ink | Stroke scorePair | Stroke robust (area/skel) | Stroke skeleton-DT | Specks | ms |\n|---|---|---|---|---|---|---|---|---|');
const ONLY = process.env.ONLY; // e.g. 'hectograph-rich:best' to run a single row
for (const preset of ['tattoo-clean', 'hectograph-rich'] as const) for (const [name, over] of rows) {
  if (ONLY && !(ONLY === `${preset}:${name.startsWith('best') ? 'best' : 'base'}`)) continue;
  const rs: any[] = []; const rob: number[] = [], sk: number[] = [];
  for (const p of pairs) { const r = runPair(p, { ...presetConfig(preset), ...over }); rs.push(r); const out: any = renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any, { ...presetConfig(preset), ...over }); const b = strokeBoth(out, p.ref); rob.push(b.pred.robust); sk.push(b.pred.skelDt); }
  const m: any = mean(rs); const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`| ${preset} | ${name} | ${m.f1.toFixed(3)} | ${m.ink.toFixed(3)} | ${m.stroke.toFixed(2)} | ${avg(rob).toFixed(2)} | ${avg(sk).toFixed(2)} | ${m.specks.toFixed(1)} | ${Math.round(m.ms)} |`);
}
if (ONLY) process.exit(0);
// Gemini reference, both measures
const rr: number[] = [], rs2: number[] = [];
for (const p of pairs) { const b = strokeBoth(p.ref, p.ref); rr.push(b.ref.robust); rs2.push(b.ref.skelDt); }
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\nGemini reference (mean of 9): robust ${avg(rr).toFixed(2)} px, skeleton-DT ${avg(rs2).toFixed(2)} px (scorePair says 2.387 in the evaluation doc)`);
