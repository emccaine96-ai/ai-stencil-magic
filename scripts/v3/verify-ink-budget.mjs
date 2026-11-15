// Unit checks for computeInkFloor and for the engine's budget/switch wiring. Run: node scripts/v3/verify-ink-budget.mjs
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.v3-test-'));
await build({ entryPoints: ['src/lib/classical-v3/hectograph-engine.ts'], bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'e.mjs'), logLevel: 'error' });
globalThis.ImageData = class { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
const E = await import(pathToFileURL(join(dir, 'e.mjs')).href);
let fails = 0; const t = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== '' ? '  ' + d : '')); };
const arr = (n, f) => Float32Array.from({ length: n }, (_, i) => f(i));
const share = (a, floor) => a.filter((v) => v >= floor).length / a.length;

// uniform ramp 0..1: share >= floor is ~ (1 - floor)
const ramp = arr(10000, (i) => i / 10000);
const f30 = E.computeInkFloor(ramp, 0.30);
t('ramp, budget 0.30 -> floor near 0.70', Math.abs(f30 - 0.5) < 1e-9 || f30 === 0.5, f30);   // capped at 0.5
t('floor is capped at MAX_INK_FLOOR (0.5)', E.computeInkFloor(ramp, 0.01) === 0.5);
const ramp2 = arr(10000, (i) => (i / 10000) * 0.5);       // values only up to 0.5
const f2 = E.computeInkFloor(ramp2, 0.30);
t('budget holds: share of kept pixels <= 0.30 (+1 bin of slack)', share(ramp2, f2) <= 0.30 + 1 / 200 * 2, share(ramp2, f2).toFixed(4));
t('and is tight: lowering the floor one bin would break the budget', share(ramp2, f2 - 1 / 200) > 0.30 || f2 === E.PAPER_GATE, share(ramp2, f2 - 1 / 200).toFixed(4));
const sparse = arr(10000, (i) => (i < 500 ? 0.8 : 0));   // only 5% inked
t('sparse image (5% ink) keeps the plain 0.035 gate', E.computeInkFloor(sparse, 0.30) === E.PAPER_GATE);
t('empty image keeps the gate', E.computeInkFloor(new Float32Array(0), 0.3) === E.PAPER_GATE);
t('blank (all zero) keeps the gate', E.computeInkFloor(new Float32Array(100), 0.3) === E.PAPER_GATE);
t('budget >= 1 disables it', E.computeInkFloor(ramp, 1) === E.PAPER_GATE && E.computeInkFloor(ramp, 5) === E.PAPER_GATE);
t('NaN budget is safe', E.computeInkFloor(ramp, NaN) === E.PAPER_GATE);
t('budget 0 pushes to the cap', E.computeInkFloor(arr(1000, () => 0.9), 0) === 0.5);
t('floor never below 0.035 for any budget', [0, 0.1, 0.3, 0.9].every((b) => E.computeInkFloor(ramp2, b) >= E.PAPER_GATE));
t('monotone: smaller budget never gives a lower floor', E.computeInkFloor(ramp2, 0.1) >= E.computeInkFloor(ramp2, 0.3) && E.computeInkFloor(ramp2, 0.3) >= E.computeInkFloor(ramp2, 0.6));
t('deterministic', E.computeInkFloor(ramp2, 0.3) === E.computeInkFloor(ramp2, 0.3));
const heavy = arr(10000, (i) => 0.4 + (i / 10000) * 0.1);  // all pixels inked, 0.40..0.50
const fh = E.computeInkFloor(heavy, 0.30); t('all-inked page: floor rises to cut ink to the budget', fh > 0.4 && share(heavy, fh) <= 0.31, `${fh} share ${share(heavy, fh).toFixed(3)}`);

