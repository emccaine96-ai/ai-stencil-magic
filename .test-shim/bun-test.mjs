// Minimal stand-in for bun:test so the real *.test.ts files can run under node in an environment without bun.
const tests = []; let current = '';
export const test = (name, fn) => tests.push([name, fn]);
export const mock = { module() {} };
export const afterEach = () => {}; export const beforeEach = () => {};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function expect(actual) {
  const api = {
    toBe: (e) => { if (!Object.is(actual, e)) throw new Error(`expected ${JSON.stringify(actual)?.slice(0,120)} toBe ${JSON.stringify(e)?.slice(0,120)}`); },
    toEqual: (e) => { if (!eq(actual, e)) throw new Error(`expected ${JSON.stringify(actual)?.slice(0,160)} toEqual ${JSON.stringify(e)?.slice(0,160)}`); },
    toBeGreaterThan: (e) => { if (!(actual > e)) throw new Error(`expected ${actual} > ${e}`); },
    toBeLessThan: (e) => { if (!(actual < e)) throw new Error(`expected ${actual} < ${e}`); },
    toBeLessThanOrEqual: (e) => { if (!(actual <= e)) throw new Error(`expected ${actual} <= ${e}`); },
    toBeGreaterThanOrEqual: (e) => { if (!(actual >= e)) throw new Error(`expected ${actual} >= ${e}`); },
    toBeNull: () => { if (actual !== null) throw new Error(`expected null, got ${JSON.stringify(actual)}`); },
    toBeUndefined: () => { if (actual !== undefined) throw new Error(`expected undefined, got ${JSON.stringify(actual)}`); },
    toBeTruthy: () => { if (!actual) throw new Error(`expected truthy, got ${JSON.stringify(actual)}`); },
    toBeDefined: () => { if (actual === undefined) throw new Error('expected defined'); },
    toContain: (e) => { if (!(typeof actual === 'string' ? actual.includes(e) : actual.includes(e))) throw new Error(`expected ${JSON.stringify(actual)?.slice(0,120)} toContain ${JSON.stringify(e)}`); },
    toHaveLength: (e) => { if (actual.length !== e) throw new Error(`expected length ${actual.length} toBe ${e}`); },
  };
  api.not = {
    toBe: (e) => { if (Object.is(actual, e)) throw new Error(`expected value not toBe ${JSON.stringify(e)?.slice(0,120)}`); },
    toEqual: (e) => { if (eq(actual, e)) throw new Error('expected values not toEqual'); },
    toContain: (e) => { if (actual.includes(e)) throw new Error(`expected not toContain ${JSON.stringify(e)}`); },
  };
  return api;
}
export async function __run(file) {
  let pass = 0, fail = 0;
  for (const [name, fn] of tests) { try { await fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
  console.log(`\n${file}: ${pass} passed, ${fail} failed`);
  if (pass + fail === 0) { console.log('ERROR: no tests were registered (a run with zero tests is a failure, not a pass)'); process.exit(3); }
  process.exit(fail ? 1 : 0);
}
