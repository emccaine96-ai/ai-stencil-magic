// Real-browser checks for the Vault dock. Run: npx vite dev --port 5199, then  node scripts/browser/dock-harness.mjs  (PLAN=pro to test as a subscriber).
// Needs: npm i --no-save puppeteer-core, and Chrome (CHROME_PATH to override).
import puppeteer from 'puppeteer-core';
const URL = 'http://127.0.0.1:5199/vault';
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const p = await b.newPage(); await p.setViewport({ width: 420, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200))); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });

const PLAN = process.env.PLAN || 'free';
if (PLAN === 'pro') {
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (r.method() === 'OPTIONS' && /supabase\.co/.test(u)) return r.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (/\/rest\/v1\/subscriptions/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify({ tier: 'pro', status: 'active' }) });
    if (/\/auth\/v1\/user/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'u-pro', aud: 'authenticated', role: 'authenticated', email: 'pro@test.dev' }) });
    r.continue();
  });
  await p.evaluateOnNewDocument(() => { const k = Object.keys(localStorage).find(x => /auth-token/.test(x)); const key = 'sb-gaxgrffbgizrsnqkmgne-auth-token'; localStorage.setItem(key, JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1LXBybyIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImVtYWlsIjoicHJvQHRlc3QuZGV2IiwiZXhwIjoxNzk0NTM5MTI5fQ.sig', refresh_token: 'r', expires_at: 1794539129, expires_in: 2592000, token_type: 'bearer', user: { id: 'u-pro', aud: 'authenticated', email: 'pro@test.dev' } })); });
}
globalThis.PLAN = PLAN;
await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const t = (n, ok, e = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n.padEnd(46) + e); };

// open the editor
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /Free Draw/.test(x.innerText))?.click());
await p.waitForSelector('canvas', { timeout: 15000 }); await sleep(1200);

// paint a known asymmetric pattern straight onto the editor canvas (the second canvas is the artwork)
const dims = await p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); return { w: c.width, h: c.height }; });
console.log('editor canvas', dims.w + 'x' + dims.h);
const paint = () => p.evaluate(() => {
  const c = [...document.querySelectorAll('canvas')].at(-1); const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#000'; x.fillRect(40, 60, 120, 30);      // bar top-left
  x.fillStyle = '#7e22ce'; x.fillRect(c.width - 90, c.height - 80, 50, 50); // purple block bottom-right
});
const px = (X, Y) => p.evaluate((X, Y) => { const c = [...document.querySelectorAll('canvas')].at(-1); const d = c.getContext('2d').getImageData(X, Y, 1, 1).data; return [d[0], d[1], d[2], d[3]]; }, X, Y);
const size = () => p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); return [c.width, c.height]; });
const hash = () => p.evaluate(() => { const c = [...document.querySelectorAll('canvas')].at(-1); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; });
const undoBtn = () => p.evaluate(() => { const u = document.querySelector('button[aria-label="Undo"]'); u?.click(); return !!u; });

// click a dock action by category + label
const SINGLE = new Set(['Remove BG', 'Cutout', 'Text', 'Border', 'Mask', 'Frame', 'Sticker', 'Reference', 'Brushes', 'Draw', 'Shape Mask', 'Callout', 'Lens', 'Plugins', 'Try On', 'Library']);
async function dock(cat, label) {
  // Single-action categories run on the first tap, so never tap the label a second time.
  if (cat === label && SINGLE.has(cat)) {
    const ok = await p.evaluate((cat) => { const t = [...document.querySelectorAll('[data-picsart-dock] button')].find(x => x.innerText.trim().split('\n').at(-1).trim() === cat); t?.click(); return !!t; }, cat);
    await sleep(500); return ok;
  }
  await p.evaluate((cat) => { const bs = [...document.querySelectorAll('[data-picsart-dock] button')]; bs.find(x => x.innerText.trim() === cat)?.click(); }, cat);
  await sleep(250);
  const ok = await p.evaluate((label) => { const bs = [...document.querySelectorAll('[data-picsart-dock] button')]; const m = bs.filter(x => x.innerText.trim().split('\n').at(-1).trim() === label); const target = m.at(-1); target?.click(); return !!target; }, label);
  await sleep(500);
  return ok;
}
globalThis.H = { p, dock, paint, px, size, hash, undoBtn, sleep, t, dims, errs, b, fails: () => fails };
await import('./dock-cases.mjs');
console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.slice(0, 6).join('\n') : '\nno page errors');
console.log(globalThis.H.fails() ? `\n${globalThis.H.fails()} FAILED` : '\nALL BROWSER CHECKS PASSED');
await b.close(); process.exit(globalThis.H.fails() ? 1 : 0);
