/**
 * Module 6 — Smart tonal simplification (region merging).
 * Quantizes tones then merges tiny islands into their dominant neighbor
 * without blurring. Kills noise islands that posterize alone would leave.
 */

export function quantizeTones(gray: Float32Array, levels: number): Uint8Array {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[Math.round(Math.max(0, Math.min(255, v)))]++;

  let centers = Array.from({ length: levels }, (_, i) => Math.round((i + 0.5) * (256 / levels)));
  for (let iter = 0; iter < 12; iter++) {
    const sums = new Array(levels).fill(0), counts = new Array(levels).fill(0);
    for (let v = 0; v < 256; v++) {
      if (!hist[v]) continue;
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < levels; c++) {
        const d = Math.abs(v - centers[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      sums[best] += v * hist[v]; counts[best] += hist[v];
    }
    centers = centers.map((c, i) => (counts[i] ? sums[i] / counts[i] : c));
  }
  centers.sort((a, b) => a - b);

  const quantized = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    let best = 0, bestDist = Infinity;
    for (let c = 0; c < levels; c++) {
      const d = Math.abs(gray[i] - centers[c]);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    quantized[i] = best;
  }
  return quantized;
}

class UnionFind {
  parent: Int32Array;
  constructor(n: number) { this.parent = new Int32Array(n); for (let i = 0; i < n; i++) this.parent[i] = i; }
  find(x: number): number {
    while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; }
    return x;
  }
  union(a: number, b: number) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent[ra] = rb; }
}

export function mergeSmallRegions(toneIdx: Uint8Array, w: number, h: number, minRegionPx: number): Uint8Array {
  const n = w * h;
  const uf = new UnionFind(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w && toneIdx[i] === toneIdx[i + 1]) uf.union(i, i + 1);
      if (y + 1 < h && toneIdx[i] === toneIdx[i + w]) uf.union(i, i + w);
    }
  }

  const regionSize = new Map<number, number>();
  for (let i = 0; i < n; i++) { const r = uf.find(i); regionSize.set(r, (regionSize.get(r) ?? 0) + 1); }

  const small = new Set<number>();
  for (const [r, size] of regionSize) if (size < minRegionPx) small.add(r);
  if (small.size === 0) return Uint8Array.from(toneIdx);

  const out = Uint8Array.from(toneIdx);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!small.has(uf.find(i))) continue;

      const neighborTones = new Map<number, number>();
      const push = (ni: number) => {
        if (small.has(uf.find(ni))) return;
        neighborTones.set(toneIdx[ni], (neighborTones.get(toneIdx[ni]) ?? 0) + 1);
      };
      if (x > 0) push(i - 1);
      if (x + 1 < w) push(i + 1);
      if (y > 0) push(i - w);
      if (y + 1 < h) push(i + w);

      if (neighborTones.size > 0) {
        let bestTone = out[i], bestCount = -1;
        for (const [t, c] of neighborTones) if (c > bestCount) { bestCount = c; bestTone = t; }
        out[i] = bestTone;
      }
    }
  }
  return out;
}
