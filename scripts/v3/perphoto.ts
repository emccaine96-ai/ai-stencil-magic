import { loadPairs, presetConfig, runPair, mean, fmt, HEADER, type Row } from './sweep-lib';
const BASE_F1 = 0.753;
const bar = (r: Row) => ({ ink: r.ink >= 0.22 && r.ink <= 0.30, stroke: r.stroke <= 3.5, f1: r.f1 >= BASE_F1 - 0.02, specks: r.specks <= 12 });
const pairs = await loadPairs();
const base = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false, strongSpeckPixels: 12 };
for (const preset of ['tattoo-clean', 'hectograph-rich'] as const) for (const an of [4, 6]) {
  const rows = pairs.map((p) => runPair(p, { ...presetConfig(preset), ...base, ridgeAnisotropy: an }));
  const m = mean(rows); const mm = Object.entries(bar(m)).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(`\n#### ${preset}, anisotropy ${an}, strong-speck 12 :: MEAN ${fmt(m)} :: ${mm.length ? 'misses ' + mm.join(',') : 'MEETS BAR'}`);
  console.log('| Photo | F1 | Ink | Stroke px | Specks/100k | Misses |\n|---|---|---|---|---|---|');
  for (const r of rows as any[]) console.log(`| ${r.id} | ${r.f1.toFixed(3)} | ${r.ink.toFixed(3)} | ${r.stroke.toFixed(2)} | ${r.specks.toFixed(1)} | ${Object.entries(bar(r)).filter(([, ok]) => !ok).map(([k]) => k).join(', ') || '-'} |`);
}
