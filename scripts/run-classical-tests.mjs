// Runs the classical-engine suites under Node by supplying the browser ImageData global.
// Run: node scripts/run-classical-tests.mjs
globalThis.ImageData = class ImageData {
  constructor(a, b, c) {
    if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.data = a; this.width = b; this.height = c; }
  }
};
let totalFail = 0;
for (const name of ['regression', 'fscore', 'flow-modulation']) {
  const m = await import(new URL(`../src/lib/classical/tests/${name}.test.js`, import.meta.url));
  const r = await m.runAllTests();
  console.log(`${name.padEnd(16)} passed ${r.passed}  failed ${r.failed}`);
  for (const f of r.failures || []) console.log('   FAIL', f);
  totalFail += r.failed;
}
// hatching imports .ts with extensionless paths, so bundle it with esbuild first (as Vite does).
{
  const { execSync } = await import('node:child_process');
  const fs = await import('node:fs');
  fs.mkdirSync('.hatch-verify', { recursive: true });
  fs.writeFileSync('.hatch-verify/entry.js', `import { runAllTests } from '../src/lib/classical/tests/hatching.test.js';
const r = await runAllTests(); console.log(JSON.stringify({passed:r.passed,failed:r.failed,failures:r.failures})); process.exit(r.failed?1:0);`);
  execSync('npx esbuild .hatch-verify/entry.js --bundle --platform=node --format=esm --outfile=.hatch-verify/entry.mjs --log-level=error', { stdio: 'inherit' });
  let out = '';
  try { out = execSync('node .hatch-verify/entry.mjs', { encoding: 'utf8' }); } catch (e) { out = e.stdout || '{"passed":0,"failed":1,"failures":["hatching crashed"]}'; }
  const r = JSON.parse(out.trim().split('\n').pop());
  console.log(`${'hatching'.padEnd(16)} passed ${r.passed}  failed ${r.failed}`);
  for (const f of r.failures || []) console.log('   FAIL', f);
  totalFail += r.failed;
}
console.log(totalFail ? `\n${totalFail} FAILED` : '\nALL CLASSICAL ENGINE SUITES PASSED');
process.exit(totalFail ? 1 : 0);
