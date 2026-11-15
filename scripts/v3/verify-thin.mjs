// Checks thinLayer on synthetic strokes of known width, and the engine's thin switch. Run: node scripts/v3/verify-thin.mjs
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.v3-test-'));
await build({ entryPoints: ['src/lib/classical-v3/hectograph-engine.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'e.mjs'), logLevel: 'error' });
globalThis.ImageData = class { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
const E = await import(pathToFileURL(join(dir, 'e.mjs')).href);
let fails = 0; const t = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== '' ? '  ' + d : '')); };
const W = 64, H = 64;
const field = (ang) => ({ tx: new Float32Array(W * H).fill(Math.cos(ang)), ty: new Float32Array(W * H).fill(Math.sin(ang)) });
// a soft ridge: triangular profile of half-width hw across a horizontal line at y=32, peak 1
const hline = (hw) => { const a = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = Math.max(0, 1 - Math.abs(y - 32) / hw); return a; };
const colCount = (a, x, thr = 1e-4) => { let n = 0; for (let y = 0; y < H; y++) if (a[y * W + x] > thr) n++; return n; };
const rowCount = (a, y, thr = 1e-4) => { let n = 0; for (let x = 0; x < W; x++) if (a[y * W + x] > thr) n++; return n; };

// horizontal ridge (tangent along x, normal along y)
const F = field(0), ridge = hline(5);
t('input ridge is wide (9 px above threshold)', colCount(ridge, 32) === 9, colCount(ridge, 32));
for (const w of [1, 2, 3, 4, 5]) { const o = E.thinLayer(ridge, F.tx, F.ty, W, H, w); t(`horizontal ridge thins to ${w} px`, colCount(o, 32) === w, `got ${colCount(o, 32)}`); }
const o3 = E.thinLayer(ridge, F.tx, F.ty, W, H, 3);
t('peak value preserved on the line', Math.abs(o3[32 * W + 32] - 1) < 1e-6);
t('line stays centred (rows 31..33)', o3[31 * W + 32] > 0 && o3[32 * W + 32] > 0 && o3[33 * W + 32] > 0 && o3[30 * W + 32] === 0 && o3[34 * W + 32] === 0);
t('line is continuous along its length (no gaps)', Array.from({ length: W }, (_, x) => o3[32 * W + x]).every((v) => v > 0));
// vertical ridge (tangent along y, normal along x)
const FV = field(Math.PI / 2); const vr = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) vr[y * W + x] = Math.max(0, 1 - Math.abs(x - 20) / 5);
t('vertical ridge thins to 3 px', rowCount(E.thinLayer(vr, FV.tx, FV.ty, W, H, 3), 32) === 3);
// flat-topped plateau must NOT vanish
const plate = new Float32Array(W * H); for (let y = 29; y <= 35; y++) for (let x = 0; x < W; x++) plate[y * W + x] = 0.8;
const op = E.thinLayer(plate, F.tx, F.ty, W, H, 1);
t('plateau keeps exactly one centre line (not zero, not seven)', colCount(op, 32) >= 1 && colCount(op, 32) <= 2, `got ${colCount(op, 32)}`);
// two parallel lines 10 px apart stay two lines
const two = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) two[y * W + x] = Math.max(0, 1 - Math.abs(y - 25) / 4, 1 - Math.abs(y - 39) / 4);
const o2 = E.thinLayer(two, F.tx, F.ty, W, H, 3); let runs = 0, prev = false; for (let y = 0; y < H; y++) { const on = o2[y * W + 32] > 0; if (on && !prev) runs++; prev = on; }
t('two parallel lines remain two separate strokes', runs === 2, `runs ${runs}`);
// diagonal: width measured perpendicular to the line should be ~w, not w*sqrt2
const FD = field(Math.PI / 4); const dg = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dg[y * W + x] = Math.max(0, 1 - Math.abs((x - y) / Math.SQRT2) / 5);
const od = E.thinLayer(dg, FD.tx, FD.ty, W, H, 3); let across = 0; for (let k = -10; k <= 10; k++) { const x = 32 + k, y = 32 - k; if (x >= 0 && y >= 0 && x < W && y < H && od[y * W + x] > 0) across++; }
t('diagonal stroke is thinner than the input and still present', across >= 1 && across <= 6 && E.thinLayer(dg, FD.tx, FD.ty, W, H, 3).some((v) => v > 0), `cells across antidiagonal ${across}`);
t('blank layer stays blank', E.thinLayer(new Float32Array(W * H), F.tx, F.ty, W, H, 3).every((v) => v === 0));
t('deterministic', Buffer.compare(Buffer.from(E.thinLayer(ridge, F.tx, F.ty, W, H, 3).buffer), Buffer.from(E.thinLayer(ridge, F.tx, F.ty, W, H, 3).buffer)) === 0);
t('never raises a value above the input maximum', Math.max(...E.thinLayer(ridge, F.tx, F.ty, W, H, 5)) <= 1 + 1e-9);
t('out-of-range width is clamped, not crashing', E.thinLayer(ridge, F.tx, F.ty, W, H, 99).length === W * H && E.thinLayer(ridge, F.tx, F.ty, W, H, -3).length === W * H && E.thinLayer(ridge, F.tx, F.ty, W, H, NaN).length === W * H);
const nanOut = E.thinLayer(ridge, F.tx, F.ty, W, H, NaN), threeOut = E.thinLayer(ridge, F.tx, F.ty, W, H, 3);
t('NaN width falls back to the default (3 px), it does NOT erase the lines', nanOut.some((v) => v > 0) && Buffer.compare(Buffer.from(nanOut.buffer), Buffer.from(threeOut.buffer)) === 0, `nonzero=${nanOut.filter((v) => v > 0).length}`);
t('Infinity width also falls back to the default', Buffer.compare(Buffer.from(E.thinLayer(ridge, F.tx, F.ty, W, H, Infinity).buffer), Buffer.from(threeOut.buffer)) === 0);
t('every output value is finite', nanOut.every((v) => Number.isFinite(v)));

