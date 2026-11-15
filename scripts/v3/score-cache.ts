// Cached scoring for the V3 sweeps. A render is keyed by (photo, preset, config) and its metrics are stored on disk,
// so re-scoring a table never re-renders or re-skeletonises. Run long jobs in the background (see run-bg.sh).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPairs, presetConfig, type Loaded } from './sweep-lib';
import { renderHectographStencilV3 } from '../../src/lib/classical-v3/hectograph-engine';
import { scorePair } from '../../src/lib/calibration/engine-metrics.js';
import { strokeBoth, robustStroke } from './stroke-metrics';
import { normalisePair } from '../../src/lib/calibration/engine-metrics.js';

const DIR = join(process.cwd(), '.cache');
mkdirSync(DIR, { recursive: true });
const SRC_VERSION = createHash('sha1').update(readFileSync('src/lib/classical-v3/hectograph-engine.ts')).digest('hex').slice(0, 10);

export type Metrics = { id: string; f1: number; recall: number; precision: number; ink: number; stroke: number; skel: number; robust: number; specks: number; offedge: number; hnoise: number; ms: number };
export type Ref = { id: string; refInk: number; refStrokeScorePair: number; refSkel: number; refRobust: number };

const key = (id: string, preset: string, cfg: unknown) => createHash('sha1').update(JSON.stringify([id, preset, cfg, SRC_VERSION])).digest('hex').slice(0, 16);
let pairsPromise: Promise<Loaded[]> | null = null;
export const pairs = () => (pairsPromise ??= loadPairs());

/** Score one photo with one config. Cached on disk; the cache key includes a hash of the engine source. */
export async function scoreOne(p: Loaded, preset: 'tattoo-clean' | 'hectograph-rich', over: Record<string, unknown>): Promise<Metrics> {
  const file = join(DIR, `m-${key(p.id, preset, over)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const t0 = performance.now();
  const out: any = renderHectographStencilV3({ data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as any, { ...presetConfig(preset), ...over });
  const ms = performance.now() - t0;
  const s: any = scorePair(out, p.ref, { source: p.photo, ms });
  const b = strokeBoth(out, p.ref);
  const m: Metrics = { id: p.id, f1: s.f1_2, recall: s.recall2, precision: s.precision2, ink: s.predCoverage, stroke: s.widthMedian, skel: b.pred.skelDt, robust: b.pred.robust, specks: s.specks100k, offedge: s.offEdgeInk, hnoise: s.highlightNoise, ms };
  writeFileSync(file, JSON.stringify(m));
  return m;
}

/** The Gemini reference's own ink and stroke, per photo, on every measure. Cached. */
export async function refStats(p: Loaded): Promise<Ref> {
  const file = join(DIR, `r-${p.id}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const s: any = scorePair(p.ref, p.ref);
  const b = strokeBoth(p.ref, p.ref);
  const r: Ref = { id: p.id, refInk: s.predCoverage, refStrokeScorePair: s.widthMedian, refSkel: b.ref.skelDt, refRobust: b.ref.robust };
  writeFileSync(file, JSON.stringify(r));
  return r;
}

// ---- bars -------------------------------------------------------------------------------------------------------
export type Bars = Record<string, boolean>;
export const barA = (m: { ink: number; stroke: number; f1: number; specks: number }): Bars => ({ ink: m.ink >= 0.22 && m.ink <= 0.30, stroke: m.stroke <= 3.5, f1: m.f1 >= 0.733, specks: m.specks <= 12 });
export const barB = (m: { ink: number; stroke: number; f1: number; specks: number }): Bars => ({ ink: m.ink >= 0.20 && m.ink <= 0.32, stroke: m.stroke <= 4.0, specks: m.specks <= 15, f1: m.f1 >= 0.68 });
/** Bar C is per photo, relative to THAT photo's Gemini reference and to its own baseline F1. */
export const barC = (m: Metrics, ref: Ref, baseF1: number): Bars => ({
  ink: m.ink >= ref.refInk * 0.75 && m.ink <= ref.refInk * 1.25,
  stroke: m.skel <= ref.refSkel * 1.3,
  specks: m.specks <= 15,
  f1: m.f1 >= baseF1 - 0.03,
});
export const missList = (b: Bars) => Object.entries(b).filter(([, ok]) => !ok).map(([k]) => k);
export const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
