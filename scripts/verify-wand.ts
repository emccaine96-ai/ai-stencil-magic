import { createMask, magicWand, isEmpty, maskBounds, featherMask } from '../src/lib/selection';
(globalThis as any).ImageData = class { data: Uint8ClampedArray; width: number; height: number; constructor(a: any, b: any, c?: any) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
const W = 100, H = 80; let fails = 0;
const ok = (n: string, c: boolean, e = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n.padEnd(52) + e); };
const img = new (globalThis as any).ImageData(W, H);
const px = (x: number, y: number, v: number) => { const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, 255);                      // white paper
for (let y = 20; y < 50; y++) for (let x = 20; x < 50; x++) px(x, y, 30);                    // dark square A
for (let y = 20; y < 50; y++) for (let x = 60; x < 90; x++) px(x, y, 30);                    // dark square B (separate)
const count = (m: any) => m.data.reduce((n: number, v: number) => n + (v ? 1 : 0), 0);

let m = createMask(W, H); magicWand(m, img, 30, 30, 20, true);
ok('contiguous wand selects only square A (900 px)', count(m) === 900, `${count(m)}`);
ok('square B not selected when contiguous', m.data[30 * W + 70] === 0);
const b = maskBounds(m)!; ok('bounds are exactly 20,20 30x30', b.x === 20 && b.y === 20 && b.w === 30 && b.h === 30, JSON.stringify(b));
m = createMask(W, H); magicWand(m, img, 30, 30, 20, false);
ok('non-contiguous selects both squares (1800 px)', count(m) === 1800, `${count(m)}`);
m = createMask(W, H); magicWand(m, img, 5, 5, 20, true);
ok('tap on paper selects the paper (8000-1800)', count(m) === 6200, `${count(m)}`);
m = createMask(W, H); magicWand(m, img, -1, 5, 20); ok('out-of-bounds tap is a no-op', isEmpty(m));
m = createMask(W, H); magicWand(m, img, 30, 30, 0, true); ok('tolerance 0 still selects the flat region', count(m) === 900, `${count(m)}`);
m = createMask(W, H); magicWand(m, img, 30, 30, 255, true); ok('tolerance 255 selects everything', count(m) === W * H, `${count(m)}`);
m = createMask(W, H); magicWand(m, img, 30, 30, 20, true); featherMask(m, 3);
ok('feather keeps the centre solid', m.data[35 * W + 35] === 255); ok('feather softens the edge', m.data[35 * W + 20] > 0 && m.data[35 * W + 20] < 255, `${m.data[35 * W + 20]}`);
console.log(fails ? `\n${fails} FAILED` : '\nALL WAND CHECKS PASSED'); process.exit(fails ? 1 : 0);
