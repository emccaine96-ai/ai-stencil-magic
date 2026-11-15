// src/lib/classical-v3/hectograph-engine.ts
/**
 * Client-Side Stencil Engine V3.2 (Scene-Adaptive Hectograph & Engraving Pipeline)
 * Calibrated against the 5-row benchmark comparison:
 *  - Replaces the random LIC white-noise static (purple sandpaper on petals and beards) with smooth tonal shading
 *  - Auto-detects soft low-contrast portraits vs ultra-dense glyphs and tunes gates and line weights per image
 *  - Pins dark anatomical focal points (pupils, lashes, nostrils, flower cores, deep creases) to deep indigo
 *  - Keeps pure white paper (#FFFFFF) on highlights, petal interiors and smooth skin
 *
 * Separate, opt-in module. It does NOT touch the Classical Pro engine (classical-pro-engine.js) or the
 * v2b candidate, so the existing styles and their regression baselines are unaffected.
 * Deterministic: no Math.random, no time dependence. Same input + config => same output.
 */

export type HectographOutputMode = 'hectograph-purple' | 'pro-graphite' | 'thermal-binary';

export interface HectographV3Config {
  /** 'hectograph-purple' is the multi-tone purple transfer-sheet look; 'pro-graphite' is continuous B&W; 'thermal-binary' is 203-DPI */
  outputMode: HectographOutputMode;
  /** Strength of primary structural anchor lines (0.5 - 2.0, default 1.30) */
  anchorWeight: number;
  /** Sensitivity to fine micro-ridges like hibiscus petal veins & wrinkles (0.0 - 2.0, default 1.15) */
  fineDetailGain: number;
  /** Intensity of smooth directional tonal shading & dark core pinning (0.0 - 1.0, default 0.60) */
  flowShadingStrength: number;
  /** Local shadow/highlight recovery strength (0.0 - 1.0, default 0.70) */
  localContrastBoost: number;
  /** White halo buffer around primary anchor lines so shading never muddies edges (0 - 4px, default 1.5) */
  haloProtection: number;
  /**
   * Largest share of the page allowed to carry ink (0..1, default 0.30). The paper gate is raised just enough
   * that no more than this fraction of pixels stay inked. It never lowers the gate below 0.035, so a sparse
   * image is left exactly as it was.
   */
  inkBudget?: number;
  /** Highest paper gate the ink budget may use (0.035 to 0.95, default 0.5). Raise it so dense images can meet the budget. */
  inkFloorCap?: number;
  /** Use the broad (sigma 4.8 minus 2.2) difference of Gaussians as an anchor-line source. Default true. */
  broadDoG?: boolean;
  /** Use the sigma 3.2 Hessian scale as an anchor-line source. Default true. */
  hessianSigma32?: boolean;
  /**
   * Thin the anchor-line layer before compositing: keep only the local maximum across each line (non-maximum
   * suppression along the edge-flow normal), then widen to `thinWidth`. Default false, so output is unchanged.
   */
  thin?: boolean;
  /** Target stroke width in px after thinning (1 to 5, default 3). Only used when `thin` is true. */
  thinWidth?: number;
  /**
   * Multiplies the Hessian ridge gates and the step-edge gates that feed the anchor layer (default 1 = unchanged).
   * Above 1 only stronger ridges and edges become anchor lines, which cuts the broad saturated texture response.
   */
  anchorGateScale?: number;
  /** Weight of the sigma 1.9 Hessian anchor source (default 1 = unchanged). */
  hessianSigma19Weight?: number;
  /**
   * How strongly a Hessian response must look like a LINE rather than a blob: ridgeNess = lambda1 - k * |lambda2|.
   * Default 0.35 (unchanged). Larger values reject filled regions, where both curvatures are similar.
   */
  ridgeAnisotropy?: number;
  /**
   * Also remove tiny components judged on STRONG ink (255 - min(R,G,B) >= 90, the scorer's definition), however
   * long they are. Default 0 (off). Set to a pixel count, e.g. 12, to drop strong-ink components smaller than that.
   */
  strongSpeckPixels?: number;
  /** Add a finer sigma 1.2 Hessian anchor scale (default false). */
  hessianSigma12?: boolean;
  /** Diagnostics only: receives the four layers just before compositing. Never set by the app. */
  debugAnchorSource?: (a: Float32Array) => void;
  debugAnchorSource2?: (a: Float32Array) => void;
  debugLayers?: (l: { anchorLines: Float32Array; detailLines: Float32Array; coreDarkPin: Float32Array; smoothShading: Float32Array; width: number; height: number }) => void;
  /** Optional neural line-art probability map [0..1] from ONNX Informative-Drawings worker */
  neuralEdgeMap?: Float32Array;
}

export const DEFAULT_HECTOGRAPH_V3_CONFIG: HectographV3Config = {
  outputMode: 'hectograph-purple',
  anchorWeight: 1.30,
  fineDetailGain: 1.15,
  flowShadingStrength: 0.60,
  localContrastBoost: 0.70,
  haloProtection: 1.5,
  inkBudget: 0.30,
  inkFloorCap: 0.5,
  broadDoG: true,
  hessianSigma32: true,
  thin: false,
  thinWidth: 3,
  ridgeAnisotropy: 0.35,
  strongSpeckPixels: 0,
  anchorGateScale: 1,
  hessianSigma19Weight: 1,
  hessianSigma12: false,
};

