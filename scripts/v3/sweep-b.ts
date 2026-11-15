// Stage B sweep: {thinning off,on} x {floor cap 0.5, 0.8} x {both Hessian/DoG switches off}, inkBudget 0.30,
// presets tattoo-clean and hectograph-rich, nine pairs. F1/recall/precision are the 2 px tolerance columns.
// Extra variants (sigma 1.9 weight, fine sigma 1.2) are enabled with EXTRA=1.
import { loadPairs, runPair, mean, presetConfig, fmt, HEADER, type Row } from './sweep-lib';
const BASELINE_F1 = 0.753;
const bar = (r: Row) => ({ ink: r.ink >= 0.22 && r.ink <= 0.30, stroke: r.stroke <= 3.5, f1: r.f1 >= BASELINE_F1 - 0.02, specks: r.specks <= 12 });
const meets = (r: Row) => Object.values(bar(r)).every(Boolean);
const pairs = await loadPairs();
const base = { inkBudget: 0.30, broadDoG: false, hessianSigma32: false };
const VARIANTS: { name: string; over: Record<string, unknown> }[] = [];
for (const thin of [false, true]) for (const cap of [0.5, 0.8]) VARIANTS.push({ name: `thin ${thin ? 'ON ' : 'OFF'} | cap ${cap}`, over: { ...base, thin, inkFloorCap: cap } });
const W = process.env.THINWIDTH; if (W) for (const w of W.split(',')) for (const cap of [0.5, 0.8]) VARIANTS.push({ name: `thin ON w${w} | cap ${cap}`, over: { ...base, thin: true, thinWidth: +w, inkFloorCap: cap } });
const out: string[] = []; const detail: string[] = [];
for (const preset of ['tattoo-clean', 'hectograph-rich'] as const) {
  out.push(`\n### ${preset}\n${HEADER}`);
  for (const v of VARIANTS) {
    const rows = pairs.map((p) => runPair(p, { ...presetConfig(preset), ...v.over }));
    const m = mean(rows); const b = bar(m);
    out.push(`| ${v.name} | ${fmt(m)} |${meets(m) ? ' MEETS BAR' : ` (miss: ${Object.entries(b).filter(([, ok]) => !ok).map(([k]) => k).join(', ')})`}`);
    if (process.env.PERPAIR || meets(m)) {
      detail.push(`\n#### ${preset} / ${v.name}\n| Photo | F1 | Ink | Stroke px | Specks | Misses |\n|---|---|---|---|---|---|`);
      for (const r of rows as any[]) { const bb = bar(r); detail.push(`| ${r.id} | ${r.f1.toFixed(3)} | ${r.ink.toFixed(3)} | ${r.stroke.toFixed(2)} | ${r.specks.toFixed(1)} | ${Object.entries(bb).filter(([, ok]) => !ok).map(([k]) => k).join(', ') || '-'} |`); }
    }
  }
}
console.log(out.join('\n')); console.log(detail.join('\n'));
console.log(`\nPASS BAR: ink 0.22..0.30 | stroke <= 3.5 px | F1 >= ${(BASELINE_F1 - 0.02).toFixed(3)} (baseline ${BASELINE_F1} - 0.02) | specks <= 12 per 100k`);
