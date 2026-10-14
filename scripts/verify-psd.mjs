// Builds PSD files with the real src/lib/psd-export.ts and checks them with the independent
// `psd-tools` parser (pip install psd-tools pillow numpy). Run: node scripts/verify-psd.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, '.psd-verify'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
execSync(`npx tsc src/lib/psd-export.ts --outDir ${out}/lib --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --lib ES2022,DOM`, { cwd: root, stdio: 'ignore' });
for (const f of fs.readdirSync(`${out}/lib`)) { const p = `${out}/lib/${f}`; fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, 'from $1$2.js$1')); }
class Ctx { constructor(c) { this.c = c; } getImageData(x, y, w, h) { return { data: this.c._d.slice(0, w * h * 4), width: w, height: h }; } }
const mk = (w, h, f) => { const c = { width: w, height: h, _d: new Uint8ClampedArray(w * h * 4) }; for (let i = 0; i < w * h; i++) c._d.set(f(i % w, (i / w) | 0), i * 4); c.getContext = () => new Ctx(c); return c; };
const mod = await import(`${out}/lib/psd-export.js`);
const W = 64, H = 48;
const layers = [
  { id: 'a', name: 'Background', kind: 'raster', visible: true, locked: false, opacity: 1, blendMode: 'normal', clipped: false, canvas: mk(W, H, () => [255, 255, 255, 255]) },
  { id: 'b', name: 'Ink', kind: 'raster', visible: true, locked: false, opacity: 0.5, blendMode: 'multiply', clipped: false, canvas: mk(W, H, (x) => (x < 32 ? [168, 85, 247, 255] : [0, 0, 0, 0])) },
];
const comp = mk(W, H, (x) => (x < 32 ? [212, 170, 251, 255] : [255, 255, 255, 255]));
fs.writeFileSync(`${out}/t.psd`, Buffer.from(await mod.exportPSD(W, H, layers, comp).arrayBuffer()));
fs.copyFileSync(path.join(root, 'scripts/verify-psd.judge.py'), `${out}/judge.py`);
const res = execSync(`python3 ${out}/judge.py ${out}/t.psd`, { encoding: 'utf8' });
console.log(res);
if (!res.includes('ALL PASS')) process.exit(1);
