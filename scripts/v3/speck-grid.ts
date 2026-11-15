import { loadPairs, presetConfig, runPair, mean, fmt, HEADER, type Row } from './sweep-lib';
const BASE_F1 = 0.753;
const bar = (r: Row) => ({ ink: r.ink >= 0.22 && r.ink <= 0.30, stroke: r.stroke <= 3.5, f1: r.f1 >= BASE_F1 - 0.02, specks: r.specks <= 12 });
const pairs = await loadPairs();
const preset = (process.env.PRESET || 'tattoo-clean') as 'tattoo-clean' | 'hectograph-rich';
const base = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false };
const rows: [string, any][] = [];
for (const an of [4, 6]) for (const sp of [0, 12]) rows.push([`aniso ${an} | strong-speck ${sp || 'off'}`, { ridgeAnisotropy: an, strongSpeckPixels: sp }]);
console.log(`### ${preset}\n` + HEADER);
for (const [name, over] of rows) { const m = mean(pairs.map((p) => runPair(p, { ...presetConfig(preset), ...base, ...over }))); const miss = Object.entries(bar(m)).filter(([, ok]) => !ok).map(([k]) => k); console.log(`| ${name} | ${fmt(m)} |${miss.length ? ` (miss: ${miss.join(', ')})` : ' MEETS BAR'}`); }
