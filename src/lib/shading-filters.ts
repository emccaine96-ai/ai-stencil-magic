// Pre-generation shading filters applied as a post-pass on the returned
// purple-on-white stencil.
//
// The user's mental model (per the reference infographics):
//   - WHIP:     hard dark "head" tapering to a light flick tail.
//   - PENDULUM: dense dark center fading symmetrically out to lighter ends.
//   - STIPPLE: pure microdot field. Dark tones = very dense dots,
//              mid tones = medium density, light = sparse, highlights = blank.
//
// Tonal density is driven by the ORIGINAL photo luminance (not the line
// stencil), so we get a real Dark / Mid / Light gradient in every output.
// Lines from the source stencil are preserved on top so identity / contours
// stay legible.

export type ShadingKind = "none" | "whip" | "pendulum" | "stipple";
export type StyleKind = "hatching" | "solid" | "dotwork" | "hybrid";

const INK = "#A855F7";

// Live style transform — re-renders the existing stencil to mimic the
// selected top-level style WITHOUT calling the AI again.
//   hatching → passthrough (default look)
//   solid    → morphological closing → clean solid contour lines
//   dotwork  → convert the line work to a dot field at varying density
//   hybrid   → solid contours + dotwork in the interior
export async function applyStyleTransform(srcDataUrl: string, style: StyleKind): Promise<string> {
  if (style === "hatching") return srcDataUrl;
  const img = await loadImage(srcDataUrl);
  const W = Math.min(img.width, 1024);
  const H = Math.round((W / img.width) * img.height);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const src = ctx.getImageData(0, 0, W, H);
  const sp = src.data;
  const mask = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < sp.length; i += 4, j++) {
    const d = 255 - sp[i] + (255 - sp[i + 1]) + (255 - sp[i + 2]);
    mask[j] = d > 60 ? 1 : 0;
  }
  // Clear to white before redrawing in target style.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;

  if (style === "solid") {
    // Skeleton-friendly closing: just stamp the existing mask (already line work).
    for (let y = 0, j = 0; y < H; y++) {
      for (let x = 0; x < W; x++, j++) {
        if (mask[j]) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  } else if (style === "dotwork") {
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        if (!mask[y * W + x]) continue;
        if (Math.random() < 0.55) {
          ctx.globalAlpha = 0.6 + Math.random() * 0.4;
          ctx.beginPath();
          ctx.arc(
            x + Math.random() * 2,
            y + Math.random() * 2,
            0.6 + Math.random() * 0.8,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  } else if (style === "hybrid") {
    // Solid contour (edges of the mask) + dots inside.
    // Edge = ink pixel with at least one non-ink neighbour.
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const j = y * W + x;
        if (!mask[j]) continue;
        const isEdge = !mask[j - 1] || !mask[j + 1] || !mask[j - W] || !mask[j + W];
        if (isEdge) {
          ctx.fillRect(x, y, 1, 1);
          continue;
        }
        if (Math.random() < 0.45) {
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.arc(x, y, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  return c.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export async function applyShadingFilter(
  srcDataUrl: string,
  kind: ShadingKind,
  photoDataUrl?: string | null,
): Promise<string> {
  if (kind === "none") return srcDataUrl;
  const img = await loadImage(srcDataUrl);
  const W = Math.min(img.width, 1024);
  const H = Math.round((W / img.width) * img.height);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  // Binary ink mask from the line stencil (purple on white).
  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  const lineMask = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const dist = 255 - px[i] + (255 - px[i + 1]) + (255 - px[i + 2]);
    lineMask[j] = dist > 40 ? 1 : 0;
  }

  // --- Tonal density field from the ORIGINAL photo --------------------
  // density(x,y) ∈ [0..1]   0 = highlight (no marks)   1 = deep shadow.
  const density = new Float32Array(W * H);
  if (photoDataUrl) {
    const photoImg = await loadImage(photoDataUrl);
    const pc = document.createElement("canvas");
    pc.width = W;
    pc.height = H;
    const pctx = pc.getContext("2d")!;
    pctx.drawImage(photoImg, 0, 0, W, H);
    const pdata = pctx.getImageData(0, 0, W, H).data;
    for (let i = 0, j = 0; i < pdata.length; i += 4, j++) {
      const L = 0.299 * pdata[i] + 0.587 * pdata[i + 1] + 0.114 * pdata[i + 2];
      // Map luminance to 4-tier density curve:
      //   <64  shadows  → 1.0
      //   64..128 dark mids → 0.7
      //   128..192 mids → 0.35
      //   192..230 light → 0.12
      //   >230 highlight → 0
      let d;
      if (L < 64) d = 1.0;
      else if (L < 128) d = 0.7;
      else if (L < 192) d = 0.35;
      else if (L < 230) d = 0.12;
      else d = 0;
      density[j] = d;
    }
  } else {
    // Fallback: derive density from the stencil mask coverage in a small window.
    for (let j = 0; j < lineMask.length; j++) density[j] = lineMask[j] ? 0.8 : 0.15;
  }

  // --- Render filter ---------------------------------------------------
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;

  if (kind === "stipple") {
    // Pure microdot field across the whole tonal range. Density-weighted
    // jittered grid → dark = very dense, light = sparse, highlight = blank.
    const cell = 2;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const d = density[y * W + x];
        if (d < 0.04) continue;
        // Number of dots scales with density (0..3 per cell).
        const tries = d > 0.85 ? 3 : d > 0.55 ? 2 : 1;
        for (let t = 0; t < tries; t++) {
          if (Math.random() > d) continue;
          const jx = x + Math.random() * cell;
          const jy = y + Math.random() * cell;
          const r = 0.45 + d * 0.85;
          ctx.globalAlpha = 0.55 + d * 0.45;
          ctx.beginPath();
          ctx.arc(jx, jy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (kind === "whip") {
    // Whip = teardrop strokes. Each stroke seeded in mid+dark tones.
    // Hard dark head, exponentially tapering light tail along a fixed vector.
    const ang = (35 * Math.PI) / 180;
    const dx = Math.cos(ang),
      dy = Math.sin(ang);
    const cell = 4;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const d = density[y * W + x];
        if (d < 0.18) continue;
        if (Math.random() > d * 0.9) continue;
        const len = 4 + d * 14; // longer strokes in darker tones
        const headR = 0.6 + d * 1.6; // fatter head in darker tones
        const steps = Math.ceil(len);
        const sx = x + (Math.random() - 0.5) * cell;
        const sy = y + (Math.random() - 0.5) * cell;
        for (let s = 0; s < steps; s++) {
          const t = s / steps; // 0 = head, 1 = tail
          const r = headR * Math.pow(1 - t, 1.4);
          if (r < 0.15) break;
          ctx.globalAlpha = (0.55 + d * 0.45) * Math.pow(1 - t, 0.6);
          const xx = sx + dx * s;
          const yy = sy + dy * s;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
          ctx.beginPath();
          ctx.arc(xx, yy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else if (kind === "pendulum") {
    // Pendulum = curved arcs swung from a center, dense in the middle and
    // fading symmetrically out toward both ends.
    const cell = 5;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const d = density[y * W + x];
        if (d < 0.18) continue;
        if (Math.random() > d * 0.7) continue;
        const arcLen = 10 + d * 18; // arc length grows with density
        const radius = arcLen * 1.4;
        const cx = x;
        const cy = y + radius * 0.4;
        const startA = -Math.PI / 2 - arcLen / radius / 2;
        const endA = -Math.PI / 2 + arcLen / radius / 2;
        const steps = Math.ceil(arcLen);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps; // 0..1 across the arc
          // U-curve: bright at ends, dark at center.
          const u = 1 - (2 * t - 1) * (2 * t - 1); // 0..1
          const dotR = 0.4 + d * (0.4 + u * 1.2);
          ctx.globalAlpha = (0.35 + d * 0.45) * (0.35 + u * 0.65);
          const a = startA + (endA - startA) * t;
          const xx = cx + Math.cos(a) * radius;
          const yy = cy + Math.sin(a) * radius;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          ctx.beginPath();
          ctx.arc(xx, yy, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.globalAlpha = 1;

  // Re-stamp the original stencil's line work on top so contours stay crisp.
  ctx.globalAlpha = 0.95;
  ctx.drawImage(img, 0, 0, W, H);
  ctx.globalAlpha = 1;

  return c.toDataURL("image/png");
}
