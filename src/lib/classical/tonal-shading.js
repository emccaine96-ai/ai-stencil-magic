/**
 * Tonal-Form Shading (opt-in, additive).
 *
 * Produces a binary ink layer whose LOCAL INK COVERAGE matches the photo's local darkness
 * (light -> dark transitions are smooth and proportional) and whose strokes WRAP the form:
 * stroke direction follows iso-tone contours of the large-scale shading (i.e. perpendicular
 * to the light gradient, which is how an artist hatches a sphere/cheek/arm), blended with
 * true edge tangents where a hard edge exists.
 *
 * How tone accuracy is achieved (not just "denser in the dark"):
 *   1. darkness -> target coverage curve (paper floor, dot-gain gamma, ceiling).
 *   2. coverage -> stroke spacing (spacing = effective stroke width / coverage).
 *   3. up to 3 crossed hatch tiers add so that 1-(1-cA)(1-cB)(1-cC) = target.
 *   4. CLOSED LOOP: render, measure achieved coverage per block, correct per-block gain,
 *      re-render, keep the best pass. This is what stops it over- or under-shading.
 *
 * Self-contained except for streamlineHatch (existing repo module, not modified).
 * Pure function: same input => same output (streamlineHatch is deterministic).
 */
import { streamlineHatch } from '../classical-engine/streamline-hatch.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const TONAL_DEFAULTS = {
  strength: 1.0,          // 0..1.5 global multiplier on target coverage
  paperDark: 0.08,        // darkness below this stays paper (no ink)
  maxCoverage: 0.78,      // ceiling so shadows stay tattoo-able, never a solid mass
  gamma: 1.15,            // >1 = lighter mids (compensates stroke/dot gain)
  whiteAnchor: 0.85,      // 0 = absolute white (1.0), 1 = image's own p97 white point
  baseAngle: Math.PI / 4, // direction used only where the image has no shading gradient
  crossAngle: Math.PI / 3,
  formScale: 0.018,       // large-scale (form) smoothing sigma as a fraction of long edge
  edgeScale: 0.005,       // fine (edge) smoothing sigma
  edgePull: 0.6,          // 0 = pure form-wrapping, 1+ = hug hard edges more
  calibrationPasses: 1,   // extra closed-loop passes (0 = single render)
  blockFrac: 0.022,       // calibration block size as a fraction of long edge
  sepFrac: 0.8,           // stroke evenness (higher = more even spacing)
  strokeWidth: 0,         // 0 = auto from image size (1, 3 or 5 px)
};

/* ---------- small image helpers (float, clamped edges) ---------- */
function boxBlurH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[o + clamp(i, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc * inv;
      acc += src[o + clamp(x + r + 1, 0, w - 1)] - src[o + clamp(x - r, 0, w - 1)];
    }
  }
}
function boxBlurV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[clamp(i, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      acc += src[clamp(y + r + 1, 0, h - 1) * w + x] - src[clamp(y - r, 0, h - 1) * w + x];
    }
  }
}
/** Gaussian approximation: 3 successive separable box blurs. */
function gauss(src, w, h, sigma) {
  if (sigma < 0.5) return Float32Array.from(src);
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  let a = Float32Array.from(src);
  let b = new Float32Array(src.length);
  for (let k = 0; k < 3; k++) {
    boxBlurH(a, b, w, h, r);
    boxBlurV(b, a, w, h, r);
  }
  return a;
}
function percentile(arr, p) {
  const hist = new Uint32Array(1024);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) return lo;
  const sc = 1023 / (hi - lo);
  for (let i = 0; i < arr.length; i++) hist[((arr[i] - lo) * sc) | 0]++;
  const target = arr.length * p;
  let acc = 0;
  for (let i = 0; i < 1024; i++) { acc += hist[i]; if (acc >= target) return lo + i / sc; }
  return hi;
}