/**
 * Deterministic line thinning. Keeps a pixel only if it is a local maximum of `layer` across the line normal
 * (the perpendicular to the tangent field tx,ty), within +-1 px, then widens the surviving centreline to about
 * `width` px with a max filter of that footprint (so the value on a line stays the line's own strength).
 * Ties are broken one-sided (>= on the negative side, > on the positive side), so a flat-topped stroke keeps
 * exactly one centre pixel instead of vanishing. No randomness, no time dependence.
 */
export function thinLayer(
  layer: Float32Array,
  tx: Float32Array,
  ty: Float32Array,
  width: number,
  height: number,
  targetWidth: number
): Float32Array {
  const N = width * height;
  const spine = new Float32Array(N);
  const floor = 1e-4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const v = layer[i];
      if (v <= floor) continue;
      // normal = (ty, -tx); snap each +-1 px neighbour to the pixel grid
      const nx = ty[i];
      const ny = -tx[i];
      const xa = Math.min(width - 1, Math.max(0, Math.round(x + nx)));
      const ya = Math.min(height - 1, Math.max(0, Math.round(y + ny)));
      const xb = Math.min(width - 1, Math.max(0, Math.round(x - nx)));
      const yb = Math.min(height - 1, Math.max(0, Math.round(y - ny)));
      if (v >= layer[ya * width + xa] && v > layer[yb * width + xb]) spine[i] = v;
    }
  }
  // A non-finite width (NaN, Infinity) falls back to the default of 3 rather than silently erasing every line.
  const w = Number.isFinite(targetWidth) ? Math.max(1, Math.min(5, Math.round(targetWidth))) : 3;
  if (w <= 1) return spine;
  // Widen to ~w px: a (w x w) max filter would be ~w px across a straight line but makes diagonals w*sqrt(2).
  // A separable max over r = floor(w/2) in x and y, with a one-pixel trim for even widths, keeps it close to w.
  const r = Math.floor(w / 2);
  const tmp = new Float32Array(N);
  const out = new Float32Array(N);
  const lo = r;
  const hi = w % 2 === 0 ? r - 1 : r; // even width: asymmetric window of w px
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 0;
      const a = Math.max(0, x - lo);
      const b = Math.min(width - 1, x + hi);
      for (let k = a; k <= b; k++) if (spine[row + k] > m) m = spine[row + k];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 0;
      const a = Math.max(0, y - lo);
      const b = Math.min(height - 1, y + hi);
      for (let k = a; k <= b; k++) if (tmp[k * width + x] > m) m = tmp[k * width + x];
      out[y * width + x] = m;
    }
  }
  return out;
}

/** The fixed paper gate: raw ink under this is always blank paper. */
export const PAPER_GATE = 0.035;
/** The budget can raise the gate, but never past this. */
export const MAX_INK_FLOOR = 0.5;
const INK_HIST_BINS = 200;

/**
 * Smallest floor >= PAPER_GATE (capped at MAX_INK_FLOOR) such that no more than `budget` of the pixels have
 * raw ink >= floor. Uses a 200-bin histogram over [0,1], so the floor is quantised to 1/200 and is
 * deterministic. A budget >= 1 (or non-finite) disables the budget and returns PAPER_GATE.
 */
export function computeInkFloor(rawInk: Float32Array, budget: number, cap: number = MAX_INK_FLOOR): number {
  // A bad cap falls back to the default; the cap is kept between the paper gate and just under 1.
  const capV = Number.isFinite(cap) ? Math.min(0.95, Math.max(PAPER_GATE, cap)) : MAX_INK_FLOOR;
  const n = rawInk.length;
  if (n === 0 || !Number.isFinite(budget) || budget >= 1) return PAPER_GATE;
  const b = Math.max(0, budget);
  const hist = new Uint32Array(INK_HIST_BINS + 1);
  for (let i = 0; i < n; i++) {
    const v = rawInk[i];
    const bin = v <= 0 ? 0 : v >= 1 ? INK_HIST_BINS : Math.floor(v * INK_HIST_BINS);
    hist[bin]++;
  }
  // suffix[k] = number of pixels whose bin is >= k. A floor at the lower edge of bin k keeps exactly suffix[k] pixels.
  const allowed = b * n;
  let suffix = 0;
  const startBin = Math.ceil(PAPER_GATE * INK_HIST_BINS); // first bin whose lower edge is >= PAPER_GATE
  const endBin = Math.floor(capV * INK_HIST_BINS);
  // accumulate everything above endBin first
  for (let k = INK_HIST_BINS; k > endBin; k--) suffix += hist[k];
  let floorBin = endBin;
  for (let k = endBin; k >= startBin; k--) {
    suffix += hist[k];
    if (suffix > allowed) break;
    floorBin = k;
  }
  // floorBin is the lowest bin we can start at while staying within budget; if even startBin fits, use PAPER_GATE
  const floor = floorBin <= startBin ? PAPER_GATE : floorBin / INK_HIST_BINS;
  return Math.min(capV, Math.max(PAPER_GATE, floor));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Fast separable 1D Gaussian blur (O(N))
 */
function gaussianBlurFloat(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma <= 0.05) return new Float32Array(src);
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  const s2 = 2 * sigma * sigma;
  for (let i = -radius; i <= radius; i++) {
    const val = Math.exp(-(i * i) / s2);
    kernel[i + radius] = val;
    sum += val;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const temp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[rowOffset + nx] * kernel[k + radius];
      }
      temp[rowOffset + x] = acc;
    }
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.min(height - 1, Math.max(0, y + k));
        acc += temp[ny * width + x] * kernel[k + radius];
      }
      dst[rowOffset + x] = acc;
    }
  }
  return dst;
}

