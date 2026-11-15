import { pairs, refStats } from './score-cache';
const ps = await pairs();
console.log('| Photo | ref ink | ref stroke scorePair | ref stroke skeleton-DT | ref stroke area/skel | ink band (+-25%) | stroke limit (1.3x skel-DT) |\n|---|---|---|---|---|---|---|');
let a = [0, 0, 0, 0];
for (const p of ps) { const r = await refStats(p); a[0] += r.refInk; a[1] += r.refStrokeScorePair; a[2] += r.refSkel; a[3] += r.refRobust; console.log(`| ${p.id} | ${r.refInk.toFixed(3)} | ${r.refStrokeScorePair.toFixed(2)} | ${r.refSkel.toFixed(2)} | ${r.refRobust.toFixed(2)} | ${(r.refInk * 0.75).toFixed(3)} to ${(r.refInk * 1.25).toFixed(3)} | ${(r.refSkel * 1.3).toFixed(2)} |`); }
console.log(`| mean | ${(a[0] / 9).toFixed(3)} | ${(a[1] / 9).toFixed(2)} | ${(a[2] / 9).toFixed(2)} | ${(a[3] / 9).toFixed(2)} | | |`);
