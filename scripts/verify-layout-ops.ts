import { cropImageData, resizeImageData, borderImageData, frameImageData, clampRect, centeredAspectRect } from '../src/lib/vault-ops/layout-ops';
(globalThis as any).ImageData = class { data: Uint8ClampedArray; width: number; height: number; colorSpace = 'srgb'; constructor(a: any, b: any, c?: any) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
let fails = 0; const ok = (n: string, c: boolean, e = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n.padEnd(56) + e); };
const mk = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) => { const im = new (globalThis as any).ImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const [r, g, b, a] = f(x, y); im.data[i] = r; im.data[i + 1] = g; im.data[i + 2] = b; im.data[i + 3] = a; } return im; };
const at = (im: any, x: number, y: number) => [...im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4)];
// pixel encodes its own coordinates so any shift is detectable
const coord = mk(40, 30, (x, y) => [x * 6, y * 8, 7, 255]);

let c = cropImageData(coord, { x: 10, y: 5, w: 20, h: 10 });
ok('crop size is 20x10', c.width === 20 && c.height === 10);
ok('crop top-left maps to source (10,5)', at(c, 0, 0)[0] === 60 && at(c, 0, 0)[1] === 40, JSON.stringify(at(c, 0, 0)));
ok('crop bottom-right maps to source (29,14)', at(c, 19, 9)[0] === 174 && at(c, 19, 9)[1] === 112, JSON.stringify(at(c, 19, 9)));
c = cropImageData(coord, { x: 30, y: 20, w: 100, h: 100 });
ok('oversize rect is clamped to the whole image (40x30)', c.width === 40 && c.height === 30, `${c.width}x${c.height}`);
c = cropImageData(coord, { x: 35, y: 25, w: 20, h: 10 });
ok('rect past the edge slides back, keeping its size (20x10)', c.width === 20 && c.height === 10 && at(c, 0, 0)[0] === 20 * 6 && at(c, 0, 0)[1] === 20 * 8, `${c.width}x${c.height} ${JSON.stringify(at(c, 0, 0))}`);
c = cropImageData(coord, { x: NaN, y: NaN, w: NaN, h: NaN });
ok('NaN rect never crashes or yields an empty image', c.width >= 1 && c.height >= 1, `${c.width}x${c.height}`);
c = cropImageData(coord, { x: -20, y: -20, w: 10, h: 10 });
ok('negative origin clamps to 0,0 and stays valid', c.width === 10 && c.height === 10 && at(c, 0, 0)[0] === 0);
c = cropImageData(coord, { x: 5, y: 5, w: 0, h: 0 });
ok('zero-size rect becomes 1x1, never empty', c.width === 1 && c.height === 1);
c = cropImageData(coord, { x: 0, y: 0, w: 40, h: 30 });
ok('full-size crop is pixel-identical', c.width === 40 && c.height === 30 && c.data.every((v: number, i: number) => v === coord.data[i]));
ok('crop does not mutate the source', coord.width === 40 && at(coord, 10, 5)[0] === 60);

const a11 = centeredAspectRect(1000, 600, 1); ok('1:1 of 1000x600 = 600x600 centred', a11.w === 600 && a11.h === 600 && a11.x === 200 && a11.y === 0, JSON.stringify(a11));
const a45 = centeredAspectRect(1000, 1000, 4 / 5); ok('4:5 of square = 800x1000', a45.w === 800 && a45.h === 1000 && a45.x === 100, JSON.stringify(a45));
const a169 = centeredAspectRect(600, 1000, 16 / 9); ok('16:9 of portrait fits the width (600x338)', a169.w === 600 && a169.h === 338, JSON.stringify(a169));

let r = resizeImageData(coord, 80, 60); ok('resize up gives 80x60', r.width === 80 && r.height === 60);
r = resizeImageData(coord, 20, 15); ok('resize down gives 20x15', r.width === 20 && r.height === 15);
r = resizeImageData(coord, 0, -5); ok('zero/negative size is clamped to 1x1', r.width === 1 && r.height === 1);
r = resizeImageData(coord, 99999, 99999, 64); ok('huge size is capped by maxSide', r.width === 64 && r.height === 64);
const flat = mk(20, 20, () => [120, 60, 200, 255]); r = resizeImageData(flat, 50, 50);
ok('resize keeps a flat colour exactly', at(r, 25, 25).join() === '120,60,200,255' && at(r, 0, 0).join() === '120,60,200,255', at(r, 0, 0).join());
const ramp = mk(40, 30, (x) => [x * 6, 0, 0, 255]); r = resizeImageData(ramp, 80, 60);
ok('resize keeps left dark / right bright', at(r, 2, 30)[0] < at(r, 77, 30)[0] && at(r, 77, 30)[0] > 200);

const white = mk(50, 40, () => [255, 255, 255, 255]);
let b = borderImageData(white, 6, '#ff0000');
ok('border paints edges red', at(b, 0, 0).join() === '255,0,0,255' && at(b, 49, 39).join() === '255,0,0,255' && at(b, 5, 20)[1] === 0);
ok('border leaves the interior untouched', at(b, 6, 6).join() === '255,255,255,255' && at(b, 25, 20).join() === '255,255,255,255');
ok('border keeps canvas size', b.width === 50 && b.height === 40);
b = borderImageData(white, 999, '#000000'); ok('oversize border is capped, no crash, fills at most the whole image', b.width === 50 && at(b, 25, 20)[0] === 0);
b = borderImageData(white, 0, '#000'); ok('zero border is a copy', b.data.every((v: number) => v === 255));
b = borderImageData(white, 4, 'garbage'); ok('bad colour falls back to near-black', at(b, 0, 0)[0] === 13);
ok('border does not mutate the source', at(white, 0, 0).join() === '255,255,255,255');

let f = frameImageData(white, 12, 0, '#000');
ok('frame: corner pixel becomes transparent', at(f, 0, 0)[3] === 0, `alpha ${at(f, 0, 0)[3]}`);
ok('frame: centre stays opaque', at(f, 25, 20)[3] === 255);
ok('frame: straight edge midpoint stays opaque', at(f, 25, 0)[3] === 255 && at(f, 0, 20)[3] === 255, `${at(f, 25, 0)[3]} ${at(f, 0, 20)[3]}`);
const soft = [...Array(12).keys()].map((i) => at(f, i, i)[3]); ok('frame: corner curve is anti-aliased (has partial alpha)', soft.some((v: number) => v > 0 && v < 255), soft.join(','));
f = frameImageData(white, 0, 0, '#000'); ok('radius 0 leaves everything opaque', f.data.every((v: number, i: number) => i % 4 !== 3 || v === 255));
f = frameImageData(white, 12, 5, '#0000ff'); ok('frame outline is coloured just inside the edge', at(f, 25, 2)[2] > at(f, 25, 2)[0], at(f, 25, 2).join());
f = frameImageData(white, 9999, 0, '#000'); ok('huge radius is capped to a pill/circle, no NaN', f.data.every((v: number) => Number.isFinite(v)) && at(f, 25, 20)[3] === 255);
console.log(fails ? `\n${fails} FAILED` : '\nALL LAYOUT CHECKS PASSED'); process.exit(fails ? 1 : 0);
