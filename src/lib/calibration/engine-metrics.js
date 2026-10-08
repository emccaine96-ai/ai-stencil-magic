/**
 * engine-metrics.js — measurement harness for the classical stencil engine.
 *
 * Drop at: src/lib/calibration/engine-metrics.js  (no dependencies besides ./fscore.js)
 *
 * WHY: edge-overlap F1 alone cannot tell you *what* is wrong with a stencil. This
 * module scores a predicted stencil against a reference stencil (e.g. a Gemini
 * output) on nine independent axes so you can see which stage to fix or replace.
 *
 * All metrics first normalise both images identically:
 *   1. area-average resample so the REFERENCE has a 1024 px long edge
 *      (prediction is resampled to the reference's width x height)
 *   2. composite over white using alpha
 *   3. ink = 255 - min(R,G,B) >= INK_THRESHOLD (90)   [handles purple ink, which
 *      has luminance ~128 and would be missed by a plain luminance cut]
 *
 * USAGE (browser console on /create, dev server):
 *   const lab = await import('/src/lib/calibration/engine-metrics.js');
 *   const r = await lab.runEngineLab();                 // all styles x all reference pairs
 *   console.table(r.summary);                           // per-style means
 *   copy(lab.reportToText(r));                          // paste this text back to your assistant
 *   lab.saveBaseline('before', r);                      // later: lab.diffAgainst('before', newResult)
 */
import { edgeOverlapFScore } from './fscore.js';

export const INK_THRESHOLD = 90;
export const LONG_EDGE = 1024;
export const BLOCK = 32;
export const SPECK_AREA = 12;

/* ------------------------------------------------------------------ */
/* Image normalisation                                                 */
/* ------------------------------------------------------------------ */

/** Area-average (down) / nearest (up) resample of an RGBA ImageData-like. */
export function resample(img, dw, dh) {
  const { width: sw, height: sh, data } = img;
  if (sw === dw && sh === dh) return img;
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * yr), y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((y + 1) * yr)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * xr), x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((x + 1) * xr)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * sw + xx) * 4;
          const al = data[i + 3];
          // premultiplied accumulation so transparent pixels don't drag colour to black
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
        }
      }
      const o = (y * dw + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = n ? a / n : 0;
    }
  }
  return { width: dw, height: dh, data: out };
}

/** Binary ink mask (1 = ink) from RGBA, composited over white. */
export function inkMask(img, inkThreshold = INK_THRESHOLD) {
  const { width, height, data } = img;
  const m = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3] / 255;
    const r = 255 + a * (data[i] - 255);
    const g = 255 + a * (data[i + 1] - 255);
    const b = 255 + a * (data[i + 2] - 255);
    m[p] = 255 - Math.min(r, g, b) >= inkThreshold ? 1 : 0;
  }
  return m;
}

/** Normalise a (prediction, reference) pair to the common grid and return masks. */
export function normalisePair(pred, ref, longEdge = LONG_EDGE, inkThreshold = INK_THRESHOLD) {
  const s = longEdge / Math.max(ref.width, ref.height);
  const w = Math.max(1, Math.round(ref.width * s)), h = Math.max(1, Math.round(ref.height * s));
  const r = resample(ref, w, h), p = resample(pred, w, h);
  return { w, h, predMask: inkMask(p, inkThreshold), refMask: inkMask(r, inkThreshold), predImg: p, refImg: r };
}

/* ------------------------------------------------------------------ */
/* Small numeric helpers                                               */
/* ------------------------------------------------------------------ */

const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
const median = (a) => { if (!a.length) return 0; const s = Array.from(a).sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, q) => { if (!a.length) return 0; const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function gaussKernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let t = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); t += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= t;
  return { k, r };
}

/** Separable Gaussian blur of a Float32Array field (clamped borders). */
export function gaussian(src, w, h, sigma) {
  const { k, r } = gaussKernel(sigma);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      out[y * w + x] = s;
    }
  }
  return out;
}

function blockCoverage(mask, w, h, block = BLOCK) {
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block);
  const cov = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let ink = 0, n = 0;
      for (let y = by * block; y < Math.min(h, (by + 1) * block); y++) {
        for (let x = bx * block; x < Math.min(w, (bx + 1) * block); x++) { ink += mask[y * w + x]; n++; }
      }
      cov[by * bw + bx] = n ? ink / n : 0;
    }
  }
  return cov;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