interface SceneProfile {
  /** P2 and P98 luminance percentiles for full dynamic range normalization */
  p2: number;
  p98: number;
  /** High > 0.14 = Aztec / dense mandala; Low < 0.055 = soft Baby portrait */
  edgeDensity: number;
  /** Automatic multiplier adjustments based on image content */
  noiseGateBoost: number;
  shadingMultiplier: number;
  portraitFocusBoost: number;
  fineScaleWeight: number;
}

/**
 * STAGE 0: Automatic Scene & Dynamic Range Profiler
 * Inspects the uploaded image so soft portraits (Baby), botanicals (Hibiscus), and dense carvings (Aztec)
 * each get ideal contrast stretching, noise gating, and line-weight balance automatically.
 */
function analyzeSceneProfile(rawLum: Float32Array, width: number, height: number): SceneProfile {
  const N = rawLum.length;
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) {
    const bin = Math.min(255, Math.max(0, Math.round(rawLum[i] * 255)));
    hist[bin]++;
  }

  let acc = 0;
  let p2 = 0.02;
  let p98 = 0.98;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= N * 0.02) {
      p2 = i / 255.0;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= N * 0.02) {
      p98 = i / 255.0;
      break;
    }
  }
  if (p98 - p2 < 0.15) {
    p2 = 0.0;
    p98 = 1.0;
  }

  // Measure high-frequency gradient energy across the image
  const smooth = gaussianBlurFloat(rawLum, width, height, 1.2);
  let gradSum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 2) {
    const r = y * width;
    for (let x = 1; x < width - 1; x += 2) {
      const dx = smooth[r + x + 1] - smooth[r + x - 1];
      const dy = smooth[r + width + x] - smooth[r - width + x];
      gradSum += Math.hypot(dx, dy);
      count++;
    }
  }
  const edgeDensity = count > 0 ? gradSum / count : 0.08;

  // Dense glyph / Aztec mode (edgeDensity > 0.13) vs Soft Portrait mode (edgeDensity < 0.065)
  const isUltraDenseGlyph = edgeDensity > 0.125;
  const isSoftPortrait = edgeDensity < 0.072;

  return {
    p2,
    p98,
    edgeDensity,
    // Raise noise gate on dense carvings so background stone doesn't turn purple
    noiseGateBoost: isUltraDenseGlyph ? 1.45 : isSoftPortrait ? 0.72 : 1.0,
    // Reduce broad shading on Aztec so glyphs stay crisp; boost smooth shading on portraits
    shadingMultiplier: isUltraDenseGlyph ? 0.38 : isSoftPortrait ? 1.15 : 0.85,
    // Boost ocular/nostril/mouth contrast on soft portraits (Baby & Elder)
    portraitFocusBoost: isSoftPortrait ? 1.45 : 1.1,
    // Keep delicate petal veins on botanicals & glyphs without amplifying skin pores on portraits
    fineScaleWeight: isSoftPortrait ? 0.55 : 1.05,
  };
}

/**
 * STAGE 1: Noise-Gated Local Contrast & Dynamic Range Normalization
 * Stretches dynamic range so the Baby Portrait has full black-to-white punch, and extracts
 * delicate Hibiscus petal veins WITHOUT amplifying JPEG noise on smooth white petals!
 */
function normalizeToneAndDetail(
  rawLum: Float32Array,
  width: number,
  height: number,
  boost: number,
  scene: SceneProfile
): { normLum: Float32Array; detailEnhancedLum: Float32Array; localMeanLarge: Float32Array } {
  const N = width * height;
  const normLum = new Float32Array(N);
  const range = Math.max(0.15, scene.p98 - scene.p2);

  // 1. Auto-levels percentile stretch so soft photos (Baby) utilize full [0..1] range
  for (let i = 0; i < N; i++) {
    normLum[i] = Math.min(1, Math.max(0, (rawLum[i] - scene.p2) / range));
  }

  const meanSmall = gaussianBlurFloat(normLum, width, height, 3.0);
  const localMeanLarge = gaussianBlurFloat(normLum, width, height, 22.0);

  const sqDiff = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = normLum[i] - localMeanLarge[i];
    sqDiff[i] = d * d;
  }
  const localVar = gaussianBlurFloat(sqDiff, width, height, 18.0);

  const detailEnhancedLum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const L = normLum[i];
    // Lift crushed dark shadows (Gorilla / Hibiscus dark leaves) while keeping highlights clean
    const shadowCurve = Math.pow(L, 0.84);

    // Crucial fix: Use a generous 0.11 std-dev floor so smooth white petals & baby skin NEVER divide by ~0!
    const localStd = Math.sqrt(localVar[i]) + 0.11;

    const macroDiff = L - localMeanLarge[i];
    const microDiff = L - meanSmall[i];

    // Deadzone noise gate on micro-detail: ignores 1-2% sensor/JPEG fuzz on smooth surfaces
    const microGate = smoothstep(0.008, 0.035, Math.abs(microDiff));
    const gatedMicro = microDiff * microGate;

    const localDetail = (macroDiff * 0.45 + gatedMicro * 0.55) / (localStd * 2.2);
    const eq = Math.min(1, Math.max(0, shadowCurve + localDetail * boost * 0.55));
    detailEnhancedLum[i] = L * (1 - boost * 0.65) + eq * (boost * 0.65);
  }

  return { normLum, detailEnhancedLum, localMeanLarge };
}

