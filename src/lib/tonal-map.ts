// 3D Tonal Map Guide — render dashed contour overlay segmenting an image
// into Dark / Mid / Light zones via 2 Otsu thresholds, marching-squares
// contours along zone boundaries.
//
// Output is a transparent PNG dataURL sized like the source so it can be
// stacked on top of the stencil without touching it.

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
  let t1 = 21, t2 = 42;
  for (let i = 1; i < N - 2; i++) {
    let w0 = 0, mu0 = 0;
    for (let k = 0; k <= i; k++) { w0 += p[k]; mu0 += k * p[k]; }
    if (w0 < 1e-6) continue;
    mu0 /= w0;
    for (let j = i + 1; j < N - 1; j++) {
      let w1 = 0, mu1 = 0;
      for (let k = i + 1; k <= j; k++) { w1 += p[k]; mu1 += k * p[k]; }
      if (w1 < 1e-6) continue;
      mu1 /= w1;
      const w2 = 1 - w0 - w1;
      if (w2 < 1e-6) continue;
      const mu2 = (mu - w0 * mu0 - w1 * mu1) / w2;
      const between = w0 * (mu0 - mu) ** 2 + w1 * (mu1 - mu) ** 2 + w2 * (mu2 - mu) ** 2;
      if (between > best) { best = between; t1 = i; t2 = j; }
    }
  }
  return [Math.round((t1 / N) * 255), Math.round((t2 / N) * 255)];
}

// Trace boundaries of a binary mask using a coarse marching-squares.
// Outputs a set of dashed strokes drawn directly into ctx.
function strokeBoundary(
  ctx: CanvasRenderingContext2D,
  mask: Uint8Array,
  W: number,
  H: number,
  scale: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = mask[y * W + x];
      const tr = mask[y * W + x + 1];
      const bl = mask[(y + 1) * W + x];
      const br = mask[(y + 1) * W + x + 1];
      const idx = tl | (tr << 1) | (br << 2) | (bl << 3);
      if (idx === 0 || idx === 15) continue;
      const cx = (x + 0.5) * scale, cy = (y + 0.5) * scale;
      // Short marching segments — good enough as a guide overlay.
      if (idx === 1 || idx === 14) { ctx.moveTo(cx - scale / 2, cy); ctx.lineTo(cx, cy - scale / 2); }
      else if (idx === 2 || idx === 13) { ctx.moveTo(cx, cy - scale / 2); ctx.lineTo(cx + scale / 2, cy); }
      else if (idx === 4 || idx === 11) { ctx.moveTo(cx + scale / 2, cy); ctx.lineTo(cx, cy + scale / 2); }
      else if (idx === 8 || idx === 7) { ctx.moveTo(cx, cy + scale / 2); ctx.lineTo(cx - scale / 2, cy); }
      else if (idx === 3 || idx === 12) { ctx.moveTo(cx - scale / 2, cy); ctx.lineTo(cx + scale / 2, cy); }
      else if (idx === 6 || idx === 9) { ctx.moveTo(cx, cy - scale / 2); ctx.lineTo(cx, cy + scale / 2); }
    }
  }
  ctx.stroke();
}

export async function buildTonalMap(photoDataUrl: string, outW = 1024): Promise<string> {
  const img = await loadImage(photoDataUrl);
  // Sample at low res for thresholds + mask, render strokes at outW for crispness.
  const sW = 256;
  const sH = Math.max(1, Math.round((sW / img.width) * img.height));
  const sample = document.createElement("canvas");
  sample.width = sW; sample.height = sH;
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

  // Boundary masks: dark/mid and mid/light. We build per-class masks and
  // stroke their joint boundary.
  const darkMask = new Uint8Array(lum.length);
  const lightMask = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) {
    if (lum[i] < t1) darkMask[i] = 1;
    if (lum[i] > t2) lightMask[i] = 1;
  }
  // mid mask is the inverse of (dark | light)

  const H = Math.round((outW / sW) * sH);
  const out = document.createElement("canvas");
  out.width = outW; out.height = H;
  const ctx = out.getContext("2d")!;
  ctx.clearRect(0, 0, outW, H);
  const scale = outW / sW;

  strokeBoundary(ctx, darkMask, sW, sH, scale, "#B91C1C");  // dark→mid
  strokeBoundary(ctx, lightMask, sW, sH, scale, "#FACC15"); // mid→light/highlight
  // mid contour: pixels where neither dark nor light but adjacent to one.
  const midEdge = new Uint8Array(lum.length);
  for (let y = 0; y < sH; y++) {
    for (let x = 0; x < sW; x++) {
      const i = y * sW + x;
      if (darkMask[i] || lightMask[i]) continue;
      const has = (xx: number, yy: number) => {
        if (xx < 0 || yy < 0 || xx >= sW || yy >= sH) return false;
        const j = yy * sW + xx;
        return darkMask[j] || lightMask[j];
      };
      if (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1)) midEdge[i] = 1;
    }
  }
  strokeBoundary(ctx, midEdge, sW, sH, scale, "#F97316"); // mid transitions

  return out.toDataURL("image/png");
}