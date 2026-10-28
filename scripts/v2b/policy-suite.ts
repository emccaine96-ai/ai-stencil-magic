import sharp from "sharp";
import { prepareV2, renderV2, exportV2 } from "../../src/lib/classical-v2b/pipeline";
import { DEFAULT_TUNING, tuningToOptions } from "../../src/lib/classical-v2b/tuning";
import { v2AnalysisSize, V2_ANALYSIS_EDGE, V2_MAX_ANALYSIS_EDGE } from "../../src/lib/classical-v2b/limits";
import { xdogInk } from "../../src/lib/classical-v2b/xdog";
let pass = 0, fail = 0; const fails: string[] = [];
const check = (n: string, ok: boolean, d = "") => { if (ok) pass++; else { fail++; fails.push(n + (d ? " :: " + d : "")); } };
const throws = (f: () => any) => { try { f(); return false; } catch { return true; } };

// ---- size policy ----
check("analysis size: 4000x3000 -> long edge 1280", (() => { const s = v2AnalysisSize(4000, 3000); return s.width === 1280 && s.height === 960; })());
check("analysis size: portrait 3024x4032 -> 960x1280", (() => { const s = v2AnalysisSize(3024, 4032); return s.width === 960 && s.height === 1280; })());
check("analysis size: never upscales", (() => { const s = v2AnalysisSize(300, 200); return s.width === 300 && s.height === 200; })());
check("analysis size: extreme aspect keeps >=1px", (() => { const s = v2AnalysisSize(10000, 10); return s.width === 1280 && s.height >= 1; })());
check("analysis size rejects 0/NaN/neg/float dims", throws(() => v2AnalysisSize(0, 5)) && throws(() => v2AnalysisSize(NaN, 5)) && throws(() => v2AnalysisSize(-3, 5)) && throws(() => v2AnalysisSize(5.5, 5)));
check("analysis size rejects bad edge", throws(() => v2AnalysisSize(100, 100, NaN)) && throws(() => v2AnalysisSize(100, 100, 10)));
// ---- hard limits enforced by prepareV2 / exportV2 ----
check("prepareV2 rejects 3000px edge (no allocation attempted)", throws(() => prepareV2(new Uint8ClampedArray(4), 3000, 1)) === true);
check("prepareV2 rejects pixel-count over limit", throws(() => prepareV2(new Uint8ClampedArray(4), 2400, 2401)));
check("prepareV2 rejects 4x4 (too small)", throws(() => prepareV2(new Uint8ClampedArray(64), 4, 4)));
check("prepareV2 rejects wrong RGBA length", throws(() => prepareV2(new Uint8ClampedArray(10), 100, 100)));
check("prepareV2 rejects NaN dims", throws(() => prepareV2(new Uint8ClampedArray(0), NaN, 10)));
const meta = await sharp("public/examples/portrait-before.jpg").metadata();
const mk = async (edge: number) => { const s = edge / Math.max(meta.width!, meta.height!); const w = Math.round(meta.width! * s), h = Math.round(meta.height! * s); const raw = await sharp("public/examples/portrait-before.jpg").resize(w, h).ensureAlpha().raw().toBuffer(); const pre = prepareV2(new Uint8ClampedArray(raw), w, h); return { w, h, pre, r: renderV2(pre, tuningToOptions(DEFAULT_TUNING, pre.darkKeyed)) }; };
const a = await mk(600);
check("exportV2 rejects over-limit export size", throws(() => exportV2(a.r, { width: a.w * 20, height: a.h * 20, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 })));
// ---- ink scale invariance after the XDoG fix (the bug) ----
const inks: number[] = [];
for (const e of [512, 768, 1024, 1280]) { const m = await mk(e); let n = 0; for (let i = 0; i < m.r.ink.length; i++) if (m.r.ink[i] > 0.5) n++; inks.push(100 * n / m.r.ink.length); }
check("ink% stable across 512..1280 analysis (max/min < 1.10)", Math.max(...inks) / Math.min(...inks) < 1.10, inks.map(v => v.toFixed(2)).join(" "));
// ---- xdog scale arg ----
{ const w = 64, h = 64, t = new Float32Array(w * h).fill(0.6); for (let y = 0; y < h; y++) for (let x = 30; x < 34; x++) t[y * w + x] = 0.1;
  check("xdog rejects scale<=0 / NaN", throws(() => xdogInk(t, w, h, {}, 0.5, 0)) && throws(() => xdogInk(t, w, h, {}, 0.5, NaN)) && throws(() => xdogInk(t, w, h, {}, 0.5, -1)));
  const o1 = xdogInk(t, w, h, {}, 0.5, 1), o1b = xdogInk(t, w, h, {}, 0.5); let same = true; for (let i = 0; i < o1.length; i++) if (o1[i] !== o1b[i]) same = false;
  check("xdog scale=1 identical to default call", same); }
// ---- determinism + finite after change ----
{ const x = await mk(800), y = await mk(800); let same = true; for (let i = 0; i < x.r.ink.length; i++) if (x.r.ink[i] !== y.r.ink[i]) same = false; check("render deterministic after fix", same);
  let bad = 0; for (const arr of [x.pre.tone, x.pre.orientation, x.pre.trust, x.r.ink, x.r.lines]) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) bad++; check("no non-finite values", bad === 0); }
// ---- tuning option sanity ----
{ const x = await mk(600);
  for (const [name, t] of [["strokeWeight -3", { ...DEFAULT_TUNING, strokeWeight: -3 }], ["strokeWeight +3", { ...DEFAULT_TUNING, strokeWeight: 3 }], ["hatchSpacing +3", { ...DEFAULT_TUNING, hatchSpacing: 3 }], ["hatchSpacing -3", { ...DEFAULT_TUNING, hatchSpacing: -3 }], ["shadingStart +3", { ...DEFAULT_TUNING, shadingStart: 3 }], ["shadingStart -3", { ...DEFAULT_TUNING, shadingStart: -3 }], ["speckCleanup 0", { ...DEFAULT_TUNING, speckCleanup: 0 }], ["speckCleanup 1", { ...DEFAULT_TUNING, speckCleanup: 1 }], ["lineCrispness +2", { ...DEFAULT_TUNING, lineCrispness: 2 }], ["lineSensitivity +1", { ...DEFAULT_TUNING, lineSensitivity: 1 }]] as any) {
    let ok = true, bad = 0; try { const r = renderV2(x.pre, tuningToOptions(t, x.pre.darkKeyed)); for (let i = 0; i < r.ink.length; i++) if (!Number.isFinite(r.ink[i]) || r.ink[i] < -1e-6 || r.ink[i] > 1 + 1e-6) bad++; } catch (e) { ok = false; }
    check(`tuning extreme '${name}' renders finite and in [0,1]`, ok && bad === 0, String(bad)); } }
console.log(`POLICY SUITE: ${pass} passed, ${fail} failed`); for (const f of fails) console.log("  FAIL:", f); process.exit(fail ? 1 : 0);