/**
 * STAGE 2: Scharr Structure Tensor & Edge Tangent Flow (ETF)
 * Computes smooth local tangent vectors along curves/petals/hair and coherent anisotropy.
 */
function computeEdgeTangentFlow(
  lum: Float32Array,
  width: number,
  height: number
): { tx: Float32Array; ty: Float32Array; gradMag: Float32Array; coherence: Float32Array } {
  const N = width * height;
  const gx = new Float32Array(N);
  const gy = new Float32Array(N);

  const preSmooth = gaussianBlurFloat(lum, width, height, 0.75);

  for (let y = 1; y < height - 1; y++) {
    const r0 = (y - 1) * width;
    const r1 = y * width;
    const r2 = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      const dx =
        3 * (preSmooth[r0 + x + 1] - preSmooth[r0 + x - 1]) +
        10 * (preSmooth[r1 + x + 1] - preSmooth[r1 + x - 1]) +
        3 * (preSmooth[r2 + x + 1] - preSmooth[r2 + x - 1]);
      const dy =
        3 * (preSmooth[r2 + x - 1] - preSmooth[r0 + x - 1]) +
        10 * (preSmooth[r2 + x] - preSmooth[r0 + x]) +
        3 * (preSmooth[r2 + x + 1] - preSmooth[r0 + x + 1]);
      gx[r1 + x] = dx / 32.0;
      gy[r1 + x] = dy / 32.0;
    }
  }

  const jxx = new Float32Array(N);
  const jxy = new Float32Array(N);
  const jyy = new Float32Array(N);
  const gradMag = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const dx = gx[i];
    const dy = gy[i];
    jxx[i] = dx * dx;
    jxy[i] = dx * dy;
    jyy[i] = dy * dy;
    gradMag[i] = Math.hypot(dx, dy);
  }

  const sxx = gaussianBlurFloat(jxx, width, height, 2.5);
  const sxy = gaussianBlurFloat(jxy, width, height, 2.5);
  const syy = gaussianBlurFloat(jyy, width, height, 2.5);

  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  const coherence = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const a = sxx[i];
    const b = sxy[i];
    const c = syy[i];
    const trace = a + c;
    const det = a * c - b * b;
    const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
    const lambda1 = trace / 2 + disc;
    const lambda2 = Math.max(0, trace / 2 - disc);

    // Coherence measures whether local texture is a true directional line/vein vs random isotropic noise
    coherence[i] = trace > 1e-5 ? (lambda1 - lambda2) / (lambda1 + lambda2 + 1e-5) : 0;

    let nx = b;
    let ny = lambda1 - a;
    const norm = Math.hypot(nx, ny);
    if (norm > 1e-6) {
      nx /= norm;
      ny /= norm;
    } else {
      nx = 1;
      ny = 0;
    }
    tx[i] = -ny;
    ty[i] = nx;
  }

  return { tx, ty, gradMag, coherence };
}

/**
 * STAGE 3: Noise-Gated Hessian Valley Centerline Extractor + Flow-Aligned XDoG
 * Extracts crisp single-spine lines for wrinkles, petal veins, eyes, and glyphs while gating
 * out low-amplitude surface noise so white areas stay 100% clean.
 */
