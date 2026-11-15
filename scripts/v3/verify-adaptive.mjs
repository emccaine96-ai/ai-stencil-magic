// Checks the adaptive mapping (pure functions) and that adaptive/boostCap leave default output unchanged. Run: node scripts/v3/verify-adaptive.mjs
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.v3-test-'));
await build({ entryPoints: ['src/lib/classical-v3/hectograph-engine.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'e.mjs'), logLevel: 'error' });
globalThis.ImageData = class { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
const E = await import(pathToFileURL(join(dir, 'e.mjs')).href);
let fails = 0; const t = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== '' ? '  ' + d : '')); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ---- densityToT
t('t is 0 at and below the sparse end', E.densityToT(E.ADAPTIVE_DENSITY_LO) === 0 && E.densityToT(0) === 0 && E.densityToT(-5) === 0);
t('t is 1 at and above the dense end', E.densityToT(E.ADAPTIVE_DENSITY_HI) === 1 && E.densityToT(9) === 1);
t('t is linear in between', near(E.densityToT(0.07), 0.5));
t('NaN / Infinity density: finite, in range', [NaN, Infinity, -Infinity].every((d) => { const v = E.densityToT(d); return Number.isFinite(v) && v >= 0 && v <= 1; }), `NaN->${E.densityToT(NaN)}`);
// ---- continuity: no flips. Step the density finely and bound the change of EVERY parameter per step.
let maxJump = 0, worst = '';
const keys = ['ridgeAnisotropy', 'inkFloorCap', 'sigma32Weight', 'broadDoGWeight', 'sigma12Weight', 'inkGain'];
for (let d = 0.02; d < 0.12; d += 0.0005) { const a = E.adaptiveParams(d), b = E.adaptiveParams(d + 0.0005); for (const k of keys) { const range = Math.abs(E.adaptiveParams(0.2)[k] - E.adaptiveParams(0)[k]) || 1; const j = Math.abs(b[k] - a[k]) / range; if (j > maxJump) { maxJump = j; worst = k; } } }
t('continuous: no parameter moves more than 1.2% of its range per 0.0005 of density', maxJump < 0.012, `max ${(maxJump * 100).toFixed(2)}% (${worst})`);
// speck pixels are rounded, so allow one integer step
let spJump = 0; for (let d = 0.02; d < 0.12; d += 0.0005) spJump = Math.max(spJump, Math.abs(E.adaptiveParams(d + 0.0005).strongSpeckPixels - E.adaptiveParams(d).strongSpeckPixels)); t('strongSpeckPixels changes by at most 1 per step', spJump <= 1, spJump);
// ---- directions and bounds
const sp = E.adaptiveParams(0), dn = E.adaptiveParams(1);
t('sparse end: relaxed speck removal, finer scale on, broad scales on, gain up to 1.12', sp.strongSpeckPixels === 0 && sp.sigma12Weight === 1 && sp.sigma32Weight === 1 && sp.broadDoGWeight === 1 && near(sp.inkGain, 1.12));
t('dense end: speck 8, broad scales off, no fine scale, cap 0.8, stricter anisotropy, no gain', dn.strongSpeckPixels === 8 && dn.sigma32Weight === 0 && dn.broadDoGWeight === 0 && dn.sigma12Weight === 0 && near(dn.inkFloorCap, 0.8) && dn.ridgeAnisotropy > sp.ridgeAnisotropy && dn.inkGain === 1);
t('inkGain never exceeds the 1.12 bound for any density', Array.from({ length: 400 }, (_, i) => E.adaptiveParams(i / 2000).inkGain).every((g) => g >= 1 && g <= 1.12 + 1e-12));
t('floor cap stays within 0.5..0.8', Array.from({ length: 400 }, (_, i) => E.adaptiveParams(i / 2000).inkFloorCap).every((g) => g >= 0.5 - 1e-12 && g <= 0.8 + 1e-12));
t('t increases monotonically with density', Array.from({ length: 300 }, (_, i) => E.densityToT(i / 2000)).every((v, i, a) => i === 0 || v >= a[i - 1]));
// ---- density measurement: size independent
const W = 640, H = 480, lum = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) lum[y * W + x] = 0.5 + 0.4 * Math.sin(x / 9) * Math.cos(y / 11);
const up = (k) => { const w2 = W * k, h2 = H * k, o = new Float32Array(w2 * h2); for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) o[y * w2 + x] = 0.5 + 0.4 * Math.sin(x / k / 9) * Math.cos(y / k / 11); return [o, w2, h2]; };
const d1 = E.adaptiveDensity(lum, W, H), [l2, w2, h2] = up(2), d2 = E.adaptiveDensity(l2, w2, h2);
t('same scene at 2x the pixels gives nearly the same adaptive density (+-12%)', Math.abs(d2 - d1) / d1 < 0.12, `${d1.toFixed(4)} vs ${d2.toFixed(4)}`);
const f1 = E.measureEdgeDensity(lum, W, H), f2 = E.measureEdgeDensity(l2, w2, h2);
t('...while the OLD full-size measure differs a lot between the same two sizes', Math.abs(f2 - f1) / f1 > 0.3, `${f1.toFixed(4)} vs ${f2.toFixed(4)}`);
t('a tiny image is not upscaled and does not crash', Number.isFinite(E.adaptiveDensity(new Float32Array(9 * 9).fill(0.5), 9, 9)));
t('flat image has zero density', E.adaptiveDensity(new Float32Array(100 * 100).fill(0.5), 100, 100) < 1e-6);
t('resizeLumBilinear keeps a constant image constant', E.resizeLumBilinear(new Float32Array(50 * 40).fill(0.3), 50, 40, 20, 16).every((v) => near(v, 0.3, 1e-6)));
t('resizeLumBilinear identity size is the identity', (() => { const a = Float32Array.from({ length: 30 }, (_, i) => i / 30); const b = E.resizeLumBilinear(a, 6, 5, 6, 5); return a.every((v, i) => near(v, b[i], 1e-6)); })());

