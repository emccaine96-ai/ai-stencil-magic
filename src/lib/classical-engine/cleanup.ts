/**
 * Module 9 — Line cleanup.
 * Speck removal via connected-component area filter + morphological close
 * for bridging small gaps in linework.
 */

// Extracted from what was previously inlined only inside
// removeSmallInkSpecks below, so touch-up/canvas-engine.ts's Remove Fill
// tool can reuse the exact same flood-fill instead of a second
// implementation (per touch-up-studio-implementation.md's explicit
// instruction not to duplicate this). Pure refactor -- same algorithm,
// same traversal order, same result; removeSmallInkSpecks's behavior is
// unchanged (verified via the regression suite).
export function findConnectedComponent(
  ink: Uint8ClampedArray,
  w: number,
  h: number,
  start: number,
  visited: Uint8Array,
): number[] {
  const component: number[] = [];
  const stack: number[] = [start];
  visited[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    component.push(i);
    const x = i % w, y = (i / w) | 0;
    const neighbors = [x > 0 ? i - 1 : -1, x + 1 < w ? i + 1 : -1, y > 0 ? i - w : -1, y + 1 < h ? i + w : -1];
    for (const ni of neighbors) if (ni >= 0 && ink[ni] !== 0 && !visited[ni]) { visited[ni] = 1; stack.push(ni); }
  }
  return component;
}

export function removeSmallInkSpecks(ink: Uint8ClampedArray, w: number, h: number, minPx: number): Uint8ClampedArray {
  const n = w * h;
  const visited = new Uint8Array(n);
  const out = Uint8ClampedArray.from(ink);

  for (let start = 0; start < n; start++) {
    if (ink[start] === 0 || visited[start]) continue;
    const component = findConnectedComponent(ink, w, h, start, visited);
    if (component.length < minPx) for (const i of component) out[i] = 0;
  }
  return out;
}

function morphDilate(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(src);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (src[y * w + x] !== 0) continue;
    let hit = false;
    for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      if (src[yy * w + xx] !== 0) { hit = true; break; }
    }
    if (hit) out[y * w + x] = 255;
  }
  return out;
}

function morphErode(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(src);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (src[y * w + x] === 0) continue;
    let allInk = true;
    for (let dy = -r; dy <= r && allInk; dy++) for (let dx = -r; dx <= r; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w || src[yy * w + xx] === 0) { allInk = false; break; }
    }
    if (!allInk) out[y * w + x] = 0;
  }
  return out;
}

export function morphClose(ink: Uint8ClampedArray, w: number, h: number, radius = 1): Uint8ClampedArray {
  return morphErode(morphDilate(ink, w, h, radius), w, h, radius);
}