function extractCleanLinesAndVeins(
  detailLum: Float32Array,
  normLum: Float32Array,
  gradMag: Float32Array,
  coherence: Float32Array,
  tx: Float32Array,
  ty: Float32Array,
  width: number,
  height: number,
  config: HectographV3Config,
  scene: SceneProfile
): { anchorLines: Float32Array; detailLines: Float32Array } {
  const N = width * height;
  const anchorLines = new Float32Array(N);
  const detailLines = new Float32Array(N);

  // 1. Flow-aligned Difference of Gaussians (XDoG) for crisp structural edges & facial features
  const blurTight = gaussianBlurFloat(detailLum, width, height, 0.9);
  const blurMedium = gaussianBlurFloat(detailLum, width, height, 2.2);
  const blurBroad = config.broadDoG === false ? blurMedium : gaussianBlurFloat(normLum, width, height, 4.8);

  const gateScale = scene.noiseGateBoost;
  // Extra multiplier on the anchor ridge/edge gates; non-finite or non-positive values mean 'unchanged'.
  const aniso = Number.isFinite(config.ridgeAnisotropy) && (config.ridgeAnisotropy as number) >= 0 ? (config.ridgeAnisotropy as number) : 0.35;
  const agScale = Number.isFinite(config.anchorGateScale) && (config.anchorGateScale as number) > 0 ? (config.anchorGateScale as number) : 1;

  for (let i = 0; i < N; i++) {
    // Dark crease / line response (where pixel is darker than its immediate neighborhood)
    const dogFine = blurMedium[i] - blurTight[i];
    const dogBroad = blurBroad[i] - blurMedium[i];

    // Deadzone gate eliminates purple fuzz on smooth petals & baby cheeks
    const fineLine = smoothstep(0.012 * gateScale, 0.055 * gateScale, dogFine) * scene.fineScaleWeight;
    const structuralLine =
      config.broadDoG === false
        ? 0
        : smoothstep(0.018 * gateScale, 0.085 * gateScale, dogBroad) * scene.portraitFocusBoost;

    detailLines[i] = Math.min(1, fineLine * config.fineDetailGain);
    anchorLines[i] = Math.min(1, structuralLine * config.anchorWeight);
  }

  // 2. Multi-Scale Hessian Dark-Valley Centerlines (single spine down wrinkles, veins, and carvings)
  const scales = [
    {
      sigma: 1.0,
      lowGate: 0.016 * gateScale,
      highGate: 0.068 * gateScale,
      weight: 0.85 * config.fineDetailGain * scene.fineScaleWeight,
      target: 'detail' as const,
    },
    ...(config.hessianSigma12 === true
      ? [{
          sigma: 1.2,
          lowGate: 0.015 * gateScale * agScale,
          highGate: 0.065 * gateScale * agScale,
          weight: 1.0 * config.anchorWeight * scene.portraitFocusBoost,
          target: 'anchor' as const,
        }]
      : []),
    {
      sigma: 1.9,
      lowGate: 0.014 * gateScale * agScale,
      highGate: 0.062 * gateScale * agScale,
      weight: 1.15 * (Number.isFinite(config.hessianSigma19Weight) ? Math.max(0, config.hessianSigma19Weight as number) : 1) * config.anchorWeight * scene.portraitFocusBoost,
      target: 'anchor' as const,
    },
    {
      sigma: 3.2,
      lowGate: 0.012 * gateScale * agScale,
      highGate: 0.055 * gateScale * agScale,
      weight: 0.95 * config.anchorWeight * scene.portraitFocusBoost,
      target: 'anchor' as const,
    },
  ];

  for (const s of scales) {
    if (s.sigma === 3.2 && config.hessianSigma32 === false) continue;
    const blurred = gaussianBlurFloat(detailLum, width, height, s.sigma);
    const normFactor = Math.pow(s.sigma, 1.55);

    for (let y = 1; y < height - 1; y++) {
      const r0 = (y - 1) * width;
      const r1 = y * width;
      const r2 = (y + 1) * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = r1 + x;
        const center = blurred[idx];

        const dxx = blurred[r1 + x + 1] - 2 * center + blurred[r1 + x - 1];
        const dyy = blurred[r2 + x] - 2 * center + blurred[r0 + x];
        const dxy =
          0.25 *
          (blurred[r2 + x + 1] -
            blurred[r2 + x - 1] -
            blurred[r0 + x + 1] +
            blurred[r0 + x - 1]);

        const trace = dxx + dyy;
        const disc = Math.sqrt(Math.max(0, (dxx - dyy) * (dxx - dyy) + 4 * dxy * dxy));
        // Positive principal curvature = center spine of dark valley/line
        const lambda1 = 0.5 * (trace + disc) * normFactor;
        const lambda2 = 0.5 * (trace - disc) * normFactor;

        // Require tubular/ridge anisotropy (lambda1 >> |lambda2|) so flat isotropic noise is ignored
        const ridgeNess = lambda1 - aniso * Math.abs(lambda2);
        if (ridgeNess > s.lowGate) {
          const gatedVal = smoothstep(s.lowGate, s.highGate, ridgeNess) * s.weight;
          if (s.target === 'detail') {
            // Weight fine veins by structure tensor coherence so only true directional striations pass
            const cohBoost = 0.45 + 0.55 * coherence[idx];
            detailLines[idx] = Math.min(1, Math.max(detailLines[idx], gatedVal * cohBoost));
          } else {
            anchorLines[idx] = Math.min(1, Math.max(anchorLines[idx], gatedVal));
          }
        }
      }
    }
  }

  if (config.debugAnchorSource2) config.debugAnchorSource2(anchorLines.slice());
  // 3. Crisp NMS Step-Edges (for sharp outer boundaries like Hibiscus petal edges & Trident silhouette)
  const smoothGrad = gaussianBlurFloat(gradMag, width, height, 0.85);
  const gradLow = 0.025 * gateScale * agScale;
  const gradHigh = 0.095 * gateScale * agScale;

  for (let y = 1; y < height - 1; y++) {
    const r1 = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = r1 + x;
      const g = smoothGrad[idx];
      if (g <= gradLow) continue;

      const nx = ty[idx];
      const ny = -tx[idx];
      const x1 = Math.min(width - 1, Math.max(0, Math.round(x + nx)));
      const y1 = Math.min(height - 1, Math.max(0, Math.round(y + ny)));
      const x2 = Math.min(width - 1, Math.max(0, Math.round(x - nx)));
      const y2 = Math.min(height - 1, Math.max(0, Math.round(y - ny)));

      if (g >= smoothGrad[y1 * width + x1] * 0.94 && g >= smoothGrad[y2 * width + x2] * 0.94) {
        const edgeVal = smoothstep(gradLow, gradHigh, g) * config.anchorWeight * scene.portraitFocusBoost;
        anchorLines[idx] = Math.min(1, Math.max(anchorLines[idx], edgeVal));
      }
    }
  }

  if (config.debugAnchorSource) config.debugAnchorSource(anchorLines.slice());

  // 4. Streamline Integration along Edge Tangent Flow (connects lines smoothly like a pulled needle)
  const smoothedAnchor = new Float32Array(N);
  const smoothedDetail = new Float32Array(N);

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      const vx = tx[idx];
      const vy = ty[idx];

      let accA = anchorLines[idx] * 0.44;
      let accD = detailLines[idx] * 0.44;
      const steps = [-2, -1, 1, 2];
      const weights = [0.08, 0.2, 0.2, 0.08];

      for (let k = 0; k < 4; k++) {
        const sx = Math.min(width - 1, Math.max(0, Math.round(x + vx * steps[k])));
        const sy = Math.min(height - 1, Math.max(0, Math.round(y + vy * steps[k])));
        const sIdx = sy * width + sx;
        accA += anchorLines[sIdx] * weights[k];
        accD += detailLines[sIdx] * weights[k];
      }
      smoothedAnchor[idx] = Math.min(1, accA);
      smoothedDetail[idx] = Math.min(1, accD);
    }
  }

  // 5. Fuse optional ONNX neural edge map with a clean white-paper floor gate
  if (config.neuralEdgeMap && config.neuralEdgeMap.length === N) {
    for (let i = 0; i < N; i++) {
      // Gate out low-level neural background haze (< 0.22) so it never muddies white petals/skin
      const gatedNeural = smoothstep(0.22, 0.72, config.neuralEdgeMap[i]);
      smoothedAnchor[i] = Math.min(1, Math.max(smoothedAnchor[i], gatedNeural * config.anchorWeight));
    }
  }

  // 6. Optional thinning of the anchor layer (default off): one centre pixel per line, then a fixed width.
  const finalAnchor =
    config.thin === true
      ? thinLayer(smoothedAnchor, tx, ty, width, height, config.thinWidth ?? 3)
      : smoothedAnchor;

  return { anchorLines: finalAnchor, detailLines: smoothedDetail };
}

