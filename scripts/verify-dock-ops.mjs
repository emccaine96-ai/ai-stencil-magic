// Runs every dock filter on a synthetic stencil and asserts real pixel properties.
// Run: node scripts/verify-dock-ops.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, '.dock-verify'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
execSync(`npx tsc src/lib/vault-ops/dock-ops.ts --outDir ${out}/lib --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --lib ES2022,DOM`, { cwd: root, stdio: 'ignore' });
for (const f of fs.readdirSync(`${out}/lib`)) { const p = `${out}/lib/${f}`; fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, 'from $1$2.js$1')); }
globalThis.ImageData = class ImageData { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
const D = await import(`${out}/lib/dock-ops.js`);

// Synthetic stencil: white page, thick circle outline, thin diagonal line (2px), thin horizontal (1px).
const W = 256, H = 192;
function stencil() {
  const img = new ImageData(W, H); const d = img.data; d.fill(255);
  const set = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255; };
  for (let a = 0; a < 6.2832; a += 0.002) for (let r = 38; r <= 42; r++) set(Math.round(128 + r * Math.cos(a)), Math.round(96 + r * Math.sin(a)));
  for (let t = 0; t < 200; t++) { set(20 + t, 20 + Math.round(t * 0.6)); set(21 + t, 20 + Math.round(t * 0.6)); }
  for (let x = 30; x < 226; x++) set(x, 170);
  return img;
}
const dark = (img) => { let n = 0; for (let i = 0; i < img.data.length; i += 4) if (img.data[i] < 128) n++; return n; };
const meanLum = (img) => { let s = 0; for (let i = 0; i < img.data.length; i += 4) s += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3; return s / (img.data.length / 4); };
let fails = 0; const t = (n, ok, e = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n.padEnd(44) + e); };

const base = stencil(); const baseDark = dark(base), baseMean = meanLum(base);
console.log(`stencil ${W}x${H}: ${baseDark} dark px, mean luminance ${baseMean.toFixed(1)}\n`);

// 1. Every filter: valid output, no NaN, in range, input not mutated.
for (const [name, op] of Object.entries(D.FILTER_OPS)) {
  const src = stencil(); const snap = Uint8ClampedArray.from(src.data);
  let r; try { r = op.run(src); } catch (e) { t(`${name}: runs`, false, String(e).slice(0, 60)); continue; }
  const sizeOk = name === 'rotate90' ? (r.width === H && r.height === W) : (r.width === W && r.height === H);
  const lenOk = r.data.length === r.width * r.height * 4;
  const inputOk = snap.every((v, i) => v === src.data[i]);
  let bad = 0; for (let i = 0; i < r.data.length; i++) if (!(r.data[i] >= 0 && r.data[i] <= 255)) bad++;
  t(`${name}: valid size, range, input untouched`, sizeOk && lenOk && inputOk && bad === 0, `${r.width}x${r.height}`);
}
console.log();
// 2. Exactness for geometry ops.
{ const a = stencil(); const f = D.FILTER_OPS.flipH.run(D.FILTER_OPS.flipH.run(a)); t('flipH twice = identity', f.data.every((v, i) => v === a.data[i]));
  const g = D.FILTER_OPS.flipV.run(D.FILTER_OPS.flipV.run(a)); t('flipV twice = identity', g.data.every((v, i) => v === a.data[i]));
  let r = a; for (let i = 0; i < 4; i++) r = D.FILTER_OPS.rotate90.run(r); t('rotate90 x4 = identity', r.width === W && r.height === H && r.data.every((v, i) => v === a.data[i]));
  const fh = D.FILTER_OPS.flipH.run(a); t('flipH moves pixel (0,y) <-> (W-1,y)', fh.data[((50 * W) + (W - 1)) * 4] === a.data[(50 * W) * 4] ); }
// 3. Stencil-safety: one tap must not destroy the linework.
const keep = (name, lo, hi) => { const r = D.FILTER_OPS[name].run(stencil()); const k = dark(r) / baseDark; t(`${name}: linework preserved (${lo}-${hi}x dark px)`, k >= lo && k <= hi, `ratio ${k.toFixed(2)}`); };
keep('sharpen', 0.8, 1.6); keep('curves', 0.8, 1.6); keep('blur', 0.3, 1.4); 
keep('grain', 0.8, 1.6); keep('chromatic', 0.7, 1.8); keep('stretch', 0.6, 1.6);
{ const r = D.FILTER_OPS.sepia.run(stencil()); t('sepia: tints but keeps lines dark', dark(r) >= baseDark * 0.9, `${dark(r)} vs ${baseDark}`); }
{ const r = D.FILTER_OPS.thermalPurple.run(stencil()); let purple = 0; for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 2] > r.data[i + 1] + 20) purple++; t('thermalPurple: produces purple ink', purple > baseDark * 0.5, `${purple} purple px`); }
{ const r = D.FILTER_OPS.thermalBlue.run(stencil()); let blue = 0; for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 2] > r.data[i] + 20) blue++; t('thermalBlue: produces blue ink', blue > baseDark * 0.5, `${blue} blue px`); }
{ const r = D.FILTER_OPS.edge.run(stencil()); const k = dark(r); t('edge: dark lines on white paper (not blank, mostly white)', k > 0 && k < W * H * 0.2 && meanLum(r) > 200, `${k} dark px, mean ${meanLum(r).toFixed(0)}`); }
{ const r = D.FILTER_OPS.vignette.run(stencil()); const c = (96 * W + 128) * 4, k = 4; t('vignette: centre untouched, corner darkened', r.data[c] === 255 && r.data[k] < 255 && r.data[k] > 150, `corner ${r.data[k]}`); }
{ const r = D.FILTER_OPS.thermalPurple.run(stencil()); const ink = (170 * W + 100) * 4, paper = (5 * W + 5) * 4; t('thermal: paper stays white', r.data[paper] === 255 && r.data[paper + 1] === 255 && r.data[paper + 2] === 255); t('thermal: ink is purple (b > g, r > g)', r.data[ink + 2] > r.data[ink + 1] + 60 && r.data[ink] > r.data[ink + 1], `rgb ${r.data[ink]},${r.data[ink + 1]},${r.data[ink + 2]}`); }
{ const r = D.FILTER_OPS.pixelate.run(stencil()); t('pixelate: blocky (neighbours equal)', r.data[0] === r.data[4] && r.data[0] === r.data[(W + 1) * 4]); }
// 4. Determinism: same input -> same output (so undo/redo and re-apply are predictable).
for (const name of ['grain', 'dispersion']) { const a = D.FILTER_OPS[name].run(stencil()), b = D.FILTER_OPS[name].run(stencil()); t(`${name}: deterministic`, a.data.every((v, i) => v === b.data[i])); }
// 5. Tables are complete and don't collide.
{ const all = D.IMPLEMENTED_DOCK_ACTIONS; t('no duplicate action names', new Set(all).size === all.length, `${all.length} actions`); }
// 6. Degenerate sizes don't throw.
{ let ok = true; for (const [name, op] of Object.entries(D.FILTER_OPS)) { try { op.run(new ImageData(1, 1)); } catch (e) { ok = false; console.log('  throws on 1x1:', name, String(e).slice(0, 60)); } } t('all filters survive a 1x1 image', ok); }
console.log(fails ? `\n${fails} FAILED` : '\nALL DOCK OP CHECKS PASSED'); process.exit(fails ? 1 : 0);