// ---- engine wiring
const IW = 160, IH = 120, img = new ImageData(IW, IH);
for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) { const i = (y * IW + x) * 4; let v = 220 - 60 * Math.sin(x / 7) * Math.cos(y / 9); if (Math.abs(y - 60) < 3) v = 35; if ((x - 110) ** 2 + (y - 40) ** 2 < 300) v = 50; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v)); img.data[i + 3] = 255; }
const same = (a, b) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
const base = E.renderHectographStencilV3(img, {});
t('adaptive:false and boostCap 0.22 are exactly the defaults', same(base, E.renderHectographStencilV3(img, { adaptive: false, boostCap: 0.22 })));
t('default config: adaptive false, boostCap 0.22', E.DEFAULT_HECTOGRAPH_V3_CONFIG.adaptive === false && E.DEFAULT_HECTOGRAPH_V3_CONFIG.boostCap === 0.22);
t('adaptive:true changes the render', !same(base, E.renderHectographStencilV3(img, { adaptive: true })));
t('adaptive is deterministic', same(E.renderHectographStencilV3(img, { adaptive: true }), E.renderHectographStencilV3(img, { adaptive: true })));
let chosen = null; E.renderHectographStencilV3(img, { adaptive: true, debugAdaptive: (a) => (chosen = a) });
t('adaptive reports what it chose (t in 0..1)', chosen && chosen.t >= 0 && chosen.t <= 1, chosen && `t=${chosen.t.toFixed(3)}`);
const ink = (o) => { let n = 0; for (let i = 0; i < o.data.length; i += 4) if (255 - Math.min(o.data[i], o.data[i + 1], o.data[i + 2]) >= 90) n++; return n / (o.width * o.height); };
t('smaller boostCap never adds ink', ink(E.renderHectographStencilV3(img, { inkBudget: 1, boostCap: 0.05 })) <= ink(E.renderHectographStencilV3(img, { inkBudget: 1, boostCap: 0.22 })) + 1e-9);
t('boostCap 0.05 changes the render', !same(E.renderHectographStencilV3(img, { inkBudget: 1, boostCap: 0.05 }), E.renderHectographStencilV3(img, { inkBudget: 1, boostCap: 0.22 })));
t('bad boostCap (NaN) falls back to 0.22', same(E.renderHectographStencilV3(img, { boostCap: NaN }), base));
t('absurd boostCap is clamped (5 behaves as 0.5)', same(E.renderHectographStencilV3(img, { boostCap: 5 }), E.renderHectographStencilV3(img, { boostCap: 0.5 })));
t('adaptive ignores manual broadDoG/sigma3.2 switches (the weights replace them)', same(E.renderHectographStencilV3(img, { adaptive: true }), E.renderHectographStencilV3(img, { adaptive: true, broadDoG: false, hessianSigma32: false })));
t('output stays opaque RGBA', E.renderHectographStencilV3(img, { adaptive: true }).data.every((v, i) => i % 4 !== 3 || v === 255));
console.log(fails ? `\n${fails} FAILED` : '\nALL ADAPTIVE CHECKS PASSED'); process.exit(fails ? 1 : 0);