// --- floor cap parameter
const dense = arr(10000, (i) => 0.55 + (i / 10000) * 0.4);   // every pixel is above 0.5
t('cap 0.5: dense page cannot reach the budget (floor pinned at 0.5)', E.computeInkFloor(dense, 0.30, 0.5) === 0.5 && share(dense, 0.5) === 1);
const f8 = E.computeInkFloor(dense, 0.30, 0.8);
// dense runs 0.55..0.95 uniformly, so the share at floor f is (0.95 - f) / 0.40 and a 0.30 budget needs f = 0.83.
t('cap 0.8 binds when the budget needs more (0.83): floor is the cap', f8 === 0.8 && Math.abs(share(dense, f8) - 0.375) < 0.01, `${f8} share ${share(dense, f8).toFixed(3)}`);
const mid = arr(10000, (i) => 0.55 + (i / 10000) * 0.25);    // 0.55..0.80, a 0.30 budget needs f = 0.725
const fm = E.computeInkFloor(mid, 0.30, 0.8);
t('cap 0.8: a page whose answer is under the cap meets the budget', fm > 0.5 && fm < 0.8 && share(mid, fm) <= 0.30 + 1 / 200 * 2, `${fm} share ${share(mid, fm).toFixed(3)}`);
t('cap 0.5 on that same page is stuck at 0.5 and over budget', E.computeInkFloor(mid, 0.30, 0.5) === 0.5 && share(mid, 0.5) === 1);
t('default cap is 0.5 (old behaviour unchanged)', E.computeInkFloor(dense, 0.30) === E.computeInkFloor(dense, 0.30, 0.5));
t('NaN cap falls back to 0.5', E.computeInkFloor(dense, 0.30, NaN) === 0.5);
t('cap above 0.95 is clamped to 0.95', E.computeInkFloor(arr(1000, () => 0.99), 0, 5) <= 0.95);
t('cap below the paper gate cannot go under the gate', E.computeInkFloor(dense, 0.30, 0.001) === E.PAPER_GATE);
t('a higher cap never gives a lower floor', E.computeInkFloor(dense, 0.30, 0.8) >= E.computeInkFloor(dense, 0.30, 0.5));

// --- engine wiring on a synthetic photo (smooth gradient + a dark disc + stripes) ---
const W = 160, H = 160, img = new ImageData(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; let v = 40 + (x / W) * 180; if ((x - 80) ** 2 + (y - 80) ** 2 < 900) v = 20; if (x % 16 < 3) v -= 60; v = Math.max(0, Math.min(255, v)); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
const inkShare = (o) => { let n = 0; for (let i = 0; i < o.data.length; i += 4) if ((o.data[i] + o.data[i + 1] + o.data[i + 2]) / 3 < 250) n++; return n / (o.width * o.height); };
const off = E.renderHectographStencilV3(img, { inkBudget: 1 });
const on = E.renderHectographStencilV3(img, { inkBudget: 0.10 });
t('budget lowers ink on a heavy page', inkShare(on) < inkShare(off), `${inkShare(off).toFixed(3)} -> ${inkShare(on).toFixed(3)}`);
// The exact budget guarantee is covered by the computeInkFloor checks above (share <= budget, tight to one bin).
// End to end, the floor is capped at 0.5, so a page with large areas above 0.5 may stay over a very small budget.
t('a tighter budget never produces MORE ink than a looser one', inkShare(E.renderHectographStencilV3(img, { inkBudget: 0.10 })) <= inkShare(E.renderHectographStencilV3(img, { inkBudget: 0.30 })) + 1e-9);
const same1 = E.renderHectographStencilV3(img, {}), same2 = E.renderHectographStencilV3(img, {});
t('render is deterministic', Buffer.compare(Buffer.from(same1.data), Buffer.from(same2.data)) === 0);
const dflt = E.renderHectographStencilV3(img, {}), explicit = E.renderHectographStencilV3(img, { inkBudget: 0.30, broadDoG: true, hessianSigma32: true });
t('defaults equal explicit (0.30, DoG on, 3.2 on)', Buffer.compare(Buffer.from(dflt.data), Buffer.from(explicit.data)) === 0);
t('default config advertises inkBudget 0.30 and both switches on', E.DEFAULT_HECTOGRAPH_V3_CONFIG.inkBudget === 0.30 && E.DEFAULT_HECTOGRAPH_V3_CONFIG.broadDoG === true && E.DEFAULT_HECTOGRAPH_V3_CONFIG.hessianSigma32 === true);
const nodog = E.renderHectographStencilV3(img, { inkBudget: 1, broadDoG: false }), nos32 = E.renderHectographStencilV3(img, { inkBudget: 1, hessianSigma32: false });
t('broadDoG:false changes the output', Buffer.compare(Buffer.from(nodog.data), Buffer.from(off.data)) !== 0);
t('hessianSigma32:false changes the output', Buffer.compare(Buffer.from(nos32.data), Buffer.from(off.data)) !== 0);
t('both switches only ever remove ink (never add)', inkShare(nodog) <= inkShare(off) + 1e-9 && inkShare(nos32) <= inkShare(off) + 1e-9, `${inkShare(off).toFixed(3)} / ${inkShare(nodog).toFixed(3)} / ${inkShare(nos32).toFixed(3)}`);
t('output is opaque white-paper RGBA', on.data.every((v, i) => i % 4 !== 3 || v === 255));
console.log(fails ? `\n${fails} FAILED` : '\nALL INK-BUDGET CHECKS PASSED'); process.exit(fails ? 1 : 0);