/** 1. Edge-overlap precision/recall/F1 at dilation radii 1 and 2. */
export function edgeF1(predMask, refMask, w, h) {
  const p = { mask: predMask, width: w, height: h }, g = { mask: refMask, width: w, height: h };
  const a = edgeOverlapFScore(p, g, 1), b = edgeOverlapFScore(p, g, 2);
  return { precision1: a.precision, recall1: a.recall, f1_1: a.f1, precision2: b.precision, recall2: b.recall, f1_2: b.f1 };
}

/** 2. Ink coverage (fraction of canvas that is ink) and prediction/reference ratio. */
export function coverage(predMask, refMask) {
  const p = sum(predMask) / predMask.length, r = sum(refMask) / refMask.length;
  return { predCoverage: p, refCoverage: r, coverageRatio: r > 0 ? p / r : 0 };
}

/** 3. Block-level tonal density agreement (does the shading land where the reference's does?). */
export function blockCorr(predMask, refMask, w, h) {
  const a = blockCoverage(predMask, w, h), b = blockCoverage(refMask, w, h);
  const n = a.length;
  let ma = 0, mb = 0, mae = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; mae += Math.abs(a[i] - b[i]); }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  const denom = Math.sqrt(saa * sbb);
  // two constant fields: identical => 1, otherwise undefined => 0
  const r = denom > 1e-12 ? sab / denom : (mae / n < 1e-9 ? 1 : 0);
  return { blockCorr: r, blockMAE: mae / n };
}

/** 4. Noise in highlights: share of reference-white blocks where prediction has >5% ink. */
export function highlightNoise(predMask, refMask, w, h) {
  const a = blockCoverage(predMask, w, h), b = blockCoverage(refMask, w, h);
  let white = 0, noisy = 0;
  for (let i = 0; i < a.length; i++) if (b[i] < 0.01) { white++; if (a[i] > 0.05) noisy++; }
  return { highlightNoise: white ? noisy / white : 0, whiteBlocks: white };
}

/** 5. Fragmentation: 8-connected components / specks per 100k px, median component area. */
export function componentStats(mask, w, h) {
  const label = new Int32Array(w * h);
  const areas = [];
  const stack = new Int32Array(w * h);
  let next = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    next++;
    let sp = 0, area = 0;
    stack[sp++] = s; label[s] = next;
    while (sp) {
      const i = stack[--sp]; area++;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w || (!dx && !dy)) continue;
          const j = yy * w + xx;
          if (mask[j] && !label[j]) { label[j] = next; stack[sp++] = j; }
        }
      }
    }
    areas.push(area);
  }
  const per100k = 1e5 / (w * h);
  return {
    components100k: areas.length * per100k,
    specks100k: areas.filter((a) => a < SPECK_AREA).length * per100k,
    medianComponentArea: median(areas),
  };
}

/** 6. Stroke width via ridge of a chamfer distance transform (width ~ 2*dt - 1). */
export function strokeWidth(mask, w, h) {
  const INF = 1e9, D = 1, DD = Math.SQRT2;
  const dt = new Float32Array(w * h);
  for (let i = 0; i < dt.length; i++) dt[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!dt[i]) continue;
      let v = dt[i];
      // borders count as background so isolated single-pixel dots read as width 1
      v = Math.min(v, (x > 0 ? dt[i - 1] : 0) + D, (y > 0 ? dt[i - w] : 0) + D,
        (x > 0 && y > 0 ? dt[i - w - 1] : 0) + DD, (x < w - 1 && y > 0 ? dt[i - w + 1] : 0) + DD,
        x === 0 || y === 0 ? D : INF);
      dt[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (!dt[i]) continue;
      let v = dt[i];
      v = Math.min(v, (x < w - 1 ? dt[i + 1] : 0) + D, (y < h - 1 ? dt[i + w] : 0) + D,
        (x < w - 1 && y < h - 1 ? dt[i + w + 1] : 0) + DD, (x > 0 && y < h - 1 ? dt[i + w - 1] : 0) + DD,
        x === w - 1 || y === h - 1 ? D : INF);
      dt[i] = v;
    }
  }
  const widths = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, v = dt[i]; if (!v) continue;
      let ridge = true;
      for (let dy = -1; dy <= 1 && ridge; dy++) for (let dx = -1; dx <= 1; dx++) if (dt[i + dy * w + dx] > v) { ridge = false; break; }
      if (ridge) widths.push(2 * v - 1);
    }
  }
  return { widthMedian: median(widths), widthP90: pct(widths, 0.9) };
}

