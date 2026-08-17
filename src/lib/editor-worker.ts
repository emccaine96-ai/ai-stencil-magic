/**
 * Web Worker — heavy pixel ops moved off the main thread so brush input stays
 * smooth even on 4096² canvases. Pure functions of (ImageData, params) → ImageData.
 * Falls back to in-thread when Worker is unavailable (see worker-bridge.ts).
 */
/// <reference lib="webworker" />

type Op =
  | { id: number; op: "threshold"; data: ImageData; level: number }
  | { id: number; op: "otsu"; data: ImageData }
  | {
      id: number;
      op: "morph";
      data: ImageData;
      passes: number;
      kind: "erode" | "dilate" | "open" | "close";
    }
  | { id: number; op: "thermal-blue"; data: ImageData }
  | { id: number; op: "thermal-purple"; data: ImageData }
  | { id: number; op: "stipple"; data: ImageData; density: number; size: number }
  | { id: number; op: "smudge"; data: ImageData; cxL: number; cyL: number; r: number; dx: number; dy: number; blend: number }
  | { id: number; op: "liquify"; data: ImageData; cxL: number; cyL: number; r: number; dx: number; dy: number; strength: number; kind: "push" | "inflate" | "deflate" }
  | { id: number; op: "heal"; data: ImageData; cxL: number; cyL: number; r: number; opacity: number };

function luma(d: Uint8ClampedArray, i: number) {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

function otsuLevel(data: ImageData): number {
  const hist = new Uint32Array(256);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) hist[Math.round(luma(d, i))]++;
  const total = data.width * data.height;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0,
    wB = 0,
    maxVar = 0,
    threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) {
      maxVar = v;
      threshold = t;
    }
  }
  return threshold;
}

function threshold(data: ImageData, level: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = luma(d, i) < level ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return out;
}

function morphPass(data: ImageData, dilate: boolean): ImageData {
  const { width: w, height: h } = data;
  const src = data.data;
  const out = new Uint8ClampedArray(src);
  // operate on luminance (binary-ish), keep alpha
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let v = dilate ? 255 : 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          const l = src[i]; // already grayscale post-threshold
          v = dilate ? Math.min(v, l) : Math.max(v, l);
        }
      }
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
    }
  }
  return new ImageData(out, w, h);
}

function morph(
  data: ImageData,
  kind: "erode" | "dilate" | "open" | "close",
  passes: number,
): ImageData {
  let cur = data;
  const seq: ("erode" | "dilate")[] =
    kind === "open" ? ["erode", "dilate"] : kind === "close" ? ["dilate", "erode"] : [kind];
  for (let p = 0; p < passes; p++) for (const op of seq) cur = morphPass(cur, op === "dilate");
  return cur;
}

function thermalBlue(data: ImageData): ImageData {
  const out = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
  const d = out.data;
  const C = { r: 0x2b, g: 0x3a, b: 0x8c };
  const K = { r: 0xfa, g: 0xf6, b: 0xea };
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d, i) / 255;
    const t = Math.pow(l, 1.4);
    d[i] = Math.round(C.r * (1 - t) + K.r * t);
    d[i + 1] = Math.round(C.g * (1 - t) + K.g * t);
    d[i + 2] = Math.round(C.b * (1 - t) + K.b * t);
  }
  return out;
}

function thermalPurple(data: ImageData): ImageData {
  const out = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d, i) / 255;
    d[i] = Math.round(60 + (255 - 60) * Math.pow(l, 1.2));
    d[i + 1] = Math.round(35 + (245 - 35) * Math.pow(l, 1.7));
    d[i + 2] = Math.round(95 + (235 - 95) * Math.pow(l, 1.1));
  }
  return out;
}

/** Stipple a dot-density map from luminance into a binary stipple layer. */
function stipple(data: ImageData, density: number, size: number): ImageData {
  const { width: w, height: h } = data;
  const src = data.data;
  const out = new Uint8ClampedArray(w * h * 4);
  // start transparent
  const cellW = Math.max(2, Math.round(size));
  for (let y = 0; y < h; y += cellW) {
    for (let x = 0; x < w; x += cellW) {
      const i = (y * w + x) * 4;
      const l = luma(src, i) / 255;
      // dark → more dots
      const p = (1 - l) * density;
      if (Math.random() < p) {
        const r = Math.max(1, Math.round(size * 0.5));
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const o = (yy * w + xx) * 4;
            out[o] = 0;
            out[o + 1] = 0;
            out[o + 2] = 0;
            out[o + 3] = 255;
          }
        }
      }
    }
  }
  return new ImageData(out, w, h);
}