// engine wiring
const IW = 120, IH = 120, img = new ImageData(IW, IH);
for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { const i = (y * IW + x) * 4; let v = 235; if (Math.abs(y - 60) < 3 || Math.abs(x - 40) < 2) v = 40; if ((x - 85) ** 2 + (y - 35) ** 2 < 220) v = 60; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
const ink = (o) => { let n = 0; for (let i = 0; i < o.data.length; i += 4) if (255 - Math.min(o.data[i], o.data[i + 1], o.data[i + 2]) >= 90) n++; return n / (o.width * o.height); };
const base = E.renderHectographStencilV3(img, { inkBudget: 1 });
const explicitOff = E.renderHectographStencilV3(img, { inkBudget: 1, thin: false, thinWidth: 5 });
t('thin is OFF by default and thinWidth alone changes nothing', Buffer.compare(Buffer.from(base.data), Buffer.from(explicitOff.data)) === 0);
t('default config: thin false, thinWidth 3', E.DEFAULT_HECTOGRAPH_V3_CONFIG.thin === false && E.DEFAULT_HECTOGRAPH_V3_CONFIG.thinWidth === 3);
const on3 = E.renderHectographStencilV3(img, { inkBudget: 1, thin: true, thinWidth: 3 });
t('thin on changes the render', Buffer.compare(Buffer.from(base.data), Buffer.from(on3.data)) !== 0);
t('thin on reduces ink', ink(on3) < ink(base), `${ink(base).toFixed(4)} -> ${ink(on3).toFixed(4)}`);
t('thin on is deterministic', Buffer.compare(Buffer.from(on3.data), Buffer.from(E.renderHectographStencilV3(img, { inkBudget: 1, thin: true, thinWidth: 3 }).data)) === 0);
t('thinner width never gives more ink', ink(E.renderHectographStencilV3(img, { inkBudget: 1, thin: true, thinWidth: 2 })) <= ink(on3) + 1e-9);
console.log(fails ? `\n${fails} FAILED` : '\nALL THINNING CHECKS PASSED'); process.exit(fails ? 1 : 0);