/* ---------- 1. tone -> target ink coverage ---------- */
export function buildTargetCoverage(gray, w, h, o) {
  const maxDim = Math.max(w, h);
  const tone = gauss(gray, w, h, Math.max(0.8, 0.0035 * maxDim));
  const L = new Float32Array(tone.length);
  for (let i = 0; i < L.length; i++) L[i] = tone[i] / 255;
  const white = 1 - o.whiteAnchor * (1 - clamp(percentile(L, 0.97), 0.55, 1));
  const cov = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) {
    const d = clamp((white - L[i]) / white, 0, 1);
    const x = clamp((d - o.paperDark) / (1 - o.paperDark), 0, 1);
    cov[i] = clamp(o.maxCoverage * Math.pow(x, o.gamma) * o.strength, 0, o.maxCoverage);
  }
  return { cov, tone };
}

/* ---------- 2. form-following direction field ---------- */
export function buildFormOrientation(gray, w, h, o) {
  const maxDim = Math.max(w, h);
  const n = w * h;
  const vecFor = (sigmaGrad, sigmaInt) => {
    const t = gauss(gray, w, h, sigmaGrad);
    const vx = new Float32Array(n), vy = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1);
        const gx = (t[y * w + xp] - t[y * w + xm]) * 0.5;
        const gy = (t[yp * w + x] - t[ym * w + x]) * 0.5;
        vx[y * w + x] = gx * gx - gy * gy;   // double-angle gradient vector
        vy[y * w + x] = 2 * gx * gy;
      }
    }
    const sx = gauss(vx, w, h, sigmaInt), sy = gauss(vy, w, h, sigmaInt);
    let e95;
    {
      const m = new Float32Array(n);
      for (let i = 0; i < n; i++) m[i] = Math.hypot(sx[i], sy[i]);
      e95 = percentile(m, 0.95) || 1;
    }
    for (let i = 0; i < n; i++) { sx[i] /= e95; sy[i] /= e95; }
    return { sx, sy };
  };
  const coarse = vecFor(o.formScale * maxDim, 1.4 * o.formScale * maxDim);
  const fine = vecFor(o.edgeScale * maxDim, 2 * o.edgeScale * maxDim);
  const ori = new Float32Array(n);
  const px = Math.cos(2 * (o.baseAngle - Math.PI / 2)), py = Math.sin(2 * (o.baseAngle - Math.PI / 2));
  const prior = 0.03; // pulls flat regions toward baseAngle without disturbing shaded ones
  for (let i = 0; i < n; i++) {
    // tangent double-angle = gradient double-angle + pi  => negate
    const tx = -(coarse.sx[i] + o.edgePull * fine.sx[i]) + prior * px;
    const ty = -(coarse.sy[i] + o.edgePull * fine.sy[i]) + prior * py;
    ori[i] = 0.5 * Math.atan2(ty, tx);
  }
  return ori;
}

/* ---------- 3. coverage -> hatch tiers ---------- */
function tierCoverages(cov, n) {
  const A = new Float32Array(n), B = new Float32Array(n), C = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = 1 - cov[i];                 // target transmission
    const tA = Math.max(f, 0.6);          // tier A alone reaches 0.40
    const r1 = f / tA;
    const tB = Math.max(r1, 0.55);        // tier B adds up to 0.45 more
    const r2 = r1 / tB;
    const tC = Math.max(r2, 0.4);
    A[i] = 1 - tA; B[i] = 1 - tB; C[i] = 1 - tC;
  }
  return [A, B, C];
}

function renderTier(cov, ori, w, h, sw, effW, o) {
  const minSp = Math.max(2, sw * 1.5), maxSp = Math.max(minSp + 2, sw * 7.5);
  const cMin = effW / maxSp;
  const toneArr = new Float32Array(w * h).fill(255);
  let any = false;
  for (let i = 0; i < toneArr.length; i++) {
    const c = cov[i];
    if (c < cMin) continue;
    const sp = clamp(effW / c, minSp, maxSp);
    toneArr[i] = 234 * (sp - minSp) / (maxSp - minSp);
    any = true;
  }
  if (!any) return new Uint8ClampedArray(w * h);
  return streamlineHatch(toneArr, ori, w, h, {
    minSp, maxSp, strokeWidth: sw, sepFrac: o.sepFrac,
    maxLen: Math.max(60, 0.12 * Math.max(w, h)), minLen: sw * 3, toneCut: 0.92,
  });
}

