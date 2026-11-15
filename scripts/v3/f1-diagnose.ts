// Which harness settings reproduce the evaluation doc (v32-clean: F1 0.753, recall 0.826, precision 0.740)?
// Runs ORIGINAL main code, preset tattoo-clean, no budget exists. Varies tolerance, input size, ink threshold.
import { load, PAIRS, presetConfig } from './sweep-lib';
import { scorePair, meanRow } from '../../src/lib/calibration/engine-metrics.js';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const find = (id: string, k: string) => { for (const e of ['webp', 'jpg', 'png']) { const p = join(process.cwd(), 'public/examples', `${id}-${k}.${e}`); try { readFileSync(p); return p; } catch {} } throw new Error(id); };
const cfg = presetConfig('tattoo-clean');
const sizes: [string, number | undefined][] = [['1024', 1024], ['1280', 1280], ['full', undefined]];
console.log('input | thr | f1@1px recall@1 prec@1 | f1@2px recall@2 prec@2 | ink stroke');
for (const [label, edge] of sizes) {
  const rendered: { id: string; out: any; photo: any; ref: any }[] = [];
  for (const id of PAIRS) {
    const photo = await load(find(id, 'before'), edge); const ref = await load(find(id, 'after'));
    const out: any = renderHectographStencilV3({ data: new Uint8ClampedArray(photo.data), width: photo.width, height: photo.height } as any, cfg);
    rendered.push({ id, out, photo, ref });
  }
  for (const thr of [90, 128]) {
    const m: any = meanRow(rendered.map((r) => scorePair(r.out, r.ref, { source: r.photo, inkThreshold: thr })));
    console.log(`${label.padEnd(5)} | ${String(thr).padEnd(3)} | ${m.f1_1.toFixed(3)} ${m.recall1.toFixed(3)} ${m.precision1.toFixed(3)} | ${m.f1_2.toFixed(3)} ${m.recall2.toFixed(3)} ${m.precision2.toFixed(3)} | ${m.predCoverage.toFixed(3)} ${m.widthMedian.toFixed(2)}`);
  }
}
console.log('\nDOC v32-clean: F1 0.753 recall 0.826 precision 0.740 ink 0.369 stroke 5.590');
