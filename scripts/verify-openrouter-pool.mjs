// Exercises src/lib/openrouter-pool.ts against a scripted fake OpenRouter. Run: node scripts/verify-openrouter-pool.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, '.or-verify'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');
execSync(`npx tsc src/lib/openrouter-pool.ts --outDir ${out} --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --lib ES2022,DOM`, { cwd: root, stdio: 'ignore' });
const M = await import(`${out}/openrouter-pool.js`);

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const okBody = { model: 'google/gemini-2.5-flash-image', choices: [{ message: { images: [{ image_url: { url: PNG } }], content: 'here' } }] };
const J = (status, body, headers = {}) => () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
function scripted(steps) { const calls = []; const f = async (url, init) => { calls.push({ url, init }); const s = steps[Math.min(calls.length - 1, steps.length - 1)]; if (s instanceof Error) throw s; if (typeof s === 'function') return s(init); return s.clone ? s.clone() : s; }; f.calls = calls; return f; }
const base = { apiKey: 'k', prompt: 'p', images: [{ mimeType: 'image/png', data: 'AAAA' }], baseDelayMs: 1, sleep: async () => {} };
let fails = 0; const t = (name, ok, extra = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

// 1 success + request shape
{ const f = scripted([J(200, okBody)()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  const b = JSON.parse(f.calls[0].init.body);
  t('success returns image', r.ok && r.dataUrl === PNG && r.attempts === 1);
  t('sends modalities image+text', JSON.stringify(b.modalities) === '["image","text"]');
  t('top-level models[] fallback chain, primary first', b.models[0] === 'google/gemini-2.5-flash-image' && b.models.length === 1 + M.IMAGE_FALLBACK_MODELS.length, b.models.join(' > '));
  t('no extra_body', !('extra_body' in b));
  t('auth header + image part sent', f.calls[0].init.headers.Authorization === 'Bearer k' && b.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,')); }
// 2 custom primary is first and not duplicated
{ const f = scripted([J(200, okBody)()]); await M.generateImageWithFallback({ ...base, model: 'openai/gpt-5-image-mini', fetchImpl: f });
  const b = JSON.parse(f.calls[0].init.body);
  t('custom model leads chain, no duplicates', b.models[0] === 'openai/gpt-5-image-mini' && new Set(b.models).size === b.models.length, b.models.join(' > ')); }
// 3 retry 429 then success
{ const f = scripted([J(429, 'slow down')(), J(200, okBody)()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('429 then success is retried', r.ok && r.attempts === 2); }
// 4 retry 503 twice then success (maxRetries 2 => 3 attempts)
{ const f = scripted([J(503, 'x')(), J(502, 'x')(), J(200, okBody)()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('5xx x2 then success on 3rd attempt', r.ok && r.attempts === 3); }
// 5 exhausted retries
{ const f = scripted([J(503, 'x')()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('gives up after maxRetries with friendly 503', !r.ok && r.status === 503 && r.attempts === 3 && /temporarily unavailable/.test(r.error), r.error); }
// 6 401 must not retry
{ const f = scripted([J(401, 'bad key')()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('401 not retried, key message', !r.ok && r.status === 401 && f.calls.length === 1 && /key invalid/.test(r.error)); }
// 7 402 not retried
{ const f = scripted([J(402, 'no credits')()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('402 not retried, credits message', !r.ok && r.status === 402 && f.calls.length === 1 && /credits/.test(r.error)); }
// 8 400 moderation passes through detail, not retried
{ const f = scripted([J(400, 'content flagged by moderation')()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('400 not retried, detail preserved', !r.ok && r.status === 400 && f.calls.length === 1 && /moderation/.test(r.error)); }
// 9 200 text-only then success
{ const textOnly = { choices: [{ message: { content: 'I cannot do that' } }] }; const f = scripted([J(200, textOnly)(), J(200, okBody)()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('200 without image is retried then succeeds', r.ok && r.attempts === 2); }
// 10 200 text-only forever
{ const textOnly = { choices: [{ message: { content: 'nope' } }] }; const f = scripted([J(200, textOnly)()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('persistent text-only -> clear 502', !r.ok && r.status === 502 && /did not return an image/.test(r.error)); }
// 11 network error then success
{ const f = scripted([new TypeError('fetch failed'), J(200, okBody)()]); const r = await M.generateImageWithFallback({ ...base, fetchImpl: f });
  t('network error retried', r.ok && r.attempts === 2); }
// 12 timeout abort
{ const f = async (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const r = await M.generateImageWithFallback({ ...base, fetchImpl: f, timeoutMs: 20, maxRetries: 1 });
  t('hung request aborted -> 504', !r.ok && r.status === 504 && r.attempts === 2, r.error); }
// 13 Retry-After honored (sleep receives seconds*1000)
{ const slept = []; const f = scripted([J(429, 'x', { 'retry-after': '3' })(), J(200, okBody)()]);
  await M.generateImageWithFallback({ ...base, fetchImpl: f, sleep: async (ms) => slept.push(ms) });
  t('Retry-After: 3 -> waits 3000ms', slept[0] === 3000, 'slept ' + slept.join(',')); }
// 14 backoff grows and is capped
{ const a = M.backoffMs(0, 1000), b = M.backoffMs(3, 1000), c = M.backoffMs(20, 1000), d = M.backoffMs(0, 1000, '999');
  t('backoff: attempt0<=1000, attempt3 in [4000,8000], capped<=20000, header capped', a <= 1000 && b >= 4000 && b <= 8000 && c <= 20000 && d === 20000, `${a} ${b} ${c} ${d}`); }
// 15 response shapes
{ const x = M.extractImageDataUrl;
  t('shape: content array image_url', x({ choices: [{ message: { content: [{ type: 'image_url', image_url: { url: PNG } }] } }] }) === PNG);
  t('shape: inline_data', x({ choices: [{ message: { content: [{ inline_data: { mime_type: 'image/webp', data: 'QUJD' } }] } }] }) === 'data:image/webp;base64,QUJD');
  t('shape: base64 inside text', x({ choices: [{ message: { content: 'see ' + PNG + ' ok' } }] }) === PNG);
  t('shape: images[].url', x({ choices: [{ message: { images: [{ url: PNG }] } }] }) === PNG);
  t('shape: garbage -> null, never throws', x(null) === null && x({}) === null && x({ choices: [] }) === null && x({ choices: [{ message: { content: 42 } }] }) === null); }
// 16 every fallback model is image-output (guards against someone adding a text model)
{ const models = JSON.parse(fs.readFileSync(path.join(root, '..', 'work', 'or-models.json'), 'utf8')).data;
  const imgIds = new Set(models.filter((m) => (m.architecture?.output_modalities || []).includes('image')).map((m) => m.id));
  const all = [M.PRIMARY_IMAGE_MODEL, ...M.IMAGE_FALLBACK_MODELS];
  t('every pool model can output images (live OpenRouter catalog)', all.every((id) => imgIds.has(id)), all.map((id) => id + (imgIds.has(id) ? '' : ' MISSING')).join(', ')); }
console.log(fails ? `\n${fails} FAILED` : '\nALL OPENROUTER POOL CHECKS PASSED');
process.exit(fails ? 1 : 0);
