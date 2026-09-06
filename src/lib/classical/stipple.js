/**
 * True blue-noise stippling via Poisson-disk sampling (Bridson's algorithm),
 * density-modulated by local darkness.
 *
 * Replaces the previous grid-jitter approximation, which read as a faint
 * regular grid under scrutiny — real blue noise has no periodicity and no
 * clumping. Uses the shared DeterministicRNG so output stays deterministic
 * (same input dimensions = same dot pattern).
 */
import { createImageRNG } from './deterministic-rng.js';

/**
 * Bridson's Poisson-disk sampling. Generates points with a minimum distance
 * apart and no visible periodicity — the core blue-noise property.
 * Active-list removal uses swap-and-pop (O(1)) instead of splice (O(n)) —
 * pure performance optimization, does not change the point distribution.
 * A point-count safety cap prevents runaway generation time on very large
 * canvases; well above what any real image needs, so it never visibly
 * triggers in normal use.
 */
function poissonDiskPoints(width, height, minDist, rng, maxAttempts = 30) {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.max(1, Math.ceil(width / cellSize));
  const gridH = Math.max(1, Math.ceil(height / cellSize));
  const grid = new Array(gridW * gridH).fill(null);
  const points = [];
  const active = [];
  const maxPoints = 400000; // safety cap — normal images stay far below this

  const gridIndex = (x, y) => Math.floor(y / cellSize) * gridW + Math.floor(x / cellSize);
  const fits = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const gx = Math.floor(x / cellSize), gy = Math.floor(y / cellSize);
    for (let j = Math.max(0, gy - 2); j <= Math.min(gridH - 1, gy + 2); j++) {
      for (let i = Math.max(0, gx - 2); i <= Math.min(gridW - 1, gx + 2); i++) {
        const p = grid[j * gridW + i];
        if (p && (p[0] - x) ** 2 + (p[1] - y) ** 2 < minDist * minDist) return false;
      }
    }
    return true;
  };

  const first = [rng.next() * width, rng.next() * height];
  points.push(first);
  active.push(first);
  grid[gridIndex(first[0], first[1])] = first;

  while (active.length && points.length < maxPoints) {
    const idx = Math.floor(rng.next() * active.length);
    const [cx, cy] = active[idx];
    let placed = false;
    for (let a = 0; a < maxAttempts; a++) {
      const ang = rng.next() * Math.PI * 2;
      const rad = minDist * (1 + rng.next());
      const nx = cx + Math.cos(ang) * rad;
      const ny = cy + Math.sin(ang) * rad;
      if (fits(nx, ny)) {
        const p = [nx, ny];
        points.push(p);
        active.push(p);
        grid[gridIndex(nx, ny)] = p;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // O(1) removal: swap-and-pop instead of splice. Same effect
      // (this candidate is exhausted), same resulting distribution —
      // just avoids an O(n) shift on every removal.
      const last = active.length - 1;
      active[idx] = active[last];
      active.pop();
    }
  }
  // Audit Fix #4, confirmed 2026-09-06: previously, hitting the safety cap
  // truncated generation wherever the random active-list walk happened to
  // be -- not uniformly -- leaving some regions with zero stipple coverage
  // and no signal anywhere that it happened. Dev-only warning; zero
  // behavior change to the actual point set, zero production console noise.
  if (points.length >= maxPoints && import.meta.env?.DEV) {
    console.warn(
      `[stipple] Hit maxPoints safety cap (${maxPoints}) before Poisson-disk ` +
      `generation completed naturally on a ${width}x${height} canvas. Some ` +
      `regions may have incomplete stipple coverage. Consider raising ` +
      `maxPoints or increasing minDist for this resolution.`
    );
  }
  return points;
}

