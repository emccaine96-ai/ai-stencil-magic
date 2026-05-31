// Pre-generation shading filters applied as a post-pass on the returned
// purple-on-white stencil. Three styles:
//  - whip:     directional scatter from shadow boundaries.
//  - pendulum: U-curve symmetric tapering across midtones.
//  - stipple:  blue-noise dot field replacing solid gray fills.
//
// Each takes the stencil dataURL and returns a new dataURL.

export type ShadingKind = "none" | "whip" | "pendulum" | "stipple";

const INK = "#A855F7";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export async function applyShadingFilter(srcDataUrl: string, kind: ShadingKind): Promise<string> {
  if (kind === "none") return srcDataUrl;
  const img = await loadImage(srcDataUrl);
  const W = Math.min(img.width, 1024);
  const H = Math.round((W / img.width) * img.height);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  // Build a binary ink mask.
  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  const mask = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const dist = (255 - px[i]) + (255 - px[i + 1]) + (255 - px[i + 2]);
    mask[j] = dist > 40 ? 1 : 0;
  }

  if (kind === "whip") {
    // Find shadow boundaries (mask edges) and flick dots along a vector.
    ctx.fillStyle = INK;
    const dx = Math.cos((30 * Math.PI) / 180);
    const dy = Math.sin((30 * Math.PI) / 180);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const j = y * W + x;
        if (!mask[j]) continue;
        // Detect boundary cells
        const edge = !mask[j - 1] || !mask[j + 1] || !mask[j - W] || !mask[j + W];
        if (!edge) continue;
        // Flick: dots along (dx, dy) with exponential density falloff.
        const steps = 18;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const radius = 0.8 + (1 - t) * 1.6;
          const alpha = Math.pow(1 - t, 1.8);
          const xx = Math.round(x + dx * s * 1.3 + (Math.random() - 0.5) * 1.5);
          const yy = Math.round(y + dy * s * 1.3 + (Math.random() - 0.5) * 1.5);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          ctx.globalAlpha = alpha * 0.85;
          ctx.beginPath();
          ctx.arc(xx, yy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  } else if (kind === "pendulum") {
    // U-curve density across each horizontal slice of ink: dense center,
    // tapered at outer edges via symmetric falloff.
    ctx.fillStyle = INK;
    for (let y = 0; y < H; y += 2) {
      // find run extents on this row
      let runStart = -1;
      for (let x = 0; x <= W; x++) {
        const inside = x < W && mask[y * W + x];
        if (inside && runStart < 0) runStart = x;
        if ((!inside || x === W) && runStart >= 0) {
          const runEnd = x - 1;
          const len = runEnd - runStart + 1;
          if (len > 4) {
            const mid = (runStart + runEnd) / 2;
            const half = len / 2;
            for (let xx = runStart; xx <= runEnd; xx += 1) {
              // U-shape: density peaks at center
              const d = Math.abs(xx - mid) / half; // 0..1
              const density = 1 - d * d; // 1 center, 0 edges
              if (Math.random() < density) {
                ctx.globalAlpha = 0.4 + density * 0.5;
                ctx.fillRect(xx, y, 1.2, 1.2);
              }
            }
          }
          runStart = -1;
        }
      }
    }
    ctx.globalAlpha = 1;
  } else if (kind === "stipple") {
    // Clear the canvas and dot-redraw using ink-density as probability.
    // Build a low-pass density field to control dot spacing.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const cell = 3;
    ctx.fillStyle = INK;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        // average mask in cell
        let sum = 0, n = 0;
        for (let dy = 0; dy < cell; dy++) {
          for (let dx = 0; dx < cell; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= W || yy >= H) continue;
            sum += mask[yy * W + xx]; n++;
          }
        }
        const density = n ? sum / n : 0;
        if (density < 0.05) continue;
        // probability ~ density^0.8, jittered position
        if (Math.random() < density * 0.95) {
          const jx = x + Math.random() * cell;
          const jy = y + Math.random() * cell;
          const r = 0.6 + density * 1.1;
          ctx.beginPath();
          ctx.arc(jx, jy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  return c.toDataURL("image/png");
}