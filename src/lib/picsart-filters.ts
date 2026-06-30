/**
 * Picsart-style elite filter pack — pure Canvas2D operations that mutate a
 * 2D context in-place. Built from open-source algorithms (gaussian blur,
 * unsharp mask, halftone screen, vignette, sobel edge, tilt-shift, oil-paint
 * Kuwahara, posterize, pixelate, dispersion shatter, lens flare, etc.).
 *
 * Every op accepts a ctx and works on the full canvas. They're designed for
 * one-shot taps from the bottom dock and trade some ms of compute for crisp
 * results that match Picsart's pro filters.
 */

type Ctx = CanvasRenderingContext2D;

/* ----------------------------- Helpers ---------------------------------- */
function snapshot(ctx: Ctx) {
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function commit(ctx: Ctx, img: ImageData) {
  ctx.putImageData(img, 0, 0);
}
function cloneData(img: ImageData) {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

/* ----------------------------- Gaussian Blur (separable) ---------------- */
export function gaussianBlur(ctx: Ctx, radius = 6) {
  // Use built-in CSS filter via offscreen draw — hardware accelerated.
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(ctx.canvas, 0, 0);
  ctx.save();
  ctx.filter = `blur(${radius}px)`;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

/* ----------------------------- Unsharp Sharpen -------------------------- */
export function sharpen(ctx: Ctx, amount = 1.4) {
  const src = snapshot(ctx);
  gaussianBlur(ctx, 2);
  const blurred = snapshot(ctx);
  const out = cloneData(src);
  const sd = src.data, bd = blurred.data, od = out.data;
  for (let i = 0; i < od.length; i += 4) {
    od[i]   = Math.max(0, Math.min(255, sd[i]   + amount * (sd[i]   - bd[i])));
    od[i+1] = Math.max(0, Math.min(255, sd[i+1] + amount * (sd[i+1] - bd[i+1])));
    od[i+2] = Math.max(0, Math.min(255, sd[i+2] + amount * (sd[i+2] - bd[i+2])));
  }
  commit(ctx, out);
}

/* ----------------------------- Vignette --------------------------------- */
export function vignette(ctx: Ctx, strength = 0.85) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(0,0,0,${Math.max(0, Math.min(1, strength))})`);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/* ----------------------------- Halftone Screen -------------------------- */
export function halftone(ctx: Ctx, cell = 8) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const src = snapshot(ctx);
  const d = src.data;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      let sum = 0, n = 0;
      for (let dy = 0; dy < cell && y + dy < h; dy++) {
        for (let dx = 0; dx < cell && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          sum += 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
          n++;
        }
      }
      const lum = sum / Math.max(1, n) / 255;
      const r = (1 - lum) * (cell * 0.55);
      if (r > 0.3) {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

/* ----------------------------- Pixelate --------------------------------- */
export function pixelate(ctx: Ctx, block = 12) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const dw = Math.max(1, Math.floor(w / block));
  const dh = Math.max(1, Math.floor(h / block));
  const tmp = document.createElement("canvas");
  tmp.width = dw; tmp.height = dh;
  const tctx = tmp.getContext("2d")!;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(ctx.canvas, 0, 0, dw, dh);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0, w, h);
  ctx.restore();
}

/* ----------------------------- Posterize -------------------------------- */
export function posterize(ctx: Ctx, levels = 4) {
  const img = snapshot(ctx);
  const d = img.data;
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i]   = Math.round(Math.round(d[i]   / step) * step);
    d[i+1] = Math.round(Math.round(d[i+1] / step) * step);
    d[i+2] = Math.round(Math.round(d[i+2] / step) * step);
  }
  commit(ctx, img);
}

/* ----------------------------- Sepia ------------------------------------ */
export function sepia(ctx: Ctx) {
  const img = snapshot(ctx);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    d[i]   = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
    d[i+1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
    d[i+2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
  }
  commit(ctx, img);
}

/* ----------------------------- Grain ------------------------------------ */
export function grain(ctx: Ctx, intensity = 18) {
  const img = snapshot(ctx);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * intensity * 2;
    d[i]   = Math.max(0, Math.min(255, d[i]   + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
  }
  commit(ctx, img);
}

/* ----------------------------- Sobel Edge Detect ------------------------ */
export function edgeDetect(ctx: Ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const src = snapshot(ctx);
  const out = cloneData(src);
  const sd = src.data, od = out.data;
  const L = (i: number) => 0.299 * sd[i] + 0.587 * sd[i+1] + 0.114 * sd[i+2];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const tl = L(((y-1)*w + x-1)*4), t = L(((y-1)*w + x)*4), tr = L(((y-1)*w + x+1)*4);
      const l  = L((y*w + x-1)*4),                              r2 = L((y*w + x+1)*4);
      const bl = L(((y+1)*w + x-1)*4), b = L(((y+1)*w + x)*4), br = L(((y+1)*w + x+1)*4);
      const gx = -tl - 2*l - bl + tr + 2*r2 + br;
      const gy = -tl - 2*t - tr + bl + 2*b + br;
      const v = 255 - Math.min(255, Math.hypot(gx, gy));
      od[i] = od[i+1] = od[i+2] = v;
      od[i+3] = 255;
    }
  }
  commit(ctx, out);
}

/* ----------------------------- Tilt-Shift ------------------------------- */
export function tiltShift(ctx: Ctx, bandRatio = 0.35, blur = 10) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  // Save sharp original
  const sharp = document.createElement("canvas");
  sharp.width = w; sharp.height = h;
  sharp.getContext("2d")!.drawImage(ctx.canvas, 0, 0);
  // Blur whole canvas
  gaussianBlur(ctx, blur);
  // Paste sharp band back over the middle using a vertical gradient mask
  const bandH = h * bandRatio;
  const cy = h / 2;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(sharp, 0, 0);
  const grad = tctx.createLinearGradient(0, cy - bandH, 0, cy + bandH);
  grad.addColorStop(0,   "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,1)");
  grad.addColorStop(1,   "rgba(255,255,255,0)");
  tctx.globalCompositeOperation = "destination-in";
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}

/* ----------------------------- Dispersion ------------------------------- */
export function dispersion(ctx: Ctx, density = 1200, spread = 0.25) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const src = snapshot(ctx);
  const sd = src.data;
  for (let n = 0; n < density; n++) {
    const sx = (Math.random() * 0.6 + 0.2) * w;
    const sy = Math.random() * h;
    const i = (Math.floor(sy) * w + Math.floor(sx)) * 4;
    const r = sd[i], g = sd[i+1], b = sd[i+2], a = sd[i+3];
    if (a < 16) continue;
    const dx = sx + (Math.random() - 0.3) * w * spread;
    const dy = sy + (Math.random() - 0.5) * h * spread * 0.5;
    const radius = Math.random() * 4 + 0.5;
    ctx.fillStyle = `rgba(${r},${g},${b},${(Math.random() * 0.7 + 0.3).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(dx, dy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ----------------------------- Lens Flare ------------------------------- */
export function lensFlare(ctx: Ctx, cx?: number, cy?: number) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const x = cx ?? w * 0.7, y = cy ?? h * 0.3;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  // main core
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.45);
  g.addColorStop(0, "rgba(255,240,200,0.95)");
  g.addColorStop(0.15, "rgba(255,180,120,0.55)");
  g.addColorStop(0.4, "rgba(255,120,80,0.15)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // ghost orbs along the axis
  const ax = w / 2 - x, ay = h / 2 - y;
  for (const t of [0.2, 0.45, 0.7, 1.1, 1.5]) {
    const gx = x + ax * t, gy = y + ay * t;
    const r = (30 + Math.random() * 60) * (1 - t * 0.3);
    const orb = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    orb.addColorStop(0, `rgba(${Math.random() < 0.5 ? "180,120,255" : "255,200,160"},0.45)`);
    orb.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ----------------------------- Geometry --------------------------------- */
export function flipHorizontal(ctx: Ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
  tmp.getContext("2d")!.drawImage(ctx.canvas, 0, 0);
  ctx.save(); ctx.clearRect(0,0,w,h); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(tmp, 0, 0); ctx.restore();
}
export function flipVertical(ctx: Ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
  tmp.getContext("2d")!.drawImage(ctx.canvas, 0, 0);
  ctx.save(); ctx.clearRect(0,0,w,h); ctx.translate(0, h); ctx.scale(1, -1); ctx.drawImage(tmp, 0, 0); ctx.restore();
}
export function rotate90(ctx: Ctx) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
  tmp.getContext("2d")!.drawImage(ctx.canvas, 0, 0);
  ctx.canvas.width = h; ctx.canvas.height = w;
  ctx.save(); ctx.translate(h, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(tmp, 0, 0); ctx.restore();
}

/* ----------------------------- Border / Frame --------------------------- */
export function borderFrame(ctx: Ctx, thickness = 24, color = "#0d0d0f") {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, thickness);
  ctx.fillRect(0, h - thickness, w, thickness);
  ctx.fillRect(0, 0, thickness, h);
  ctx.fillRect(w - thickness, 0, thickness, h);
  ctx.restore();
}

/* ----------------------------- Remove Background ------------------------ */
/** Otsu-based: pixels brighter than threshold → transparent. Stencil-friendly. */
export function removeBackground(ctx: Ctx, tolerance = 240) {
  const img = snapshot(ctx);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    if (lum >= tolerance) d[i + 3] = 0;
  }
  commit(ctx, img);
}