function renderAll(cov, ori, w, h, sw, effW, o) {
  const n = w * h;
  const [A, B, C] = tierCoverages(cov, n);
  const oriB = new Float32Array(n), oriC = new Float32Array(n);
  for (let i = 0; i < n; i++) { oriB[i] = ori[i] + o.crossAngle; oriC[i] = ori[i] - o.crossAngle; }
  const mask = renderTier(A, ori, w, h, sw, effW, o);
  const mB = renderTier(B, oriB, w, h, sw, effW, o);
  const mC = renderTier(C, oriC, w, h, sw, effW, o);
  for (let i = 0; i < n; i++) if (mB[i] || mC[i]) mask[i] = 255;
  return mask;
}

/* ---------- 4. closed-loop calibration ---------- */
function blockMeans(arr, w, h, r) {
  return gauss(arr, w, h, r); // smooth local mean; box-equivalent at block scale
}
export function measureTone(target, mask, w, h, blockPx) {
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = mask[i] ? 1 : 0;
  const tm = blockMeans(target, w, h, blockPx * 0.5), am = blockMeans(m, w, h, blockPx * 0.5);
  const step = Math.max(2, Math.round(blockPx));
  let sT = 0, sA = 0, sTT = 0, sAA = 0, sTA = 0, cnt = 0, abs = 0;
  for (let y = step; y < h - step; y += step) for (let x = step; x < w - step; x += step) {
    const t = tm[y * w + x], a = am[y * w + x];
    sT += t; sA += a; sTT += t * t; sAA += a * a; sTA += t * a; abs += Math.abs(t - a); cnt++;
  }
  const mt = sT / cnt, ma = sA / cnt;
  const cov = sTA / cnt - mt * ma;
  const corr = cov / (Math.sqrt(Math.max(1e-9, sTT / cnt - mt * mt)) * Math.sqrt(Math.max(1e-9, sAA / cnt - ma * ma)));
  return { mae: abs / cnt, corr, targetMean: mt, achievedMean: ma, ratio: ma / Math.max(1e-6, mt), tm, am };
}

export function renderTonalShading(gray, w, h, opts = {}) {
  const o = { ...TONAL_DEFAULTS, ...opts };
  const maxDim = Math.max(w, h);
  const n = w * h;
  const sw = o.strokeWidth || (maxDim >= 1800 ? 5 : maxDim >= 700 ? 3 : 1);
  const effW = sw === 1 ? 1 : sw * 0.85;     // measured plus-shaped stamp is a little narrower than sw
  const { cov } = buildTargetCoverage(gray, w, h, o);
  const ori = buildFormOrientation(gray, w, h, o);
  const blockPx = Math.max(8, o.blockFrac * maxDim);

  let gain = new Float32Array(n).fill(1);
  let best = null;
  for (let pass = 0; pass <= o.calibrationPasses; pass++) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = clamp(cov[i] * gain[i], 0, 0.95);
    const mask = renderAll(c, ori, w, h, sw, effW, o);
    const met = measureTone(cov, mask, w, h, blockPx);
    if (!best || met.mae < best.met.mae) best = { mask, met, pass };
    if (pass === o.calibrationPasses) break;
    const g2 = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = met.tm[i], a = met.am[i];
      g2[i] = t > 0.02 ? clamp(gain[i] * clamp(t / (a + 0.01), 0.5, 1.8), 0.4, 2.5) : gain[i];
    }
    gain = gauss(g2, w, h, blockPx * 0.6);
  }
  return {
    mask: best.mask,
    target: cov,
    orientation: ori,
    diagnostics: {
      passUsed: best.pass,
      blockMAE: best.met.mae,
      blockCorrelation: best.met.corr,
      targetMeanCoverage: best.met.targetMean,
      achievedMeanCoverage: best.met.achievedMean,
      coverageRatio: best.met.ratio,   // ~1.0 = balanced, >1.15 over-shaded, <0.85 under-shaded
      strokeWidth: sw,
    },
  };
}
