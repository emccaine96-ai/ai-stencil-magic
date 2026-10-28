import sharp from "sharp";
import { prepareV2, renderV2, exportV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { if (ok) pass++; else { fail++; fails.push(n + (d ? " :: " + d : "")); } };
const img = sharp("public/examples/portrait-before.jpg").rotate();
const W = 400, H = 500;
const raw = await img.resize(W, H).ensureAlpha().raw().toBuffer(); const rgba = new Uint8ClampedArray(raw);
const pre = prepareV2(rgba, W, H); const opts = tuningToOptions(DEFAULT_TUNING, pre.darkKeyed); const r = renderV2(pre, opts);
const spec = (E: number, extra: any = {}) => ({ width: Math.round(W * E), height: Math.round(H * E), minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5, ...extra });
const count = (m: Uint8ClampedArray) => { let n = 0; for (const v of m) if (v) n++; return n; };
const binary = (m: Uint8ClampedArray) => { for (const v of m) if (v !== 0 && v !== 255) return false; return true; };

// determinism
const a = exportV2(r, spec(2)), b = exportV2(r, spec(2)); let same = a.length === b.length; for (let i = 0; i < a.length && same; i++) if (a[i] !== b[i]) same = false;
check("export deterministic (same render, same spec)", same);
const r2 = renderV2(pre, opts); const c = exportV2(r2, spec(2)); let same2 = true; for (let i = 0; i < a.length; i++) if (a[i] !== c[i]) { same2 = false; break; }
check("full re-render + export deterministic", same2);
// binary at several scales
for (const E of [1, 1.5, 2, 3]) { const m = exportV2(r, spec(E)); check(`export binary at ${E}x`, binary(m) && m.length === Math.round(W * E) * Math.round(H * E)); }
// downscale (0.5x)
const dn = exportV2(r, spec(0.5)); check("export at 0.5x downscale works, binary", binary(dn) && dn.length === 200 * 250);
// ink fraction should be roughly scale-invariant
const f1 = count(exportV2(r, spec(1))) / (W * H), f2 = count(exportV2(r, spec(2))) / (W * H * 4), f3 = count(exportV2(r, spec(3))) / (W * H * 9);
check("ink fraction roughly stable 1x/2x/3x (within 35% rel.)", Math.max(f1, f2, f3) / Math.min(f1, f2, f3) < 1.35, `${f1.toFixed(3)} ${f2.toFixed(3)} ${f3.toFixed(3)}`);
// exclusion: full-exclusion => empty; half => zero ink in excluded half
const full = new Uint8Array(W * H).fill(1); check("full exclusion => zero ink", count(exportV2(r, spec(2, { exclusion: full }))) === 0);
const half = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) half[y * W + x] = 1;
const mh = exportV2(r, spec(2, { exclusion: half })); const E = 2; let leakL = 0, inkR = 0; for (let y = 0; y < H * E; y++) for (let x = 0; x < W * E; x++) { if (mh[y * W * E + x]) { if (x < W) leakL++; else inkR++; } }
check("half exclusion: no ink in excluded half", leakL === 0, `leak ${leakL}`); check("half exclusion: ink remains in other half", inkR > 1000, `${inkR}`);
// exclusion boundary exactness: column at x=W/2 analysis -> export x=W
const none = exportV2(r, spec(2)); let diffOutside = 0; for (let y = 0; y < H * E; y++) for (let x = W; x < W * E; x++) if (none[y * W * E + x] !== mh[y * W * E + x]) diffOutside++;
check("exclusion does not alter non-excluded pixels", diffOutside === 0, `${diffOutside} px differ`);
// wrong-length exclusion rejected
let t = false; try { exportV2(r, spec(2, { exclusion: new Uint8Array(10) })); } catch { t = true; } check("rejects wrong-length exclusion", t);
// aspect mismatch rejected
t = false; try { exportV2(r, { width: 900, height: 900, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 }); } catch { t = true; } check("rejects >1% aspect mismatch", t);
// invalid params
for (const [k, v] of [["minimumHatchWidthPx", 0], ["minimumHatchWidthPx", -1], ["minimumHatchWidthPx", NaN], ["minimumHatchRunPx", -1], ["minimumHatchRunPx", NaN]] as any) { t = false; try { exportV2(r, spec(2, { [k]: v })); } catch { t = true; } check(`rejects ${k}=${v}`, t); }
t = false; try { exportV2(r, spec(0)); } catch { t = true; } check("rejects zero-size export", t);
// minimum run length monotonic: larger min run => <= ink
const lo = count(exportV2(r, spec(2, { minimumHatchRunPx: 2 }))), hi = count(exportV2(r, spec(2, { minimumHatchRunPx: 40 })));
check("larger minimumHatchRunPx never increases ink", hi <= lo, `${lo} -> ${hi}`);
// min width monotonic
const w1 = count(exportV2(r, spec(2, { minimumHatchWidthPx: 1 }))), w3 = count(exportV2(r, spec(2, { minimumHatchWidthPx: 3 })));
check("thicker minimum width => more ink", w3 > w1, `${w1} -> ${w3}`);
// support threshold monotonic
const s1 = count(exportV2(r, spec(2, { hatchSupportThreshold: 0.2 }))), s9 = count(exportV2(r, spec(2, { hatchSupportThreshold: 0.9 })));
check("higher support threshold => no more ink", s9 <= s1, `${s1} -> ${s9}`);
// render input immutability
const toneCopy = pre.tone.slice(); renderV2(pre, opts); let imm = true; for (let i = 0; i < toneCopy.length; i++) if (toneCopy[i] !== pre.tone[i]) imm = false; check("render does not mutate prepared tone", imm);
console.log(`EXPORT SUITE: ${pass} passed, ${fail} failed`); for (const f of fails) console.log("  FAIL:", f); process.exit(fail ? 1 : 0);