/** 7. Orientation histogram (tangent angle, coherence-weighted, 18 bins over [0, pi)). */
export function orientationHistogram(mask, w, h, sigma = 3, bins = 18) {
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = mask[i];
  const b = gaussian(f, w, h, 1.2);
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = b[i + 1] - b[i - 1]; gy[i] = b[i + w] - b[i - w];
    }
  }
  const jxx = new Float32Array(w * h), jyy = new Float32Array(w * h), jxy = new Float32Array(w * h);
  for (let i = 0; i < jxx.length; i++) { jxx[i] = gx[i] * gx[i]; jyy[i] = gy[i] * gy[i]; jxy[i] = gx[i] * gy[i]; }
  const sxx = gaussian(jxx, w, h, sigma), syy = gaussian(jyy, w, h, sigma), sxy = gaussian(jxy, w, h, sigma);
  const hist = new Float64Array(bins);
  let cohSum = 0, cohN = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const a = sxx[i], c = syy[i], bb = sxy[i];
    const tr = a + c; if (tr < 1e-9) continue;
    const coh = Math.sqrt((a - c) * (a - c) + 4 * bb * bb) / tr;
    let ang = 0.5 * Math.atan2(2 * bb, a - c) + Math.PI / 2; // tangent, not gradient
    ang = ((ang % Math.PI) + Math.PI) % Math.PI;
    hist[Math.min(bins - 1, Math.floor((ang / Math.PI) * bins))] += coh;
    cohSum += coh; cohN++;
  }
  const total = sum(hist);
  if (total > 0) for (let i = 0; i < bins; i++) hist[i] /= total;
  return { hist, meanCoherence: cohN ? cohSum / cohN : 0 };
}

/** Jensen-Shannon divergence, base 2, in [0,1]. */
export function jsDivergence(p, q) {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    const m = 0.5 * (p[i] + q[i]);
    if (p[i] > 0) d += 0.5 * p[i] * Math.log2(p[i] / m);
    if (q[i] > 0) d += 0.5 * q[i] * Math.log2(q[i] / m);
  }
  return Math.max(0, Math.min(1, d));
}

export function orientation(predMask, refMask, w, h) {
  const a = orientationHistogram(predMask, w, h), b = orientationHistogram(refMask, w, h);
  const empty = sum(a.hist) === 0 || sum(b.hist) === 0;
  return {
    orientJS: empty ? 1 : jsDivergence(a.hist, b.hist),
    predCoherence: a.meanCoherence, refCoherence: b.meanCoherence,
  };
}

/** 8. Share of prediction ink sitting >6 px from any strong source-photo edge (interior ink). */
export function offEdgeInk(predMask, sourceRGBA, w, h, topPct = 0.12, radius = 6) {
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < sourceRGBA.data.length; i += 4, p++) {
    gray[p] = 0.299 * sourceRGBA.data[i] + 0.587 * sourceRGBA.data[i + 1] + 0.114 * sourceRGBA.data[i + 2];
  }
  const g = gaussian(gray, w, h, 1.2);
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const sx = -g[i - w - 1] - 2 * g[i - 1] - g[i + w - 1] + g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1];
      const sy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      mag[i] = Math.hypot(sx, sy);
    }
  }
  // top-12% magnitude, but never below 5% of the strongest edge (flat/clean photos would
  // otherwise promote noise to "edges", and sparse-edge images would get an all-zero cut)
  let maxMag = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > maxMag) maxMag = mag[i];
  const thr = Math.max(pct(mag, 1 - topPct), 0.05 * maxMag);
  const edge = new Uint8Array(w * h);
  for (let i = 0; i < edge.length; i++) edge[i] = maxMag > 0 && mag[i] >= thr ? 1 : 0;
  // separable square dilation
  const tmp = new Uint8Array(w * h), near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let d = -radius; d <= radius && !v; d++) { const xx = x + d; if (xx >= 0 && xx < w && edge[y * w + xx]) v = 1; }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0; for (let d = -radius; d <= radius && !v; d++) { const yy = y + d; if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1; }
    near[y * w + x] = v;
  }
  let ink = 0, off = 0;
  for (let i = 0; i < predMask.length; i++) if (predMask[i]) { ink++; if (!near[i]) off++; }
  return { offEdgeInk: ink ? off / ink : 0 };
}

/* ------------------------------------------------------------------ */
/* Pair scoring + aggregation                                          */
/* ------------------------------------------------------------------ */

