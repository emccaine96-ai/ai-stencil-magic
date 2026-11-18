// Runs the existing classical test modules by calling their exported runAllTests() (they do nothing when executed as scripts).
// ImageData is a browser global, so a minimal stand-in is provided. Exit code is non-zero if any suite fails or finds no tests.
(globalThis as any).ImageData = class { data: Uint8ClampedArray; width: number; height: number;
  constructor(a: any, b: number, c?: number) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c as number; } } };
const suites = ['regression', 'hatching', 'fscore', 'flow-modulation'];
let bad = 0;
for (const name of suites) {
  const mod: any = await import(`../src/lib/classical/tests/${name}.test.js`);
  const fn = mod.runAllTests ?? mod.default;
  if (typeof fn !== 'function') { console.log(`${name.padEnd(16)} NO runAllTests EXPORT (cannot run)`); bad++; continue; }
  const r = await fn();
  const passed = r?.passed ?? r?.pass ?? 0, failed = r?.failed ?? r?.fail ?? (r?.failures?.length ?? 0);
  console.log(`${name.padEnd(16)} passed ${passed}, failed ${failed}${failed ? '  ' + JSON.stringify(r.failures ?? r).slice(0, 200) : ''}`);
  if (failed || passed === 0) bad++;
}
console.log(bad ? `\n${bad} suite(s) failed or empty` : '\nALL CLASSICAL SUITES PASSED'); process.exit(bad ? 1 : 0);
