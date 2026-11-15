import { loadPairs } from './sweep-lib';
import { strokeBoth } from './stroke-metrics';
import { scorePair, meanRow } from '../../src/lib/calibration/engine-metrics.js';
const pairs = await loadPairs(); const rr: number[] = [], rs: number[] = [], sp: number[] = [];
for (const p of pairs) { const b = strokeBoth(p.ref, p.ref); rr.push(b.ref.robust); rs.push(b.ref.skelDt); sp.push((scorePair(p.ref, p.ref) as any).widthMedian); }
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`Gemini reference, mean of 9: scorePair ${avg(sp).toFixed(2)} | robust ${avg(rr).toFixed(2)} | skeleton-DT ${avg(rs).toFixed(2)}`);
