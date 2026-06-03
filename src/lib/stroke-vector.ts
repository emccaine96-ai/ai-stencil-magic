/**
 * Hybrid raster↔vector stroke spine.
 *
 * Every stroke is dual-stored: pixels go into TileEngine for instant display
 * AND a list of (x,y,pressure) samples is kept on the stroke spine for later
 * re-render at any resolution, color/brush swap, or vector export.
 *
 * Tools:
 *   - simplifyRDP: Ramer–Douglas–Peucker thin samples while preserving shape.
 *   - fitBeziers: Schneider's C¹-continuous cubic Bézier fit on simplified path.
 *   - strokeBBox: AABB for invalidation.
 *   - strokeToSvgPath: export the spine to crisp SVG `<path d="...">`.
 */

export type StrokeSample = { x: number; y: number; p: number; t: number };
export type CubicBezier = { p0: [number, number]; c1: [number, number]; c2: [number, number]; p1: [number, number] };

export type VectorStroke = {
  id: string;
  brushId: string;
  color: string;
  size: number;
  samples: StrokeSample[];
  beziers?: CubicBezier[];
};

export function strokeBBox(s: VectorStroke, pad = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.samples) {
    if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
  }
  const r = s.size + pad;
  return { x: x0 - r, y: y0 - r, w: (x1 - x0) + r * 2, h: (y1 - y0) + r * 2 };
}

/** Perpendicular distance from point to segment. */
function perpDist(p: StrokeSample, a: StrokeSample, b: StrokeSample): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const px = a.x + t * dx, py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

export function simplifyRDP(points: StrokeSample[], epsilon = 0.8): StrokeSample[] {
  if (points.length < 3) return points.slice();
  let maxDist = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; idx = i; }
  }
  if (maxDist > epsilon) {
    const left = simplifyRDP(points.slice(0, idx + 1), epsilon);
    const right = simplifyRDP(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

/** Lightweight cubic Bézier fit — chord-tangent estimate per segment.
 *  Not full Schneider (which iterates Newton-Raphson reparam) but good enough
 *  for crisp tattoo line vectorization and fast enough to run on every stroke
 *  end. ~O(n) for n simplified samples. */
export function fitBeziers(points: StrokeSample[]): CubicBezier[] {
  if (points.length < 2) return [];
  const out: CubicBezier[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const prev = points[i - 1] ?? p0;
    const next = points[i + 2] ?? p1;
    // Catmull-Rom -> cubic Bézier conversion (tension 0.5).
    const c1x = p0.x + (p1.x - prev.x) / 6;
    const c1y = p0.y + (p1.y - prev.y) / 6;
    const c2x = p1.x - (next.x - p0.x) / 6;
    const c2y = p1.y - (next.y - p0.y) / 6;
    out.push({ p0: [p0.x, p0.y], c1: [c1x, c1y], c2: [c2x, c2y], p1: [p1.x, p1.y] });
  }
  return out;
}

export function strokeToSvgPath(s: VectorStroke): string {
  const bez = s.beziers ?? fitBeziers(simplifyRDP(s.samples));
  if (!bez.length) return "";
  let d = `M ${bez[0].p0[0].toFixed(2)} ${bez[0].p0[1].toFixed(2)}`;
  for (const b of bez) {
    d += ` C ${b.c1[0].toFixed(2)} ${b.c1[1].toFixed(2)}, ${b.c2[0].toFixed(2)} ${b.c2[1].toFixed(2)}, ${b.p1[0].toFixed(2)} ${b.p1[1].toFixed(2)}`;
  }
  return d;
}

/** Sample a cubic at t∈[0,1]. */
export function cubicAt(b: CubicBezier, t: number): [number, number] {
  const u = 1 - t;
  const x = u*u*u*b.p0[0] + 3*u*u*t*b.c1[0] + 3*u*t*t*b.c2[0] + t*t*t*b.p1[0];
  const y = u*u*u*b.p0[1] + 3*u*u*t*b.c1[1] + 3*u*t*t*b.c2[1] + t*t*t*b.p1[1];
  return [x, y];
}

/** Walk the entire bezier spine in equal-arc-length steps for re-stroking. */
export function* walkSpine(beziers: CubicBezier[], step = 2): Generator<[number, number, number]> {
  for (let bi = 0; bi < beziers.length; bi++) {
    const b = beziers[bi];
    const approxLen = Math.hypot(b.p1[0] - b.p0[0], b.p1[1] - b.p0[1]) + 0.0001;
    const n = Math.max(2, Math.ceil(approxLen / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const [x, y] = cubicAt(b, t);
      yield [x, y, bi + t / n]; // global param for pressure interp
    }
  }
}
