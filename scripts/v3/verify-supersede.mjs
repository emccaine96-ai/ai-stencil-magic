// Verifies the real useHectographEngineV3 supersede logic with a fake Worker and a minimal hooks shim.
// No DOM and no test library needed. Run: node scripts/v3/verify-supersede.mjs
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(process.cwd(), '.v3-test-'));
// 1. a tiny React shim: hooks keep state in a slot array, effects run on demand
writeFileSync(join(dir, 'react-shim.mjs'), `
const slots = []; let i = 0; export const effects = []; export const unmounts = [];
export function reset() { i = 0; }
export function useState(init) { const k = i++; if (!(k in slots)) slots[k] = typeof init === 'function' ? init() : init; return [slots[k], (v) => { slots[k] = typeof v === 'function' ? v(slots[k]) : v; }]; }
export function useRef(init) { const k = i++; if (!(k in slots)) slots[k] = { current: init }; return slots[k]; }
export function useCallback(fn) { i++; return fn; }
const ran = new Set(); export function useEffect(fn) { i++; if (!ran.has(fn.toString())) { ran.add(fn.toString()); const c = fn(); if (typeof c === 'function') unmounts.push(c); } }
`);
await build({
  entryPoints: [join(process.cwd(), 'src/lib/classical-v3/useHectographEngineV3.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'hook.mjs'), logLevel: 'error',
  alias: { react: join(dir, 'react-shim.mjs') },
  external: [join(dir, 'react-shim.mjs')], // keep ONE shim instance shared with this test, not a bundled copy
  define: { 'import.meta.url': JSON.stringify('file:///x/hook.ts') },
});

const workers = [];
class FakeWorker {
  terminated = false; posted = []; l = { message: [], error: [] };
  constructor() { workers.push(this); }
  addEventListener(t, f) { this.l[t].push(f); }
  removeEventListener(t, f) { this.l[t] = this.l[t].filter((x) => x !== f); }
  postMessage(m) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  reply(d) { this.l.message.slice().forEach((f) => f({ data: d })); }
}
globalThis.Worker = FakeWorker;
globalThis.ImageData = class { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };

const shim = await import(pathToFileURL(join(dir, 'react-shim.mjs')).href);
const mod = await import(pathToFileURL(join(dir, 'hook.mjs')).href);
let fails = 0; const t = (n, ok, d = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const img = () => new ImageData(new Uint8ClampedArray(16), 2, 2);

shim.reset(); const api = mod.useHectographEngineV3();   // mount (runs the unmount-registering effect)
if (shim.unmounts.length !== 1) throw new Error('harness: expected the mount effect to register exactly one cleanup, got ' + shim.unmounts.length);
const { isV3Superseded, V3SupersededError } = mod;

const pA = api.renderStencilV3(img()); let aErr = null; pA.catch((e) => (aErr = e));
t('first render starts exactly one worker', workers.length === 1 && !workers[0].terminated);
const pB = api.renderStencilV3(img()); let bRes = null; pB.then((r) => (bRes = r));
await tick();
t('superseded render rejects', aErr !== null);
t('rejection is a V3SupersededError', aErr instanceof V3SupersededError);
t('isV3Superseded(err) is true for it', isV3Superseded(aErr) === true);
t('isV3Superseded is false for ordinary errors / null / strings', !isV3Superseded(new Error('boom')) && !isV3Superseded(null) && !isV3Superseded('x') && !isV3Superseded(undefined));
t('old worker was terminated', workers[0].terminated === true);
t('a NEW worker was created for the new render', workers.length === 2 && !workers[1].terminated);
t('new job went to the NEW worker (not queued behind the old)', workers[1].posted.length === 1 && workers[0].posted.length === 1);
workers[1].reply({ type: 'RENDER_COMPLETE', jobId: workers[1].posted[0].jobId, resultBuffer: new Uint8ClampedArray(16).buffer, width: 2, height: 2, durationMs: 5 });
await tick();
t('newer render still resolves normally', bRes && bRes.width === 2 && bRes.height === 2);

// three rapid renders: only the last survives, two workers killed
const p1 = api.renderStencilV3(img()), p2 = api.renderStencilV3(img()), p3 = api.renderStencilV3(img());
const r = await Promise.allSettled([p1, p2]);
t('rapid supersede: every stale promise rejects as superseded', r.every((x) => x.status === 'rejected' && isV3Superseded(x.reason)));
const live = workers.filter((w) => !w.terminated);
t('rapid supersede: exactly one live worker remains', live.length === 1, `live=${live.length} total=${workers.length}`);
const w3 = live[0];
w3.reply({ type: 'RENDER_COMPLETE', jobId: w3.posted[0].jobId, resultBuffer: new Uint8ClampedArray(16).buffer, width: 2, height: 2, durationMs: 1 });
t('rapid supersede: last render resolves', (await p3).width === 2);

// a real error is not "superseded"
const pE = api.renderStencilV3(img()); let eErr = null; pE.catch((e) => (eErr = e));
const wE = workers.filter((w) => !w.terminated).at(-1);
wE.reply({ type: 'RENDER_ERROR', jobId: wE.posted.at(-1).jobId, message: 'real failure' }); await tick();
t('a genuine render error is NOT treated as superseded', eErr && eErr.message === 'real failure' && !isV3Superseded(eErr));

// unmount cancels the in-flight render quietly and kills the worker
const pF = api.renderStencilV3(img()); let fErr = null; pF.catch((e) => (fErr = e));
const wF = workers.filter((w) => !w.terminated).at(-1);
shim.unmounts.forEach((u) => u()); await tick();
t('unmount rejects the in-flight render as superseded (ignorable)', fErr && isV3Superseded(fErr));
t('unmount terminates the worker', wF.terminated === true);
console.log(fails ? `\n${fails} FAILED` : '\nALL SUPERSEDE CHECKS PASSED'); process.exit(fails ? 1 : 0);