/**
 * STAGE 4: Smooth Tonal Shading + Dark Ocular/Core Pinning (no grainy static)
 * Replaces random LIC static with:
 *  1. Dark Feature Core Pinning: pupils, eyelashes, nostrils, lip lines, flower centers and deep
 *     crevices are pinned to rich dark indigo-violet so portraits have instant lifelike depth.
 *  2. Highlight Bleaching: any pixel brighter than its local neighborhood or above 0.72 brightness
 *     gets no shading, so petals and beard curls stay paper white.
 *  3. Smooth Directional Tonal Gradient: soft, noise-free shading in recessed shadow pockets.
 */
function computeCleanTonalAndCoreShading(
  normLum: Float32Array,
  localMeanLarge: Float32Array,
  coherence: Float32Array,
  anchorLines: Float32Array,
  width: number,
  height: number,
  config: HectographV3Config,
  scene: SceneProfile
): { coreDarkPin: Float32Array; smoothShading: Float32Array } {
  const N = width * height;
  const coreDarkPin = new Float32Array(N);
  const smoothShading = new Float32Array(N);

  const smoothTone = gaussianBlurFloat(normLum, width, height, 1.8);
  const medMean = gaussianBlurFloat(normLum, width, height, 9.0);

  // Halo mask around anchor lines so midtone shading leaves crisp breathing room
  const anchorHalo =
    config.haloProtection > 0
      ? gaussianBlurFloat(anchorLines, width, height, config.haloProtection)
      : anchorLines;

  const effectiveShadingStrength = config.flowShadingStrength * scene.shadingMultiplier;

  for (let i = 0; i < N; i++) {
    const L = smoothTone[i];
    const localDarkness = Math.max(0, localMeanLarge[i] - L);
    const medDarkness = Math.max(0, medMean[i] - L);

    // 1. Dark Ocular / Feature Core Pinning:
    // Fires on true dark focal points (pupils, irises, nostrils, mouth corners, flower centers, deep shadow cores)
    // Only pin darkness that has local structure around it (a pupil, a nostril, a crease). A flat dark mass
    // such as a black backdrop or solid fur is not a focal point, and pinning it floods the page with ink.
    const flatDarkArea = 1 - smoothstep(0.30, 0.55, 1.0 - medMean[i]);
    const structureGate = Math.min(1, medDarkness / 0.06 + flatDarkArea);
    const absoluteDark = smoothstep(0.58, 0.88, 1.0 - L) * structureGate;
    const relativeDarkPocket = smoothstep(0.05, 0.24, medDarkness);
    coreDarkPin[i] = Math.min(
      1,
      (absoluteDark * 0.65 + relativeDarkPocket * 0.55) *
        Math.max(absoluteDark, relativeDarkPocket) *
        scene.portraitFocusBoost
    );

    if (effectiveShadingStrength <= 0.01) continue;

    // 2. Highlight Bleaching Gate:
    // If a pixel is in the upper-midtone/highlight range, shading goes to 0 so paper stays pure white.
    const shadowZone = smoothstep(0.32, 0.78, 1.0 - L);
    const recessedPocket = smoothstep(0.02, 0.18, localDarkness);

    const haloSuppress = Math.max(0.15, 1.0 - anchorHalo[i] * 0.65);
    const rawShade = (shadowZone * 0.55 + recessedPocket * 0.45) * effectiveShadingStrength * haloSuppress;

    // Subtle directional sheen along coherent structures (petals/hair) without any random noise
    const directionalSheen = 0.85 + 0.15 * coherence[i];
    smoothShading[i] = Math.min(1, rawShade * directionalSheen);
  }

  return { coreDarkPin, smoothShading };
}