function smudgeOp(data: ImageData, cxL: number, cyL: number, r: number, dx: number, dy: number, blend: number): ImageData {
  const sw = data.width, sh = data.height;
  const src = data.data;
  const out = new Uint8ClampedArray(src.length);
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      const ddx = px - cxL, ddy = py - cyL;
      const dist = Math.hypot(ddx, ddy);
      const f = dist < r ? (1 - dist / r) * blend : 0;
      const sxs = Math.round(px - dx * f);
      const sys = Math.round(py - dy * f);
      const idx = (py * sw + px) * 4;
      if (sxs >= 0 && sxs < sw && sys >= 0 && sys < sh) {
        const sIdx = (sys * sw + sxs) * 4;
        out[idx] = src[idx] * (1 - f) + src[sIdx] * f;
        out[idx + 1] = src[idx + 1] * (1 - f) + src[sIdx + 1] * f;
        out[idx + 2] = src[idx + 2] * (1 - f) + src[sIdx + 2] * f;
        out[idx + 3] = src[idx + 3] * (1 - f) + src[sIdx + 3] * f;
      } else {
        out[idx] = src[idx];
        out[idx + 1] = src[idx + 1];
        out[idx + 2] = src[idx + 2];
        out[idx + 3] = src[idx + 3];
      }
    }
  }
  return new ImageData(out, sw, sh);
}

function liquifyOp(
  data: ImageData,
  cxL: number,
  cyL: number,
  r: number,
  dx: number,
  dy: number,
  strength: number,
  kind: "push" | "inflate" | "deflate",
): ImageData {
  const sw = data.width, sh = data.height;
  const src = data.data;
  const out = new Uint8ClampedArray(src.length);
  for (let py = 0; py < sh; py++) {
    for (let px = 0; px < sw; px++) {
      const ddx = px - cxL, ddy = py - cyL;
      const dist = Math.hypot(ddx, ddy);
      const t = dist < r ? 1 - (dist / r) * (dist / r) : 0;
      let ox = px, oy = py;
      if (t > 0) {
        if (kind === "push") {
          ox = px - dx * t * strength;
          oy = py - dy * t * strength;
        } else if (kind === "inflate") {
          const k = 1 + t * strength * 0.6;
          ox = cxL + ddx / k;
          oy = cyL + ddy / k;
        } else {
          const k = 1 - t * strength * 0.6;
          ox = cxL + ddx / Math.max(0.2, k);
          oy = cyL + ddy / Math.max(0.2, k);
        }
      }
      const sxs = Math.max(0, Math.min(sw - 1, Math.round(ox)));
      const sys = Math.max(0, Math.min(sh - 1, Math.round(oy)));
      const idx = (py * sw + px) * 4;
      const sIdx = (sys * sw + sxs) * 4;
      out[idx] = src[sIdx];
      out[idx + 1] = src[sIdx + 1];
      out[idx + 2] = src[sIdx + 2];
      out[idx + 3] = src[sIdx + 3];
    }
  }
  return new ImageData(out, sw, sh);
}

function healOp(data: ImageData, cxL: number, cyL: number, r: number, opacity: number): ImageData {
  const w = data.width, h = data.height;
  const d = new Uint8ClampedArray(data.data);
  let sr = 0, sg = 0, sb = 0, sw = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dd = Math.hypot(px - cxL, py - cyL);
      if (dd > r) continue;
      const wgt = 1 - dd / r;
      const i = (py * w + px) * 4;
      sr += d[i] * wgt;
      sg += d[i + 1] * wgt;
      sb += d[i + 2] * wgt;
      sw += wgt;
    }
  }
  if (sw <= 0) return new ImageData(d, w, h);
  const mr = sr / sw, mg = sg / sw, mb = sb / sw;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dd = Math.hypot(px - cxL, py - cyL);
      if (dd > r) continue;
      const a = (1 - dd / r) * Math.min(1, opacity);
      const i = (py * w + px) * 4;
      d[i] = d[i] * (1 - a) + mr * a;
      d[i + 1] = d[i + 1] * (1 - a) + mg * a;
      d[i + 2] = d[i + 2] * (1 - a) + mb * a;
    }
  }
  return new ImageData(d, w, h);
}

self.onmessage = (e: MessageEvent<Op>) => {
  const msg = e.data;
  try {
    let result: ImageData;
    switch (msg.op) {
      case "threshold":
        result = threshold(msg.data, msg.level);
        break;
      case "otsu":
        result = threshold(msg.data, otsuLevel(msg.data));
        break;
      case "morph":
        result = morph(msg.data, msg.kind, Math.max(1, msg.passes));
        break;
      case "thermal-blue":
        result = thermalBlue(msg.data);
        break;
      case "thermal-purple":
        result = thermalPurple(msg.data);
        break;
      case "stipple":
        result = stipple(msg.data, msg.density, msg.size);
        break;
    }
    (self as unknown as Worker).postMessage({ id: msg.id, ok: true, data: result }, [
      result.data.buffer,
    ]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error: String(err) });
  }
};

export {};
