// scripts/v3/sweep-lib.ts
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// src/lib/classical-v3/hectograph-engine.ts
function gaussianBlurFloat(src, width, height, sigma) {
  if (sigma <= 0.05) return new Float32Array(src);
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  const s2 = 2 * sigma * sigma;
  for (let i = -radius; i <= radius; i++) {
    const val = Math.exp(-(i * i) / s2);
    kernel[i + radius] = val;
    sum += val;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const temp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const nx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[rowOffset + nx] * kernel[k + radius];
      }
      temp[rowOffset + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const ny = Math.min(height - 1, Math.max(0, y + k));
        acc += temp[ny * width + x] * kernel[k + radius];
      }
      dst[rowOffset + x] = acc;
    }
  }
  return dst;
}
function resizeLumBilinear(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = sx - x0;
      const a = src[y0 * sw + x0] * (1 - wx) + src[y0 * sw + x1] * wx;
      const b = src[y1 * sw + x0] * (1 - wx) + src[y1 * sw + x1] * wx;
      out[y * dw + x] = a * (1 - wy) + b * wy;
    }
  }
  return out;
}
function measureEdgeDensity(rawLum, width, height) {
  const smooth = gaussianBlurFloat(rawLum, width, height, 1.2);
  let gradSum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 2) {
    const r = y * width;
    for (let x = 1; x < width - 1; x += 2) {
      const dx = smooth[r + x + 1] - smooth[r + x - 1];
      const dy = smooth[r + width + x] - smooth[r - width + x];
      gradSum += Math.hypot(dx, dy);
      count++;
    }
  }
  return count > 0 ? gradSum / count : 0.08;
}

// src/lib/classical-v3/prepare-input.ts
var V3_MAX_EDGE = 1024;
function fitWithin(srcW, srcH, maxEdge) {
  const longest = Math.max(srcW, srcH);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale))
  };
}

// scripts/v3/sweep-lib.ts
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class {
    data;
    width;
    height;
    constructor(a, b, c) {
      if (typeof a === "number") {
        this.width = a;
        this.height = b;
        this.data = new Uint8ClampedArray(a * b * 4);
      } else {
        this.data = a;
        this.width = b;
        this.height = c;
      }
    }
  };
}
var PAIRS = ["hibiscus", "elder", "baby", "poseidon", "aztec", "portrait", "detail", "floral-back", "shoulder"];
var EXAMPLES = join(process.cwd(), "public/examples");
var find = (id, kind) => {
  for (const ext of ["webp", "jpg", "png"]) {
    try {
      readFileSync(join(EXAMPLES, `${id}-${kind}.${ext}`));
      return join(EXAMPLES, `${id}-${kind}.${ext}`);
    } catch {
    }
  }
  throw new Error(`missing ${id}-${kind}`);
};
async function load(path, maxEdge) {
  const m = await sharp(path).rotate().metadata();
  const sz = maxEdge ? fitWithin(m.width, m.height, maxEdge) : { width: m.width, height: m.height };
  const raw = await sharp(path).rotate().flatten({ background: "#ffffff" }).resize(sz.width, sz.height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  return { data: new Uint8ClampedArray(raw), width: sz.width, height: sz.height };
}
async function loadPairs() {
  const out = [];
  for (const id of PAIRS) out.push({ id, photo: await load(find(id, "before"), V3_MAX_EDGE), ref: await load(find(id, "after")) });
  return out;
}

// scripts/v3/density-probe.ts
var pairs = await loadPairs();
var lumOf = (img) => {
  const N = img.width * img.height, l = new Float32Array(N);
  for (let i = 0; i < N; i++) l[i] = (0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]) / 255;
  return l;
};
console.log("| Photo | size | OLD density (full) | NEW density (512) | ratio new/old | old class | ");
console.log("|---|---|---|---|---|---|");
var rows = [];
for (const p of pairs) {
  const lum = lumOf(p.photo);
  const oldD = measureEdgeDensity(lum, p.photo.width, p.photo.height);
  const long = Math.max(p.photo.width, p.photo.height);
  const s = 512 / long;
  const nw = Math.max(2, Math.round(p.photo.width * s)), nh = Math.max(2, Math.round(p.photo.height * s));
  const small = resizeLumBilinear(lum, p.photo.width, p.photo.height, nw, nh);
  const newD = measureEdgeDensity(small, nw, nh);
  const cls = oldD > 0.125 ? "dense" : oldD < 0.072 ? "soft" : "mid";
  rows.push({ id: p.id, oldD, newD });
  console.log(`| ${p.id} | ${p.photo.width}x${p.photo.height} | ${oldD.toFixed(4)} | ${newD.toFixed(4)} | ${(newD / oldD).toFixed(2)} | ${cls} |`);
}
var sorted = [...rows].sort((a, b) => a.newD - b.newD);
console.log("\nsorted by NEW density:", sorted.map((r) => `${r.id} ${r.newD.toFixed(4)}`).join(" < "));
