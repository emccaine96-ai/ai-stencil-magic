// Per photo: F1/ink/stroke/specks for the baseline (original main behaviour, budget off) vs the candidate, plus the F1 change.
import { loadPairs, presetConfig, runPair } from './sweep-lib';
const pairs = await loadPairs();
const cand = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false, strongSpeckPixels: 12, ridgeAnisotropy: 4 };
const preset = (process.env.PRESET || 'tattoo-clean') as 'tattoo-clean' | 'hectograph-rich';
console.log(`### ${preset}: baseline (budget off) -> candidate (aniso 4, cap 0.8, both switches off, strong-speck 12, budget 0.30)`);
console.log('| Photo | base F1 | cand F1 | dF1 | base ink | cand ink | base stroke | cand stroke | base specks | cand specks |\n|---|---|---|---|---|---|---|---|---|---|');
let worst = 0;
for (const p of pairs) { const b = runPair(p, { ...presetConfig(preset), inkBudget: 1 }); const c = runPair(p, { ...presetConfig(preset), ...cand }); const d = c.f1 - b.f1; worst = Math.min(worst, d);
  console.log(`| ${p.id} | ${b.f1.toFixed(3)} | ${c.f1.toFixed(3)} | ${d >= 0 ? '+' : ''}${d.toFixed(3)} | ${b.ink.toFixed(3)} | ${c.ink.toFixed(3)} | ${b.stroke.toFixed(2)} | ${c.stroke.toFixed(2)} | ${b.specks.toFixed(1)} | ${c.specks.toFixed(1)} |`); }
console.log(`\nworst single-photo F1 change: ${worst.toFixed(3)}`);
