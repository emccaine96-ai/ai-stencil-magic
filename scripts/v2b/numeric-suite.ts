import { distanceInside, sampleBilinear, resampleBilinear, percentile, smoothstep, hash01, valueNoise } from "../../src/lib/classical-v2b/fieldops";
import { gaussian, bilateral, grayFromRGBA } from "../../src/lib/classical-v2b/filters";
import { clahe, prepOptionsFor, prepTone } from "../../src/lib/classical-v2b/tone";
import { xdogInk } from "../../src/lib/classical-v2b/xdog";
import { removeSmallComponents } from "../../src/lib/classical-v2b/cleanup";

let pass = 0, fail = 0; const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") { if (ok) pass++; else { fail++; failures.push(name + (detail ? " :: " + detail : "")); } }
const finite = (a: ArrayLike<number>) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };
let s = 99; const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;

// ---- Gaussian ----
{ const w = 40, h = 30, src = new Float32Array(w * h).fill(0.37);
  const g = gaussian(src, w, h, 3);
  let maxd = 0; for (let i = 0; i < g.length; i++) maxd = Math.max(maxd, Math.abs(g[i] - 0.37));
  check("gaussian preserves constant image (edge-clamped)", maxd < 1e-5, `maxdev ${maxd}`);
  const imp = new Float32Array(w * h); imp[15 * w + 20] = 1;
  const gi = gaussian(imp, w, h, 2); let sum = 0; for (const v of gi) sum += v;
  check("gaussian conserves mass of an impulse away from edges", Math.abs(sum - 1) < 1e-4, `sum ${sum}`);
  // measured sigma along x of impulse response
  let m2 = 0; for (let x = 0; x < w; x++) m2 += gi[15 * w + x] * (x - 20) ** 2; const rowMass = (() => { let r = 0; for (let x = 0; x < w; x++) r += gi[15 * w + x]; return r; })();
  const sigmaMeasured = Math.sqrt(m2 / rowMass);
  check("gaussian measured sigma ~ requested (2)", Math.abs(sigmaMeasured - 2) < 0.05, `measured ${sigmaMeasured.toFixed(3)}`);
  check("gaussian sigma<=0.01 returns copy not alias", gaussian(src, w, h, 0) !== src);
  let threw = false; try { gaussian(src, w, h, -1); } catch { threw = true; } check("gaussian rejects negative sigma", threw);
  threw = false; try { gaussian(src, w, h, NaN); } catch { threw = true; } check("gaussian rejects NaN sigma", threw);
  const orig = src.slice(); gaussian(src, w, h, 3); let same = true; for (let i = 0; i < src.length; i++) if (src[i] !== orig[i]) same = false; check("gaussian does not mutate input", same);
}
// ---- bilinear / pixel-centre mapping ----
{ const a = new Float32Array([0, 10, 20, 30]);
  check("bilinear exact at integer coords", sampleBilinear(a, 2, 2, 1, 0) === 10 && sampleBilinear(a, 2, 2, 0, 1) === 20);
  check("bilinear clamps below 0", sampleBilinear(a, 2, 2, -5, -5) === 0);
  check("bilinear clamps above max", sampleBilinear(a, 2, 2, 9, 9) === 30);
  const up = resampleBilinear(new Float32Array([5, 5, 5, 5]), 2, 2, 7, 5); let c = true; for (const v of up) if (Math.abs(v - 5) > 1e-6) c = false;
  check("resample preserves constants at non-integer ratio", c);
  // pixel-centre convention: 2x upsample of a ramp should map centres symmetrically
  const ramp = new Float32Array([0, 1]); const r2 = resampleBilinear(ramp, 2, 1, 4, 1);
  check("resample 2->4 pixel-centre mapping symmetric", Math.abs(r2[0] - 0) < 1e-6 && Math.abs(r2[3] - 1) < 1e-6 && Math.abs((r2[1] + r2[2]) - 1) < 1e-6, Array.from(r2).join(","));
  let t = false; try { resampleBilinear(new Float32Array(3), 2, 2, 2, 2); } catch { t = true; } check("resample rejects wrong-length source", t);
  t = false; try { resampleBilinear(new Float32Array(4), 2, 2, 0, 2); } catch { t = true; } check("resample rejects zero output dim", t);
}
// ---- percentile ties / NaN ----
{ const a = new Float32Array([1, 1, 1, 1, 1]); check("percentile of constant = constant", percentile(a, 0.5) === 1);
  check("percentile ignores NaN", percentile(new Float32Array([NaN, 2, 4]), 0.0) === 2);
  check("percentile of empty = 0", percentile(new Float32Array(0), 0.5) === 0);
  check("percentile fraction=1 returns max (no OOB)", percentile(new Float32Array([1, 2, 3]), 1) === 3);
  let t = false; try { percentile(a, NaN); } catch { t = true; } check("percentile rejects NaN fraction", t);
  t = false; try { percentile(a, 0.5, 0); } catch { t = true; } check("percentile rejects stride 0", t);
}
// ---- smoothstep / hash determinism ----
{ check("smoothstep endpoints", smoothstep(0, 1, -1) === 0 && smoothstep(0, 1, 2) === 1 && Math.abs(smoothstep(0, 1, 0.5) - 0.5) < 1e-9);
  check("smoothstep degenerate range finite", Number.isFinite(smoothstep(1, 1, 1)));
  check("hash01 deterministic", hash01(3, 4, 5) === hash01(3, 4, 5));
  let ok = true; for (let i = 0; i < 2000; i++) { const v = hash01(i, i * 7, 3); if (!(v >= 0 && v < 1)) ok = false; } check("hash01 in [0,1)", ok);
  check("valueNoise within [0,1]", (() => { for (let i = 0; i < 500; i++) { const v = valueNoise(rnd() * 50, rnd() * 50, 1); if (!(v >= 0 && v <= 1)) return false; } return true; })());
}
// ---- grayFromRGBA (alpha policy) ----
{ const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255, 128, 128, 128, 128]);
  const g = grayFromRGBA(px, 4, 1);
  check("gray: opaque red luma 0.299", Math.abs(g[0] - 0.299) < 1e-4, String(g[0]));
  check("gray: fully transparent -> white paper (1.0)", Math.abs(g[1] - 1) < 1e-6, String(g[1]));
  check("gray: opaque black -> 0", g[2] === 0);
  check("gray: half alpha grey blends toward white", g[3] > 128 / 255 && g[3] < 1, String(g[3]));
  let t = false; try { grayFromRGBA(new Uint8ClampedArray(7), 2, 1); } catch { t = true; } check("gray rejects wrong RGBA length", t);
}
// ---- bilateral ----
{ const w = 30, h = 30, src = new Float32Array(w * h).fill(0.5);
  const b = bilateral(src, w, h); let d = 0; for (let i = 0; i < b.length; i++) d = Math.max(d, Math.abs(b[i] - 0.5));
  check("bilateral preserves constants", d < 1e-5, String(d));
  const step = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) step[y * w + x] = x < 15 ? 0.1 : 0.9;
  const bs = bilateral(step, w, h); check("bilateral preserves a strong step edge", bs[10 * w + 14] < 0.15 && bs[10 * w + 15] > 0.85, `${bs[10 * w + 14]},${bs[10 * w + 15]}`);
  check("bilateral finite", finite(bs));
}
// ---- CLAHE ----
{ const w = 64, h = 64, src = new Float32Array(w * h); for (let i = 0; i < src.length; i++) src[i] = 0.4 + 0.1 * rnd();
  const c = clahe(src, w, h); let lo = 1, hi = 0; for (const v of c) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  check("clahe output finite and within [0,1]", finite(c) && lo >= -1e-6 && hi <= 1 + 1e-6, `${lo},${hi}`);
  const sc = Math.max(...src) - Math.min(...src), oc = hi - lo; check("clahe expands a low-contrast image", oc > sc, `${sc}->${oc}`);
  const odd = clahe(new Float32Array(37 * 53).fill(0.5), 37, 53); check("clahe handles non-multiple-of-grid dims, finite", finite(odd));
  const tiny = clahe(new Float32Array(3 * 3).fill(0.5), 3, 3); check("clahe on 3x3 finite (grid > size)", finite(tiny));
}
// ---- XDoG ----
{ const w = 64, h = 64, flat = new Float32Array(w * h).fill(0.8); const x = xdogInk(flat, w, h);
  let m = 0; for (const v of x) m = Math.max(m, v); check("xdog: flat white image gives no ink", m < 1e-3, String(m));
  const edge = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) edge[y * w + xx] = xx < 32 ? 0.1 : 0.9;
  const xe = xdogInk(edge, w, h); let near = 0, far = 0; for (let y = 0; y < h; y++) { near = Math.max(near, xe[y * w + 31], xe[y * w + 30]); far = Math.max(far, xe[y * w + 5]); }
  check("xdog: inks the dark side of an edge, not the flat interior", near > 0.5 && far < 0.05, `near ${near} far ${far}`);
  check("xdog finite & in [0,1]", finite(xe) && Math.min(...xe) >= 0 && Math.max(...xe) <= 1);
  const a = xdogInk(edge, w, h, {}, 0), b = xdogInk(edge, w, h, {}, 0.5); let df = 0; for (let i = 0; i < a.length; i++) df += Math.abs(a[i] - b[i]); check("xdog localAmount changes output", df > 0);
  check("xdog deterministic", (() => { const p = xdogInk(edge, w, h), q = xdogInk(edge, w, h); for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false; return true; })());
  const blank = xdogInk(new Float32Array(w * h), w, h); check("xdog all-black input finite", finite(blank));
}
// ---- removeSmallComponents (4-connectivity, threshold tie) ----
{ const w = 10, h = 10, ink = new Float32Array(w * h);
  ink[2 * w + 2] = 1; ink[3 * w + 3] = 1; // diagonal pair: two separate 4-connected comps of size 1
  ink[7 * w + 1] = ink[7 * w + 2] = ink[7 * w + 3] = 1; // size-3 run
  const o = removeSmallComponents(ink, w, h, 2, 0.4);
  check("cleanup: diagonal singletons removed under 4-connectivity", o[2 * w + 2] === 0 && o[3 * w + 3] === 0);
  check("cleanup: size-3 run kept at min 2", o[7 * w + 2] === 1);
  const tie = new Float32Array(w * h); tie[5 * w + 5] = 0.4; tie[5 * w + 6] = 0.4;
  const ot = removeSmallComponents(tie, w, h, 1, 0.4); let any = 0; for (const v of ot) any += v; check("cleanup: value exactly == threshold is NOT ink (strict >)", any === 0);
  const full = new Float32Array(w * h).fill(1); const of = removeSmallComponents(full, w, h, 1, 0.4); let ok = true; for (const v of of) if (v !== 1) ok = false; check("cleanup: all-ink image preserved", ok);
  const orig = ink.slice(); removeSmallComponents(ink, w, h, 2); let same = true; for (let i = 0; i < ink.length; i++) if (ink[i] !== orig[i]) same = false; check("cleanup does not mutate input", same);
  const big = new Float32Array(300 * 300).fill(1); let t = false; try { removeSmallComponents(big, 300, 300, 5); } catch { t = true; } check("cleanup: large all-ink does not overflow queue", !t);
}
// ---- prepTone dark policy ----
{ const w = 48, h = 48, dark = new Float32Array(w * h).fill(0.2), light = new Float32Array(w * h).fill(0.8);
  check("prepOptions: dark image -> protectShadows", prepOptionsFor(dark).protectShadows === true);
  check("prepOptions: light image -> not protected", prepOptionsFor(light).protectShadows === false);
  const t = prepTone(dark, w, h, prepOptionsFor(dark)); check("prepTone finite & in range", finite(t) && Math.min(...t) >= -1e-6 && Math.max(...t) <= 1 + 1e-6);
}
console.log(`NUMERIC SUITE: ${pass} passed, ${fail} failed`);
for (const f of failures) console.log("  FAIL:", f);
process.exit(fail ? 1 : 0);
