// Shared helpers for the V3.2 sweep: load the nine example pairs with sharp, render, score, tabulate.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scorePair, meanRow } from '../../src/lib/calibration/engine-metrics.js';
import { renderHectographStencilV3, type HectographV3Config } from '../../src/lib/classical-v3/hectograph-engine';
import { STENCIL_V3_PRESETS } from '../../src/lib/classical-v3/useHectographEngineV3';
import { V3_MAX_EDGE, fitWithin } from '../../src/lib/classical-v3/prepare-input';

// Node has no ImageData; the engine only needs {data,width,height} from the constructor.
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class { data: Uint8ClampedArray; width: number; height: number; constructor(a: any, b: any, c?: any) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c; } } };
}

export const PAIRS = ['hibiscus', 'elder', 'baby', 'poseidon', 'aztec', 'portrait', 'detail', 'floral-back', 'shoulder'] as const;
export type Img = { data: Uint8ClampedArray; width: number; height: number };

const EXAMPLES = join(process.cwd(), 'public/examples');
const find = (id: string, kind: 'before' | 'after') => {
  for (const ext of ['webp', 'jpg', 'png']) { try { readFileSync(join(EXAMPLES, `${id}-${kind}.${ext}`)); return join(EXAMPLES, `${id}-${kind}.${ext}`); } catch { /* next */ } }
  throw new Error(`missing ${id}-${kind}`);
};

/** Decode to RGBA. `maxEdge` applies the same never-upscale rule the app's photoToImageData uses. */
export async function load(path: string, maxEdge?: number): Promise<Img> {
  const m = await sharp(path).rotate().metadata();
  const sz = maxEdge ? fitWithin(m.width!, m.height!, maxEdge) : { width: m.width!, height: m.height! };
  // flatten onto white, as photoToImageData does for transparent photos
  const raw = await sharp(path).rotate().flatten({ background: '#ffffff' }).resize(sz.width, sz.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  return { data: new Uint8ClampedArray(raw), width: sz.width, height: sz.height };
}

export type Loaded = { id: string; photo: Img; ref: Img };
export async function loadPairs(): Promise<Loaded[]> {
  const out: Loaded[] = [];
  for (const id of PAIRS) out.push({ id, photo: await load(find(id, 'before'), V3_MAX_EDGE), ref: await load(find(id, 'after')) });
  return out;
}

export type Row = { f1: number; recall: number; precision: number; ink: number; stroke: number; hnoise: number; specks: number; offedge: number; ms: number };
export const COLS: (keyof Row)[] = ['f1', 'recall', 'precision', 'ink', 'stroke', 'hnoise', 'specks', 'offedge', 'ms'];

/** Render one pair with a config and score it exactly as the evaluation did (scorePair, source for off-edge ink). */
export function runPair(p: Loaded, cfg: Partial<HectographV3Config>, post?: (o: Img) => Img): Row & { id: string } {
  const input = { data: new Uint8ClampedArray(p.photo.data), width: p.photo.width, height: p.photo.height } as unknown as ImageData;
  const t0 = performance.now();
  let out = renderHectographStencilV3(input, cfg) as unknown as Img;
  if (post) out = post(out);
  const ms = performance.now() - t0;
  const s = scorePair(out, p.ref, { source: p.photo, ms });
  // The evaluation doc's F1/recall/precision are the 2 px tolerance columns (verified: 0.753 / 0.826 / 0.741 vs doc 0.753 / 0.826 / 0.740).
  return { id: p.id, f1: s.f1_2, recall: s.recall2, precision: s.precision2, ink: s.predCoverage, stroke: s.widthMedian, hnoise: s.highlightNoise, specks: s.specks100k, offedge: s.offEdgeInk, ms: s.ms };
}

export function mean(rows: Row[]): Row { return meanRow(rows) as Row; }
export const presetConfig = (id: 'tattoo-clean' | 'hectograph-rich'): HectographV3Config => ({ ...STENCIL_V3_PRESETS[id].config });

export function fmt(r: Row): string {
  return `${r.f1.toFixed(3)} | ${r.recall.toFixed(3)} | ${r.precision.toFixed(3)} | ${r.ink.toFixed(3)} | ${r.stroke.toFixed(3)} | ${r.hnoise.toFixed(3)} | ${r.specks.toFixed(3)} | ${r.offedge.toFixed(3)} | ${Math.round(r.ms)}`;
}
export const HEADER = '| Config | F1 | Recall | Precision | Ink coverage | Stroke px | Highlight noise | Specks/100k | Off-edge ink | ms |\n|---|---|---|---|---|---|---|---|---|---|';
