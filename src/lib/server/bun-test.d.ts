// Type declaration for the subset of `bun:test` used by the server tests, so `tsc` can check them without adding a dependency
// (bun's own types are not installed in this repo). The tests run under bun in the owner's environment, or under node via
// scripts/run-test-node.sh, which substitutes .test-shim/bun-test.mjs.
declare module "bun:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export const mock: { module(path: string, factory: () => unknown): void };
  interface Matchers<R = void> {
    toBe(expected: unknown): R;
    toEqual(expected: unknown): R;
    toBeGreaterThan(n: number): R;
    toBeGreaterThanOrEqual(n: number): R;
    toBeLessThan(n: number): R;
    toBeLessThanOrEqual(n: number): R;
    toBeNull(): R;
    toBeUndefined(): R;
    toBeDefined(): R;
    toBeTruthy(): R;
    toContain(item: unknown): R;
    toHaveLength(n: number): R;
  }
  export function expect(actual: unknown): Matchers & { not: Matchers };
}
