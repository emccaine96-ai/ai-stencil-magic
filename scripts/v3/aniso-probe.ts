import { loadPairs, presetConfig, runPair, mean, fmt, HEADER } from './sweep-lib';
const pairs = await loadPairs();
const base = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false };
console.log(HEADER);
for (const [name, over] of [
  ['aniso 0.35 (default) gate x1.5', { anchorGateScale: 1.5 }],
  ['aniso 0.8  gate x1.5', { anchorGateScale: 1.5, ridgeAnisotropy: 0.8 }],
  ['aniso 1.5  gate x1.5', { anchorGateScale: 1.5, ridgeAnisotropy: 1.5 }],
  ['aniso 3.0  gate x1.5', { anchorGateScale: 1.5, ridgeAnisotropy: 3 }],
  ['aniso 1.5  gate x1', { ridgeAnisotropy: 1.5 }],
  ['aniso 3.0  gate x1', { ridgeAnisotropy: 3 }],
] as [string, any][]) { const m = mean(pairs.map((p) => runPair(p, { ...presetConfig('tattoo-clean'), ...base, ...over }))); console.log(`| ${name} | ${fmt(m)} |`); }
