// Stage B extension: anchor gate strength, sigma 1.9 weight, sigma 1.2 scale, each with thinning off/on.
// All rows: inkBudget 0.30, cap 0.8, broad DoG off, sigma 3.2 off, nine pairs, 2 px F1.
import { loadPairs, runPair, mean, presetConfig, fmt, HEADER, type Row } from './sweep-lib';
const BASE_F1 = 0.753;
const bar = (r: Row) => ({ ink: r.ink >= 0.22 && r.ink <= 0.30, stroke: r.stroke <= 3.5, f1: r.f1 >= BASE_F1 - 0.02, specks: r.specks <= 12 });
const pairs = await loadPairs();
const base = { inkBudget: 0.30, inkFloorCap: 0.8, broadDoG: false, hessianSigma32: false };
const V: { name: string; over: Record<string, unknown> }[] = [];
const gates = (process.env.GATES || '1,1.5,2,3').split(',').map(Number);
for (const g of gates) for (const thin of [false, true]) V.push({ name: `gate x${g} | thin ${thin ? 'ON ' : 'OFF'}`, over: { ...base, anchorGateScale: g, thin } });
if (process.env.SIGMA) { for (const thin of [false, true]) { V.push({ name: `s1.9 weight 0.5 | thin ${thin ? 'ON ' : 'OFF'}`, over: { ...base, hessianSigma19Weight: 0.5, thin } }); V.push({ name: `+s1.2 scale | thin ${thin ? 'ON ' : 'OFF'}`, over: { ...base, hessianSigma12: true, thin } }); V.push({ name: `+s1.2, s1.9 w0.5 | thin ${thin ? 'ON ' : 'OFF'}`, over: { ...base, hessianSigma12: true, hessianSigma19Weight: 0.5, thin } }); } }
const presets = (process.env.PRESETS || 'tattoo-clean').split(',') as ('tattoo-clean' | 'hectograph-rich')[];
const out: string[] = [];
for (const preset of presets) {
  out.push(`\n### ${preset}\n${HEADER}`);
  for (const v of V) { const rows = pairs.map((p) => runPair(p, { ...presetConfig(preset), ...v.over })); const m = mean(rows); const miss = Object.entries(bar(m)).filter(([, ok]) => !ok).map(([k]) => k); out.push(`| ${v.name} | ${fmt(m)} |${miss.length ? ` (miss: ${miss.join(', ')})` : ' MEETS BAR'}`); }
}
console.log(out.join('\n'));
