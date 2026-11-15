// thinPinInterior: rim kept, centre thinned, thin lines untouched, default unchanged. Run: node scripts/v3/verify-pin.mjs
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.v3-test-'));
await build({ entryPoints: ['src/lib/classical-v3/hectograph-engine.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'e.mjs'), logLevel: 'error' });
globalThis.ImageData = class { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
const E = await import(pathToFileURL(join(dir, 'e.mjs')).href);
let fails = 0; const t = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== '' ? '  ' + d : '')); };
const W = 80, H = 80; const disc = (cx, cy, r) => { const a = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) a[y * W + x] = 1; return a; };
const big = disc(40, 40, 18), at = (a, x, y) => a[y * W + x];
const a1 = Float32Array.from(big); E.thinPinInterior(a1, W, H, 0.3);
t('keep=1 changes nothing', (() => { const a = Float32Array.from(big); E.thinPinInterior(a, W, H, 1); return a.every((v, i) => v === big[i]); })());
t('deep interior is scaled to ~keep', Math.abs(at(a1, 40, 40) - 0.3) < 0.05, at(a1, 40, 40).toFixed(3));
t('rim pixels stay near full strength', at(a1, 40 + 17, 40) > 0.85 && at(a1, 40, 40 - 17) > 0.85, `${at(a1, 57, 40).toFixed(2)} ${at(a1, 40, 23).toFixed(2)}`);
t('values only go down, never up', a1.every((v, i) => v <= big[i] + 1e-9));
t('pixels outside the disc stay zero', a1.every((v, i) => big[i] > 0 || v === 0));
t('the ramp is smooth (no jump larger than 0.25 between neighbours)', (() => { let m = 0; for (let x = 22; x < 58; x++) m = Math.max(m, Math.abs(at(a1, x + 1, 40) - at(a1, x, 40))); return m < 0.25; })(), '');
const line = new Float32Array(W * H); for (let x = 5; x < 75; x++) for (let y = 39; y <= 41; y++) line[y * W + x] = 1;
const a2 = Float32Array.from(line); E.thinPinInterior(a2, W, H, 0.2);
t('a 3 px line is not an interior and is left alone', a2.every((v, i) => Math.abs(v - line[i]) < 1e-6) || Math.min(...Array.from(a2).filter((v, i) => line[i] > 0)) > 0.9, `min on line ${Math.min(...Array.from(a2).filter((v, i) => line[i] > 0)).toFixed(3)}`);
t('lower keep never gives more ink', (() => { const a = Float32Array.from(big), b = Float32Array.from(big); E.thinPinInterior(a, W, H, 0.5); E.thinPinInterior(b, W, H, 0.1); return b.every((v, i) => v <= a[i] + 1e-9); })());
t('blank stays blank', (() => { const a = new Float32Array(W * H); E.thinPinInterior(a, W, H, 0.2); return a.every((v) => v === 0); })());
t('deterministic', (() => { const a = Float32Array.from(big), b = Float32Array.from(big); E.thinPinInterior(a, W, H, 0.4); E.thinPinInterior(b, W, H, 0.4); return Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)) === 0; })());
// engine wiring
const IW = 140, IH = 140, img = new ImageData(IW, IH); for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { const i = (y * IW + x) * 4; let v = 225; if ((x - 70) ** 2 + (y - 70) ** 2 < 900) v = 25; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
const same = (a, b) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
const ink = (o) => { let n = 0; for (let i = 0; i < o.data.length; i += 4) if (255 - Math.min(o.data[i], o.data[i + 1], o.data[i + 2]) >= 90) n++; return n / (o.width * o.height); };
const base = E.renderHectographStencilV3(img, { inkBudget: 1 });
t('pinInterior default (1) leaves the render unchanged', same(base, E.renderHectographStencilV3(img, { inkBudget: 1, pinInterior: 1 })) && E.DEFAULT_HECTOGRAPH_V3_CONFIG.pinInterior === 1);
const thin = E.renderHectographStencilV3(img, { inkBudget: 1, pinInterior: 0.2 });
t('pinInterior 0.2 hollows the dark disc (less ink)', ink(thin) < ink(base), `${ink(base).toFixed(3)} -> ${ink(thin).toFixed(3)}`);
t('NaN pinInterior falls back to unchanged', same(base, E.renderHectographStencilV3(img, { inkBudget: 1, pinInterior: NaN })));
console.log(fails ? `\n${fails} FAILED` : '\nALL PIN CHECKS PASSED'); process.exit(fails ? 1 : 0);
