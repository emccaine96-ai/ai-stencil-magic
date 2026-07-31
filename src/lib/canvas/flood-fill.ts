/**
 * Scanline flood fill with tolerance. Operates in-place on ImageData.
 * Returns the number of pixels filled.
 */

export interface FloodFillOptions {
  /** 0-255 per-channel tolerance vs the seed pixel. */
  tolerance?: number;
  /** Fill color as [r, g, b, a] (0-255). */
  color: [number, number, number, number];
  /** If true, treat the whole canvas alpha-0 as fillable (useful on transparent layers). */
  contiguous?: boolean;
}

export function floodFill(img: ImageData, x: number, y: number, opts: FloodFillOptions): number {
  const { width: w, height: h, data } = img;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const tol = Math.max(0, Math.min(255, opts.tolerance ?? 32));
  const [fr, fg, fb, fa] = opts.color;
  const contiguous = opts.contiguous !== false;

  const si = (y * w + x) * 4;
  const sr = data[si],
    sg = data[si + 1],
    sb = data[si + 2],
    sa = data[si + 3];

  const matches = (i: number) => {
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    const da = data[i + 3] - sa;
    return Math.abs(dr) <= tol && Math.abs(dg) <= tol && Math.abs(db) <= tol && Math.abs(da) <= tol;
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [x, y];
  let filled = 0;

  while (stack.length) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    let lx = cx;
    // walk left
    while (lx >= 0 && !visited[cy * w + lx] && matches((cy * w + lx) * 4)) lx--;
    lx++;
    let spanAbove = false,
      spanBelow = false;
    for (let rx = lx; rx < w; rx++) {
      const idx = cy * w + rx;
      if (visited[idx] || !matches(idx * 4)) break;
      visited[idx] = 1;
      const p = idx * 4;
      data[p] = fr;
      data[p + 1] = fg;
      data[p + 2] = fb;
      data[p + 3] = fa;
      filled++;
      if (!contiguous) continue;
      if (cy > 0) {
        const up = (cy - 1) * w + rx;
        const hit = !visited[up] && matches(up * 4);
        if (hit && !spanAbove) {
          stack.push(rx, cy - 1);
          spanAbove = true;
        } else if (!hit) spanAbove = false;
      }
      if (cy < h - 1) {
        const dn = (cy + 1) * w + rx;
        const hit = !visited[dn] && matches(dn * 4);
        if (hit && !spanBelow) {
          stack.push(rx, cy + 1);
          spanBelow = true;
        } else if (!hit) spanBelow = false;
      }
    }
  }
  return filled;
}
