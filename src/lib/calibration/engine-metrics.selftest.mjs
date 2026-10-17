// Self-test: run with  node src/lib/calibration/engine-metrics.selftest.mjs  (synthetic images only, no browser needed)
import * as L from './engine-metrics.js';
const mk = (w, h, fn) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r,g,b,a] = fn(x,y); const i=(y*w+x)*4; d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=a; } return { width: w, height: h, data: d }; };
const PURPLE = [168, 85, 247, 255], WHITE = [255,255,255,255], CLEAR = [0,0,0,0];
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, t) => Math.abs(a - b) <= t;

// diagonal stripes, purple on transparent vs purple on white: identical masks
const stripes = (bg) => mk(256, 256, (x, y) => ((x + y) % 16 < 3 ? PURPLE : bg));
const a = L.scorePair(stripes(CLEAR), stripes(WHITE));
ok(near(a.f1_1, 1, 1e-9) && near(a.orientJS, 0, 1e-6) && near(a.blockCorr, 1, 1e-6), `identical strokes (transparent vs white bg): f1=${a.f1_1} js=${a.orientJS.toFixed(4)} corr=${a.blockCorr}`);
ok(a.predCoverage > 0.1, 'purple counted as ink (luminance trap avoided): cov=' + a.predCoverage.toFixed(3));

// blank vs filled
const blank = mk(128, 128, () => WHITE), filled = mk(128, 128, () => PURPLE);
const b = L.scorePair(blank, filled);
ok(b.coverageRatio === 0 && b.recall1 === 0, 'blank vs filled: ratio 0 recall 0');

// 3 px line width
const line = mk(200, 200, (x, y) => (y >= 98 && y < 101 ? PURPLE : WHITE));
const w3 = L.strokeWidth(L.inkMask(line), 200, 200);
ok(near(w3.widthMedian, 3, 1), `3-px line median width ${w3.widthMedian.toFixed(2)}`);
const w1 = L.strokeWidth(L.inkMask(mk(200,200,(x,y)=>(y===100?PURPLE:WHITE))), 200, 200);
ok(near(w1.widthMedian, 1, 0.5), `1-px line median width ${w1.widthMedian.toFixed(2)}`);

// orientation: horizontal vs vertical stripes are far apart; same orientation near 0
const hz = mk(256,256,(x,y)=>(y%10<2?PURPLE:WHITE)), vt = mk(256,256,(x,y)=>(x%10<2?PURPLE:WHITE));
const od = L.scorePair(hz, vt), os = L.scorePair(hz, hz);
ok(od.orientJS > 0.8 && os.orientJS < 0.02, `orientation JS orthogonal=${od.orientJS.toFixed(3)} same=${os.orientJS.toFixed(3)}`);

// fragmentation: 100 isolated 1-px dots are all specks
const dots = mk(200,200,(x,y)=>(x%20===5&&y%20===5?PURPLE:WHITE));
const cs = L.componentStats(L.inkMask(dots),200,200);
ok(cs.specks100k > 0 && Math.abs(cs.specks100k - 100*1e5/(200*200)) < 1e-6, `dots are specks: ${cs.specks100k}`);

// highlight noise: pred inks where reference is blank
const hn = L.scorePair(filled, blank);
ok(hn.highlightNoise === 1, 'highlightNoise=1 when ink where ref white');

// offEdgeInk: source with one vertical edge; ink far from it is off-edge
const src = mk(256,256,(x)=>(x<128?[0,0,0,255]:[255,255,255,255]));
const nearInk = L.offEdgeInk(L.inkMask(mk(256,256,(x)=>(x>=126&&x<130?PURPLE:WHITE))), src,256,256);
const farInk = L.offEdgeInk(L.inkMask(mk(256,256,(x)=>(x>=20&&x<24?PURPLE:WHITE))), src,256,256);
ok(nearInk.offEdgeInk < 0.05 && farInk.offEdgeInk > 0.95, `offEdgeInk near=${nearInk.offEdgeInk.toFixed(2)} far=${farInk.offEdgeInk.toFixed(2)}`);

// resample: differing sizes handled
const big = stripes(WHITE), small = mk(128,128,(x,y)=>(((x*2)+(y*2))%16<3?PURPLE:WHITE));
const rs = L.scorePair(small, big); ok(Number.isFinite(rs.f1_2) && rs.f1_2 > 0.5, `mixed sizes ok f1_2=${rs.f1_2.toFixed(3)}`);

// summary/diff
const rows=[{x:1,y:2},{x:3,y:4}]; const m=L.meanRow(rows); ok(m.x===2&&m.y===3,'meanRow');
const cmp=L.compareSummaries({summary:{s:{x:1}}},{summary:{s:{x:1.5}}}); ok(cmp.s.x===0.5,'compareSummaries');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails?1:0);