/**
 * STAGE 6: Speckle cleanup.
 * Removes tiny disconnected ink fragments (stray dots beside whiskers and fur edges) from the finished page.
 * A fragment is kept if it is large enough OR long enough to be a real thin line (a whisker strand), so
 * fine detail survives. Deterministic: scan order only, no randomness.
 */
const SPECKLE_MIN_PIXELS = 14;
const SPECKLE_KEEP_EXTENT = 12;
const SPECKLE_INK_BELOW = 235;

/**
 * Whitens connected components (8-neighbour) of STRONG ink smaller than `minPixels`, whatever their length.
 * Strong ink = 255 - min(R,G,B) >= 90. Faint pixels around a component are left alone, so only the tiny
 * strong core is removed and its faint halo is cleaned up with it when it has no strong neighbour left.
 */
export function removeStrongSpecks(out: ImageData, minPixels: number): void {
  const { width, height, data } = out;
  const N = width * height;
  const strong = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    if (255 - Math.min(data[p], data[p + 1], data[p + 2]) >= 90) strong[i] = 1;
  }
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const members = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (!strong[start] || seen[start]) continue;
    let sp = 0;
    let count = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp > 0) {
      const idx = stack[--sp];
      members[count++] = idx;
      const x = idx % width;
      const y = (idx / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || (dx === 0 && dy === 0)) continue;
          const q = ny * width + nx;
          if (strong[q] && !seen[q]) {
            seen[q] = 1;
            stack[sp++] = q;
          }
        }
      }
    }
    if (count < minPixels) {
      for (let k = 0; k < count; k++) {
        const p = members[k] * 4;
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
      }
    }
  }
}

function removeSpeckle(out: ImageData): void {
  const { width, height, data } = out;
  const N = width * height;
  const isInk = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    if ((data[p] + data[p + 1] + data[p + 2]) / 3 < SPECKLE_INK_BELOW) isInk[i] = 1;
  }
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const members = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (!isInk[start] || seen[start]) continue;
    let sp = 0;
    let count = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp > 0) {
      const idx = stack[--sp];
      members[count++] = idx;
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || (dx === 0 && dy === 0)) continue;
          const q = ny * width + nx;
          if (isInk[q] && !seen[q]) {
            seen[q] = 1;
            stack[sp++] = q;
          }
        }
      }
    }
    const extent = Math.max(maxX - minX + 1, maxY - minY + 1);
    if (count < SPECKLE_MIN_PIXELS && extent < SPECKLE_KEEP_EXTENT) {
      for (let k = 0; k < count; k++) {
        const p = members[k] * 4;
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
      }
    }
  }
}

/**
 * STAGE 5: Multi-Tone Hectograph Purple & Pro Graphite Compositor
 * Takes RGBA ImageData, returns opaque RGBA ImageData on white paper.
 */