export function stochasticStipple(imageData, opts = {}) {
  const { width, height, data } = imageData;
  const minRadius = opts.minRadius ?? 0.6;
  const maxRadius = opts.maxRadius ?? 2.2;
  const baseSpacing = opts.spacing ?? 4;

  const scale = Math.max(0.5, Math.min(width, height) / 1024);
  // Denser candidate field than the final visible spacing — matches the
  // point-thinning-by-tone approach below (darker areas keep more points).
  const minDist = Math.max(1.5, baseSpacing * scale * 0.7);
  const minR = minRadius * scale;
  const maxR = maxRadius * scale;

  const out = new ImageData(width, height);
  const o = out.data;
  for (let i = 0; i < o.length; i += 4) {
    o[i] = o[i + 1] = o[i + 2] = 255;
    o[i + 3] = 255;
  }

  const rng = createImageRNG(width, height);
  const points = poissonDiskPoints(width, height, minDist, rng);

  // Supersampled, sub-pixel-precise circle rasterization. The dot radii this
  // function actually receives are tiny (~0.4-2px after minRadius/maxRadius
  // are scaled down for a typical portrait's working resolution) -- at that
  // size, a single-sample point-in-circle test per pixel (the previous
  // version: round the center to the nearest integer pixel, then test each
  // candidate pixel's own center against the circle) produces visibly
  // jagged, inconsistently-shaped blobs from dot to dot -- some render as a
  // single pixel, some as an L-shape or diamond -- because it throws away
  // the sub-pixel part of the dot's true position and only has one sample
  // per pixel to decide a curved edge. This is the actual cause of dots
  // reading as "fuzzy"/irregular rather than clean round dots.
  // Fix: keep the float center (cx, cy) as-is (no upfront rounding), and for
  // each candidate pixel, take a 3x3 grid of sub-samples and use a majority
  // vote (>=5 of 9 covered) to decide ink/no-ink. This approximates true
  // circular *area* coverage instead of a single point sample, giving much
  // more consistent, round-looking dot shapes at small radii. Output stays
  // strictly binary black/white -- no anti-aliased/gray edges -- since a
  // real tattoo stencil needs clean, printable ink, not soft gradients.
  const SS = 3;
  const subStep = 1 / SS;
  const subHalf = subStep / 2;
  const majorityNeeded = Math.ceil((SS * SS) / 2);
  const drawDot = (cx, cy, r) => {
    if (r < 0.35) return;
    const rInt = Math.ceil(r) + 1;
    const cxi = Math.floor(cx), cyi = Math.floor(cy);
    for (let dy = -rInt; dy <= rInt; dy++) {
      const ny = cyi + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -rInt; dx <= rInt; dx++) {
        const nx = cxi + dx;
        if (nx < 0 || nx >= width) continue;
        let covered = 0;
        for (let sy = 0; sy < SS; sy++) {
          const py = ny + subHalf + sy * subStep;
          const ddy = py - cy;
          for (let sx = 0; sx < SS; sx++) {
            const px = nx + subHalf + sx * subStep;
            const ddx = px - cx;
            if (ddx * ddx + ddy * ddy <= r * r) covered++;
          }
        }
        if (covered >= majorityNeeded) {
          const idx = (ny * width + nx) * 4;
          o[idx] = o[idx + 1] = o[idx + 2] = 0;
        }
      }
    }
  };

  for (const [x, y] of points) {
    const sx = Math.min(width - 1, Math.max(0, Math.round(x)));
    const sy = Math.min(height - 1, Math.max(0, Math.round(y)));
    const lum = data[(sy * width + sx) * 4];
    const darkness = 1 - lum / 255;
    if (darkness <= 0.02) continue;

    const gamma = Math.pow(darkness, 0.75);
    if (rng.next() > gamma) continue; // density thinning by tone; points themselves stay blue-noise distributed

    const radius = minR + (maxR - minR) * gamma * (0.75 + rng.next() * 0.5);
    drawDot(x, y, radius);
  }

  return out;
}

export function combineEdgeAndDither(edges, dither) {
  const { width, height } = edges;
  const out = new ImageData(width, height);
  const e = edges.data, d = dither.data, o = out.data;
  for (let i = 0; i < e.length; i += 4) {
    const v = (e[i] < 128 || d[i] < 128) ? 0 : 255;
    o[i] = o[i + 1] = o[i + 2] = v;
    o[i + 3] = 255;
  }
  return out;
}