/** Score one prediction against one reference (+ optional source photo, + optional ms). */
export function scorePair(pred, ref, { source = null, ms = null, longEdge = LONG_EDGE, inkThreshold = INK_THRESHOLD } = {}) {
  const { w, h, predMask, refMask } = normalisePair(pred, ref, longEdge, inkThreshold);
  const row = {
    ...edgeF1(predMask, refMask, w, h),
    ...coverage(predMask, refMask),
    ...blockCorr(predMask, refMask, w, h),
    ...highlightNoise(predMask, refMask, w, h),
    ...componentStats(predMask, w, h),
    ...orientation(predMask, refMask, w, h),
  };
  const sw = strokeWidth(predMask, w, h), rw = strokeWidth(refMask, w, h);
  row.widthMedian = sw.widthMedian; row.widthP90 = sw.widthP90;
  row.refWidthMedian = rw.widthMedian; row.refWidthP90 = rw.widthP90;
  if (source) row.offEdgeInk = offEdgeInk(predMask, resample(source, w, h), w, h).offEdgeInk;
  if (ms != null) row.ms = ms;
  return row;
}

/** Mean of every numeric field over rows. */
export function meanRow(rows) {
  const out = {};
  if (!rows.length) return out;
  for (const k of Object.keys(rows[0])) {
    if (typeof rows[0][k] !== 'number') continue;
    let s = 0, n = 0;
    for (const r of rows) if (typeof r[k] === 'number' && Number.isFinite(r[k])) { s += r[k]; n++; }
    out[k] = n ? s / n : 0;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Browser runner                                                      */
/* ------------------------------------------------------------------ */

async function toImageData(src) {
  if (src && src.data && src.width) return src;
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = rej; i.src = typeof src === 'string' ? src : src.src;
  });
  const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/**
 * Run the engine over reference pairs and score it.
 * @param {object} opts
 *   styles    default ['hatching','solid','dotwork','hybrid']
 *   pairs     [{id, before, after}]  (data URLs / ImageData). Default: TRUE_EXAMPLES (before = photo, after = reference stencil)
 *   intensity default 0.7 (same as create.tsx)
 *   render    async (photoDataUrl, style, intensity) => dataUrl   (default: processClassicalPro, the real app path)
 */
export async function runEngineLab(opts = {}) {
  const styles = opts.styles ?? ['hatching', 'solid', 'dotwork', 'hybrid'];
  const intensity = opts.intensity ?? 0.7;
  let pairs = opts.pairs;
  if (!pairs) ({ TRUE_EXAMPLES: pairs } = await import('../example-assets/index'));
  let render = opts.render;
  if (!render) {
    const { processClassicalPro } = await import('../classical-pro-integration');
    render = async (photo, style, inten) => (await processClassicalPro(photo, { style, intensity: inten, purpleTint: true })).dataUrl;
  }
  const rows = [];
  for (const pair of pairs) {
    const source = await toImageData(pair.before);
    const ref = await toImageData(pair.after);
    for (const style of styles) {
      const t0 = performance.now();
      const predUrl = await render(pair.before, style, intensity);
      const ms = Math.round(performance.now() - t0);
      const pred = await toImageData(predUrl);
      rows.push({ id: pair.id, style, ...scorePair(pred, ref, { source, ms }) });
    }
  }
  const summary = {};
  for (const style of styles) summary[style] = meanRow(rows.filter((r) => r.style === style));
  return { rows, summary, meta: { styles, intensity, pairs: pairs.map((p) => p.id), inkThreshold: INK_THRESHOLD, longEdge: LONG_EDGE } };
}

/** Compact, paste-friendly text report (round to 3 decimals). */
export function reportToText(result) {
  const f = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
  const lines = ['# engine-lab summary (per-style mean)'];
  for (const [style, s] of Object.entries(result.summary)) {
    lines.push(`## ${style}`);
    lines.push(Object.entries(s).map(([k, v]) => `${k}=${f(v)}`).join('  '));
  }
  lines.push('# per pair');
  for (const r of result.rows) {
    lines.push(`${r.id}/${r.style}: ` + Object.entries(r).filter(([k]) => k !== 'id' && k !== 'style').map(([k, v]) => `${k}=${f(v)}`).join(' '));
  }
  return lines.join('\n');
}

/** Delta of two results' summaries (b - a), for A/B-ing a code change. */
export function compareSummaries(a, b) {
  const out = {};
  for (const style of Object.keys(b.summary)) {
    out[style] = {};
    for (const k of Object.keys(b.summary[style])) {
      const va = a.summary?.[style]?.[k];
      if (typeof va === 'number') out[style][k] = Math.round((b.summary[style][k] - va) * 1000) / 1000;
    }
  }
  return out;
}

export function saveBaseline(name, result) {
  localStorage.setItem(`stencilmagic.lab.${name}`, JSON.stringify({ summary: result.summary, meta: result.meta }));
}
export function diffAgainst(name, result) {
  const raw = localStorage.getItem(`stencilmagic.lab.${name}`);
  if (!raw) throw new Error(`No baseline "${name}" saved`);
  return compareSummaries(JSON.parse(raw), result);
}
