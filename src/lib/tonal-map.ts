// 3D Tonal Map Guide — clean, long, *broken* contour lines that mark
// where the photo transitions from one tonal zone to the next. The
// output is a transparent PNG overlaid above the stencil; the underlying
// line work is never modified.
//
// Two tonal boundaries are traced (both via Otsu):
//   - dark   → mid   (red dashed)
//   - light  → mid   (yellow dashed)
//
// Boundary masks are first morphologically smoothed so contours look
// continuous like a topo map, then walked with a "moore neighborhood"
// border tracer to emit one long polyline per region. Each polyline is
// stroked with a dash so the artist can see where tonal transitions sit
// without the stencil being affected in any way.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// Otsu multi-level (2 thresholds -> 3 classes). Fast 1D scan over a 64-bin
// histogram is plenty for guide-line accuracy.
function otsu2(hist: Float64Array): [number, number] {
  const N = 64;
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return [85, 170];
  const p = hist.map((c) => c / total);
  const mu = p.reduce((a, c, i) => a + c * i, 0);
  let best = -Infinity;
  let t1 = 21,
    t2 = 42;
  for (let i = 1; i < N - 2; i++) {
    let w0 = 0,
      mu0 = 0;
    for (let k = 0; k <= i; k++) {
      w0 += p[k];
      mu0 += k * p[k];
    }
    if (w0 < 1e-6) continue;
    mu0 /= w0;
    for (let j = i + 1; j < N - 1; j++) {
      let w1 = 0,
        mu1 = 0;
      for (let k = i + 1; k <= j; k++) {
        w1 += p[k];
        mu1 += k * p[k];
      }
      if (w1 < 1e-6) continue;
      mu1 /= w1;
      const w2 = 1 - w0 - w1;
      if (w2 < 1e-6) continue;
      const mu2 = (mu - w0 * mu0 - w1 * mu1) / w2;
      const between = w0 * (mu0 - mu) ** 2 + w1 * (mu1 - mu) ** 2 + w2 * (mu2 - mu) ** 2;
      if (between > best) {
        best = between;
        t1 = i;
        t2 = j;
      }
    }
  }
  return [Math.round((t1 / N) * 255), Math.round((t2 / N) * 255)];
}

// Box-blur smoothing on a binary mask to produce continuous, less jaggy borders.
function smoothMask(mask: Uint8Array, W: number, H: number, iters = 2): Uint8Array {
  let cur = mask;
  for (let n = 0; n < iters; n++) {
    const out = new Uint8Array(cur.length);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) s += cur[(y + dy) * W + (x + dx)];
        out[y * W + x] = s >= 5 ? 1 : 0;
      }
    }
    cur = out;
  }
  return cur;
}

// Walk the border of every connected region in `mask` using a Moore-neighbor
// tracer. Returns a list of polylines (each an array of [x,y] in mask coords).
function traceContours(mask: Uint8Array, W: number, H: number, minLen = 14): number[][][] {
  const visited = new Uint8Array(mask.length);
  const out: number[][][] = [];
  // 8-neighborhood, clockwise from east.
  const NX = [1, 1, 0, -1, -1, -1, 0, 1];
  const NY = [0, 1, 1, 1, 0, -1, -1, -1];
  const isBorder = (x: number, y: number) => {
    if (!mask[y * W + x]) return false;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return true;
    return (
      !mask[y * W + x - 1] ||
      !mask[y * W + x + 1] ||
      !mask[(y - 1) * W + x] ||
      !mask[(y + 1) * W + x]
    );
  };
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if (visited[idx] || !isBorder(x, y)) continue;
      const poly: number[][] = [[x, y]];
      visited[idx] = 1;
      let cx = x,
        cy = y,
        dir = 0;
      let safety = 0;
      while (safety++ < 4000) {
        let found = false;
        for (let k = 0; k < 8; k++) {
          const nd = (dir + 6 + k) & 7;
          const nx = cx + NX[nd],
            ny = cy + NY[nd];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (isBorder(nx, ny)) {
            cx = nx;
            cy = ny;
            dir = nd;
            const i2 = ny * W + nx;
            if (visited[i2]) {
              found = false;
              break;
            }
            visited[i2] = 1;
            poly.push([cx, cy]);
            found = true;
            break;
          }
        }
        if (!found) break;
        if (cx === x && cy === y) break;
      }
      if (poly.length >= minLen) out.push(poly);
    }
  }
  return out;
}

function strokePolylines(
  ctx: CanvasRenderingContext2D,
  polys: number[][][],
  scale: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([6, 5]);
  ctx.shadowColor = color;
  ctx.shadowBlur = 1.5;
  for (const p of polys) {
    ctx.beginPath();
    // Skip every other vertex for a smoother stroke
    for (let i = 0; i < p.length; i += 2) {
      const [x, y] = p[i];
      const sx = x * scale,
        sy = y * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
}

export async function buildTonalMap(photoDataUrl: string, outW = 1024): Promise<string> {
  const img = await loadImage(photoDataUrl);
  // Sample at low res for thresholds + mask, render strokes at outW for crispness.
  const sW = 220;
  const sH = Math.max(1, Math.round((sW / img.width) * img.height));
  const sample = document.createElement("canvas");
  sample.width = sW;
  sample.height = sH;
  const sctx = sample.getContext("2d")!;
  sctx.drawImage(img, 0, 0, sW, sH);
  const data = sctx.getImageData(0, 0, sW, sH).data;

  const lum = new Uint8Array(sW * sH);
  const hist = new Float64Array(64);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const L = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    lum[j] = L;
    hist[Math.min(63, Math.floor((L / 256) * 64))]++;
  }
  const [t1, t2] = otsu2(hist);

  // Build smooth tonal masks for the two boundaries we care about.
  const darkRaw = new Uint8Array(lum.length);
  const lightRaw = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) {
    if (lum[i] < t1) darkRaw[i] = 1;
    if (lum[i] > t2) lightRaw[i] = 1;
  }
  const darkMask = smoothMask(darkRaw, sW, sH, 2);
  const lightMask = smoothMask(lightRaw, sW, sH, 2);

  const H = Math.round((outW / sW) * sH);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = H;
  const ctx = out.getContext("2d")!;
  ctx.clearRect(0, 0, outW, H);
  const scale = outW / sW;

  const darkPolys = traceContours(darkMask, sW, sH);
  const lightPolys = traceContours(lightMask, sW, sH);
  // Dark → mid boundary in red.
  strokePolylines(ctx, darkPolys, scale, "#EF4444");
  // Mid → light boundary in yellow.
  strokePolylines(ctx, lightPolys, scale, "#FACC15");

  return out.toDataURL("image/png");
}