export function renderHectographStencilV3(
  imageData: ImageData,
  userConfig: Partial<HectographV3Config> = {}
): ImageData {
  const config: HectographV3Config = { ...DEFAULT_HECTOGRAPH_V3_CONFIG, ...userConfig };
  const { width, height, data } = imageData;
  const N = width * height;

  // 1. Extract perceptual luminance [0..1]
  const rawLum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const p = i * 4;
    const alpha = data[p + 3] / 255.0;
    const r = (data[p] / 255.0) * alpha + (1.0 - alpha);
    const g = (data[p + 1] / 255.0) * alpha + (1.0 - alpha);
    const b = (data[p + 2] / 255.0) * alpha + (1.0 - alpha);
    rawLum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 2. Profile image characteristics (Soft Portrait vs Botanical vs Dense Aztec Carving)
  const scene = analyzeSceneProfile(rawLum, width, height);

  // 3. Noise-Gated Local Contrast & Dynamic Range Stretch
  const { normLum, detailEnhancedLum, localMeanLarge } = normalizeToneAndDetail(
    rawLum,
    width,
    height,
    config.localContrastBoost,
    scene
  );

  // 4. Structure Tensor Edge Tangent Flow (ETF) & Coherence
  const { tx, ty, gradMag, coherence } = computeEdgeTangentFlow(detailEnhancedLum, width, height);

  // 5. Noise-Gated Hessian Centerlines + Flow-Aligned XDoG Contours
  const { anchorLines, detailLines } = extractCleanLinesAndVeins(
    detailEnhancedLum,
    normLum,
    gradMag,
    coherence,
    tx,
    ty,
    width,
    height,
    config,
    scene
  );

  // 6. Clean Tonal Shading + Dark Feature Pinning (Eyes, Nostrils, Flower Cores)
  const { coreDarkPin, smoothShading } = computeCleanTonalAndCoreShading(
    normLum,
    localMeanLarge,
    coherence,
    anchorLines,
    width,
    height,
    config,
    scene
  );

  // 7. Composite into Multi-Tone Hectograph Violet, Pro Graphite, or Thermal Binary
  const out = new ImageData(width, height);
  const dst = out.data;

  // Pass 1: the raw combined ink of every pixel, before any paper gate.
  const rawInk = new Float32Array(N);
  if (config.debugLayers) config.debugLayers({ anchorLines, detailLines, coreDarkPin, smoothShading, width, height });
  for (let i = 0; i < N; i++) {
    const aLine = anchorLines[i];
    const dLine = detailLines[i] * 0.72;
    const cPin = coreDarkPin[i] * 0.88;
    const sShade = smoothShading[i] * 0.52;
    // Combine structural lines, dark feature pins, fine veins, and soft tonal shading
    rawInk[i] = Math.max(aLine, cPin, dLine, sShade) + Math.min(0.22, aLine * 0.25 + cPin * 0.2);
  }

  // The ink budget raises the paper gate just enough to keep inked pixels within `inkBudget` of the page.
  const inkFloor = computeInkFloor(rawInk, config.inkBudget ?? 0.30, config.inkFloorCap ?? MAX_INK_FLOOR);

  // Pass 2: gate, rescale, then colour.
  for (let i = 0; i < N; i++) {
    const aLine = anchorLines[i];
    const cPin = coreDarkPin[i] * 0.88;

    // Anything under the floor is snapped to 0.0 (100% pure #FFFFFF paper)
    const raw = rawInk[i];
    const totalInk = raw < inkFloor ? 0 : Math.min(1, (raw - inkFloor) / (1 - inkFloor));

    const p = i * 4;
    if (config.outputMode === 'hectograph-purple') {
      // 4-stop Hectograph Violet Ramp:
      // 0.00 -> #FFFFFF (255, 255, 255) Pure White Paper
      // 0.30 -> #DFC9FB (223, 201, 251) Delicate Lavender Shading Wash
      // 0.65 -> #8344E4 (131, 68, 228) Crisp Royal Violet Line & Crease
      // 1.00 -> #3A0E86 (58, 14, 134) Deep Hectograph Violet Anchor / Pupil / Core (stays clearly purple, never black)
      let r: number, g: number, b: number;
      if (totalInk <= 0.3) {
        const t = totalInk / 0.3;
        r = 255 + (223 - 255) * t;
        g = 255 + (201 - 255) * t;
        b = 255 + (251 - 255) * t;
      } else if (totalInk <= 0.68) {
        const t = (totalInk - 0.3) / 0.38;
        r = 223 + (131 - 223) * t;
        g = 201 + (68 - 201) * t;
        b = 251 + (228 - 251) * t;
      } else {
        const t = (totalInk - 0.68) / 0.32;
        r = 131 + (58 - 131) * t;
        g = 68 + (14 - 68) * t;
        b = 228 + (134 - 228) * t;
      }
      dst[p] = Math.round(r);
      dst[p + 1] = Math.round(g);
      dst[p + 2] = Math.round(b);
      dst[p + 3] = 255;
    } else if (config.outputMode === 'pro-graphite') {
      const v = Math.round(255 * (1.0 - Math.pow(totalInk, 0.95)));
      dst[p] = v;
      dst[p + 1] = v;
      dst[p + 2] = v;
      dst[p + 3] = 255;
    } else {
      const x = i % width;
      const y = (i / width) | 0;
      const bayer4x4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const threshold = (bayer4x4[(y & 3) * 4 + (x & 3)] + 0.5) / 16.0;
      const isInk = aLine > 0.45 || cPin > 0.55 || totalInk * 0.72 > threshold;
      const v = isInk ? 0 : 255;
      dst[p] = v;
      dst[p + 1] = v;
      dst[p + 2] = v;
      dst[p + 3] = 255;
    }
  }

  // 8. Clear stray specks. Skipped for the 1-bit mode, where dithered dots are intentionally small.
  if (config.outputMode !== 'thermal-binary') removeSpeckle(out);
  if (config.outputMode !== 'thermal-binary' && (config.strongSpeckPixels ?? 0) > 0) removeStrongSpecks(out, config.strongSpeckPixels as number);

  return out;
}
