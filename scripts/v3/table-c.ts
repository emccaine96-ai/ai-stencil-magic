// Stage C per-photo table: F1, ink, ink/refInk, stroke skeleton-DT, stroke/refStroke, specks, plus bars A, B, C. Cached.
import { pairs, refStats, scoreOne, barA, barB, barC, missList, avg, type Metrics, type Ref } from './score-cache';
const ps = await pairs();
const bestKnown = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false, strongSpeckPixels: 12, ridgeAnisotropy: 4 };
const ALL: Record<string, Record<string, unknown>> = {
  baseline: { inkBudget: 1 },
  'best-known': bestKnown,
  adaptive: { inkBudget: 0.30, adaptive: true },
};
// extra variants can be passed as JSON: EXTRA='{"name":{...cfg}}'
if (process.env.EXTRA) Object.assign(ALL, JSON.parse(process.env.EXTRA));
const names = (process.env.VARIANTS || Object.keys(ALL).join(',')).split(',');
const presets = (process.env.PRESETS || 'tattoo-clean,hectograph-rich').split(',') as ('tattoo-clean' | 'hectograph-rich')[];
const refs: Record<string, Ref> = {}; for (const p of ps) refs[p.id] = await refStats(p);
for (const preset of presets) {
  const baseF1: Record<string, number> = {}; for (const p of ps) baseF1[p.id] = (await scoreOne(p, preset, ALL.baseline)).f1;
  for (const name of names) {
    const rows: Metrics[] = []; for (const p of ps) rows.push(await scoreOne(p, preset, ALL[name]));
    console.log(`\n#### ${preset} / ${name}`);
    console.log('| Photo | F1 | Ink | ink/refInk | Stroke skel-DT | stroke/refStroke | Specks | ms | Bar C misses |\n|---|---|---|---|---|---|---|---|---|');
    let cPass = 0, bPass = 0;
    for (const m of rows) { const r = refs[m.id]; const c = missList(barC(m, r, baseF1[m.id])); if (!c.length) cPass++; if (!missList(barB(m)).length) bPass++;
      console.log(`| ${m.id} | ${m.f1.toFixed(3)} | ${m.ink.toFixed(3)} | ${(m.ink / r.refInk).toFixed(2)} | ${m.skel.toFixed(2)} | ${(m.skel / r.refSkel).toFixed(2)} | ${m.specks.toFixed(1)} | ${Math.round(m.ms)} | ${c.join(', ') || '-'} |`); }
    const mean = { f1: avg(rows.map((r) => r.f1)), ink: avg(rows.map((r) => r.ink)), stroke: avg(rows.map((r) => r.stroke)), skel: avg(rows.map((r) => r.skel)), specks: avg(rows.map((r) => r.specks)) };
    console.log(`| **MEAN** | ${mean.f1.toFixed(3)} | ${mean.ink.toFixed(3)} | ${(avg(rows.map((m) => m.ink / refs[m.id].refInk))).toFixed(2)} | ${mean.skel.toFixed(2)} | ${(avg(rows.map((m) => m.skel / refs[m.id].refSkel))).toFixed(2)} | ${mean.specks.toFixed(1)} | ${Math.round(avg(rows.map((r) => r.ms)))} | A: ${missList(barA(mean)).join(', ') || 'MEETS'} (scorePair stroke ${mean.stroke.toFixed(2)}) |`);
    console.log(`photos passing: bar B ${bPass}/9, bar C ${cPass}/9`);
  }
}
console.log('TABLE-DONE');
