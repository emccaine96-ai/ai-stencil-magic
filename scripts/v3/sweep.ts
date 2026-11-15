// Stage A sweep: inkBudget 0.30 with each combination of the broad DoG and sigma 3.2 Hessian switches,
// for the tattoo-clean and hectograph-rich presets, over the nine example pairs.
// Run: npx esbuild scripts/v3/sweep.ts --bundle --platform=node --format=esm --outfile=.sweep.mjs --external:sharp && node .sweep.mjs
// F1/recall/precision are the 2 px tolerance columns, which is what docs/HectographV32-evaluation.md reports.
import { loadPairs, runPair, mean, presetConfig, fmt, HEADER, type Row } from './sweep-lib';

const pairs = await loadPairs();
const VARIANTS: { name: string; over: Record<string, unknown> }[] = [
  { name: 'baseline (no budget, switches on)', over: { inkBudget: 1 } },
  { name: 'A1 budget 0.30, current defaults', over: { inkBudget: 0.30 } },
  { name: 'A2 budget 0.30, broad DoG off', over: { inkBudget: 0.30, broadDoG: false } },
  { name: 'A3 budget 0.30, sigma 3.2 off', over: { inkBudget: 0.30, hessianSigma32: false } },
  { name: 'A4 budget 0.30, both off', over: { inkBudget: 0.30, broadDoG: false, hessianSigma32: false } },
];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const out: string[] = [];
for (const preset of ['tattoo-clean', 'hectograph-rich'] as const) {
  out.push(`\n### ${preset}\n${HEADER}`);
  for (const v of VARIANTS) {
    if (only && !only.some((o) => v.name.startsWith(o))) continue;
    const rows: Row[] = pairs.map((p) => runPair(p, { ...presetConfig(preset), ...v.over }));
    out.push(`| ${v.name} | ${fmt(mean(rows))} |`);
    if (process.env.PERPAIR) for (const r of rows as any[]) out.push(`|  - ${r.id} | ${fmt(r)} |`);
  }
}
console.log(out.join('\n'));
console.log('\nPASS BAR: F1 >= baseline - 0.02 | ink 0.22..0.30 | stroke <= 3.5 px | specks <= 12 per 100k');
