// Selection mask + tools for PrimalCanvas Studio.
// A selection is a single-channel (0..255) bitmap the size of the canvas.
// 0 = unselected, 255 = fully selected. Anti-aliasing & feather use the mid-range.

export type SelectionMask = {
  width: number;
  height: number;
  /** alpha-only data, length = w*h */
  data: Uint8ClampedArray;
};

export function createMask(w: number, h: number): SelectionMask {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h) };
}

export function isEmpty(m: SelectionMask): boolean {
  // Sample every 64th pixel for a cheap O(n/64) check, then verify.
  for (let i = 0; i < m.data.length; i += 64) if (m.data[i]) return false;
  for (let i = 0; i < m.data.length; i++) if (m.data[i]) return false;
  return true;
}

export function clearMask(m: SelectionMask): void {
  m.data.fill(0);
}

export function invertMask(m: SelectionMask): void {
  for (let i = 0; i < m.data.length; i++) m.data[i] = 255 - m.data[i];
}

/** Rectangle (axis-aligned). */
export function fillRect(m: SelectionMask, x0: number, y0: number, x1: number, y1: number) {
  const xa = Math.max(0, Math.min(m.width, Math.min(x0, x1) | 0));
  const xb = Math.max(0, Math.min(m.width, Math.max(x0, x1) | 0));
  const ya = Math.max(0, Math.min(m.height, Math.min(y0, y1) | 0));
  const yb = Math.max(0, Math.min(m.height, Math.max(y0, y1) | 0));
  for (let y = ya; y < yb; y++) {
    const row = y * m.width;
    for (let x = xa; x < xb; x++) m.data[row + x] = 255;
  }
}

/** Filled ellipse inscribed in bbox. */
export function fillEllipse(m: SelectionMask, x0: number, y0: number, x1: number, y1: number) {
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2,
    ry = Math.abs(y1 - y0) / 2;
  if (rx < 0.5 || ry < 0.5) return;
  const xa = Math.max(0, (cx - rx) | 0),
    xb = Math.min(m.width, (cx + rx + 1) | 0);
  const ya = Math.max(0, (cy - ry) | 0),
    yb = Math.min(m.height, (cy + ry + 1) | 0);
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const dx = (x - cx) / rx,
        dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) m.data[y * m.width + x] = 255;
    }
  }
}

/** Filled polygon (even-odd). points are flat [x0,y0,x1,y1,...] */
export function fillPolygon(m: SelectionMask, points: number[]) {
  if (points.length < 6) return;
  let minY = Infinity,
    maxY = -Infinity;
  for (let i = 1; i < points.length; i += 2) {
    if (points[i] < minY) minY = points[i];
    if (points[i] > maxY) maxY = points[i];
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(m.height - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const nodes: number[] = [];
    let j = points.length - 2;
    for (let i = 0; i < points.length; i += 2) {
      const yi = points[i + 1],
        yj = points[j + 1];
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        nodes.push(points[i] + ((y - yi) / (yj - yi)) * (points[j] - points[i]));
      }
      j = i;
    }
    nodes.sort((a, b) => a - b);
    for (let k = 0; k < nodes.length; k += 2) {
      const xa = Math.max(0, Math.ceil(nodes[k]));
      const xb = Math.min(m.width - 1, Math.floor(nodes[k + 1]));
      const row = y * m.width;
      for (let x = xa; x <= xb; x++) m.data[row + x] = 255;
    }
  }
}

/** Magic wand: flood-fill from (x,y) over pixels within `tolerance` of seed color. */
export function magicWand(
  m: SelectionMask,
  src: ImageData,
  sx: number,
  sy: number,
  tolerance: number,
  contiguous = true,
) {
  const w = src.width,
    h = src.height;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const data = src.data;
  const idx0 = (sy * w + sx) * 4;
  const sr = data[idx0],
    sg = data[idx0 + 1],
    sb = data[idx0 + 2],
    sa = data[idx0 + 3];
  const tol2 = tolerance * tolerance * 3;

  const match = (i: number) => {
    const dr = data[i] - sr,
      dg = data[i + 1] - sg,
      db = data[i + 2] - sb,
      da = data[i + 3] - sa;
    return dr * dr + dg * dg + db * db + da * da * 0.25 <= tol2;
  };

  if (!contiguous) {
    for (let p = 0; p < w * h; p++) if (match(p * 4)) m.data[p] = 255;
    return;
  }

  const stack: number[] = [sy * w + sx];
  const visited = new Uint8Array(w * h);
  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    if (!match(p * 4)) continue;
    m.data[p] = 255;
    const x = p % w,
      y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
}

/** Box-blur feather (separable, fast). radius in px. */
export function featherMask(m: SelectionMask, radius: number) {
  if (radius <= 0) return;
  const r = Math.max(1, Math.floor(radius));
  const w = m.width,
    h = m.height;
  const tmp = new Uint16Array(w * h);
  // Horizontal pass
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = 0; x < r && x < w; x++) acc += m.data[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) acc += m.data[row + x + r];
      if (x - r - 1 >= 0) acc -= m.data[row + x - r - 1];
      const span = Math.min(x + r, w - 1) - Math.max(x - r, 0) + 1;
      tmp[row + x] = Math.round(acc / span);
    }
  }
  // Vertical pass
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = 0; y < r && y < h; y++) acc += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) acc += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) acc -= tmp[(y - r - 1) * w + x];
      const span = Math.min(y + r, h - 1) - Math.max(y - r, 0) + 1;
      m.data[y * w + x] = Math.round(acc / span);
    }
  }
}

/** Marching-ants extraction: pixels with at least one neighbour at different state. */
export function maskOutline(m: SelectionMask, step = 2): Path2D {
  const w = m.width,
    h = m.height;
  const p = new Path2D();
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const v = m.data[y * w + x] > 127;
      const l = x > 0 ? m.data[y * w + (x - 1)] > 127 : false;
      const u = y > 0 ? m.data[(y - 1) * w + x] > 127 : false;
      if (v !== l) {
        p.moveTo(x, y);
        p.lineTo(x, y + step);
      }
      if (v !== u) {
        p.moveTo(x, y);
        p.lineTo(x + step, y);
      }
    }
  }
  return p;
}

/** Compute axis-aligned bbox of mask in source pixels. Returns null if empty. */
export function maskBounds(
  m: SelectionMask,
): { x: number; y: number; w: number; h: number } | null {
  const w = m.width,
    h = m.height;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (m.data[row + x] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Apply the mask to a canvas as a clip alpha — returns a new canvas with masked contents. */
export function applyMaskToCanvas(src: HTMLCanvasElement, m: SelectionMask): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const octx = out.getContext("2d")!;
  octx.drawImage(src, 0, 0);
  const img = octx.getImageData(0, 0, out.width, out.height);
  for (let p = 0; p < m.data.length; p++) {
    img.data[p * 4 + 3] = Math.round((img.data[p * 4 + 3] * m.data[p]) / 255);
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Convert a mask to an ImageData (white-on-transparent) for fast drawing. */
export function maskToImageData(m: SelectionMask): ImageData {
  const img = new ImageData(m.width, m.height);
  for (let p = 0; p < m.data.length; p++) {
    img.data[p * 4] = 255;
    img.data[p * 4 + 1] = 255;
    img.data[p * 4 + 2] = 255;
    img.data[p * 4 + 3] = m.data[p];
  }
  return img;
}
