// Curated tattoo-ink reference library (hex pulled from each brand's published
// swatch sheets). Not exhaustive — covers the core pigments most studios stock
// across the four major brand lines an artist will actually match against.
export type Ink = { brand: string; name: string; hex: string };

export const INK_LIBRARY: Ink[] = [
  // Solid Ink
  { brand: "Solid Ink", name: "Black", hex: "#0b0b0c" },
  { brand: "Solid Ink", name: "Diluted Black", hex: "#2a2a2c" },
  { brand: "Solid Ink", name: "White", hex: "#f6f5ef" },
  { brand: "Solid Ink", name: "Red", hex: "#c81f1f" },
  { brand: "Solid Ink", name: "Burgundy", hex: "#5c1320" },
  { brand: "Solid Ink", name: "Orange", hex: "#e8651f" },
  { brand: "Solid Ink", name: "Yellow", hex: "#f1c40b" },
  { brand: "Solid Ink", name: "Olive", hex: "#5e6a2b" },
  { brand: "Solid Ink", name: "Mint Green", hex: "#6ec39a" },
  { brand: "Solid Ink", name: "Forest Green", hex: "#1d5236" },
  { brand: "Solid Ink", name: "True Blue", hex: "#1f4ca8" },
  { brand: "Solid Ink", name: "Navy", hex: "#15224a" },
  { brand: "Solid Ink", name: "Medium Violet", hex: "#6b3aa3" },
  { brand: "Solid Ink", name: "Magenta", hex: "#c4248c" },
  { brand: "Solid Ink", name: "Brown", hex: "#5b3722" },
  { brand: "Solid Ink", name: "Skin Light", hex: "#eccfb3" },
  { brand: "Solid Ink", name: "Skin Dark", hex: "#a8704a" },

  // Eternal Ink
  { brand: "Eternal", name: "Lining Black", hex: "#0a0a0a" },
  { brand: "Eternal", name: "Triple Black", hex: "#050505" },
  { brand: "Eternal", name: "Snow White", hex: "#f8f7f3" },
  { brand: "Eternal", name: "Lipstick Red", hex: "#c41e3a" },
  { brand: "Eternal", name: "Crimson", hex: "#7a1326" },
  { brand: "Eternal", name: "Sunset Orange", hex: "#ee6b1f" },
  { brand: "Eternal", name: "Bright Yellow", hex: "#fbcd1c" },
  { brand: "Eternal", name: "Lime Green", hex: "#7cb342" },
  { brand: "Eternal", name: "Deep Green", hex: "#194d2d" },
  { brand: "Eternal", name: "Blue Concentrate", hex: "#1c4fb5" },
  { brand: "Eternal", name: "Sky Blue", hex: "#5db5e3" },
  { brand: "Eternal", name: "Purple Concentrate", hex: "#5b2a8a" },
  { brand: "Eternal", name: "Hot Pink", hex: "#e84a9d" },
  { brand: "Eternal", name: "Light Brown", hex: "#8c5a36" },
  { brand: "Eternal", name: "Coffee Brown", hex: "#4a2a18" },

  // Fusion Ink
  { brand: "Fusion", name: "Tribal Black", hex: "#070708" },
  { brand: "Fusion", name: "Bright White", hex: "#f9f8f3" },
  { brand: "Fusion", name: "Brick Red", hex: "#9b2a1e" },
  { brand: "Fusion", name: "Bright Red", hex: "#d5252b" },
  { brand: "Fusion", name: "Tangerine", hex: "#ef7522" },
  { brand: "Fusion", name: "Solar Yellow", hex: "#f7c61a" },
  { brand: "Fusion", name: "Apple Green", hex: "#4ba84a" },
  { brand: "Fusion", name: "Pine Green", hex: "#1b4733" },
  { brand: "Fusion", name: "Cobalt Blue", hex: "#1747a3" },
  { brand: "Fusion", name: "Cyan Sky", hex: "#3fb6d4" },
  { brand: "Fusion", name: "Royal Purple", hex: "#553089" },
  { brand: "Fusion", name: "Magenta", hex: "#bf2780" },
  { brand: "Fusion", name: "Mocha", hex: "#6a4327" },
  { brand: "Fusion", name: "Sand", hex: "#d8b486" },

  // Intenze
  { brand: "Intenze", name: "Zuper Black", hex: "#020202" },
  { brand: "Intenze", name: "White", hex: "#fafaf3" },
  { brand: "Intenze", name: "Bright Red", hex: "#d31f2a" },
  { brand: "Intenze", name: "Dark Red", hex: "#6b1119" },
  { brand: "Intenze", name: "Sunny Orange", hex: "#ef7321" },
  { brand: "Intenze", name: "Lemon Yellow", hex: "#f6d226" },
  { brand: "Intenze", name: "Light Green", hex: "#7bbf6a" },
  { brand: "Intenze", name: "Dark Green", hex: "#1d4d28" },
  { brand: "Intenze", name: "True Blue", hex: "#214fa5" },
  { brand: "Intenze", name: "Light Blue", hex: "#5fa9d8" },
  { brand: "Intenze", name: "Purple", hex: "#603095" },
  { brand: "Intenze", name: "Lavender", hex: "#a78fc4" },
  { brand: "Intenze", name: "Pink", hex: "#e96098" },
  { brand: "Intenze", name: "Coffee", hex: "#4d2f1b" },
  { brand: "Intenze", name: "Beige Skin", hex: "#e8c6a5" },
];

// ---------- color math ----------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number) {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function srgbToLinear(c: number) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r),
    gl = srgbToLinear(g),
    bl = srgbToLinear(b);
  // sRGB -> XYZ (D65)
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175) / 1.0;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x),
    fy = f(y),
    fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// CIEDE2000
export function deltaE2000(lab1: [number, number, number], lab2: [number, number, number]) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1),
    C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1,
    a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1),
    C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180) / Math.PI;
  const h2p = (Math.atan2(b2, a2p) * 180) / Math.PI;
  const h1 = h1p < 0 ? h1p + 360 : h1p;
  const h2 = h2p < 0 ? h2p + 360 : h2p;
  const dLp = L2 - L1,
    dCp = C2p - C1p;
  let dhp = h2 - h1;
  if (Math.abs(dhp) > 180) dhp -= Math.sign(dhp) * 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(((dhp / 2) * Math.PI) / 180);
  const avghp = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2;
  const T =
    1 -
    0.17 * Math.cos(((avghp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avghp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avghp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avghp - 63) * Math.PI) / 180);
  const Sl = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const dTheta = 30 * Math.exp(-Math.pow((avghp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const Rt = -Rc * Math.sin((2 * dTheta * Math.PI) / 180);
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
      Math.pow(dCp / Sc, 2) +
      Math.pow(dHp / Sh, 2) +
      Rt * (dCp / Sc) * (dHp / Sh),
  );
}

// K-means++ color quantization on a sampled pixel array.
export function kmeansColors(
  imageData: ImageData,
  k: number,
  maxIter = 14,
): { hex: string; count: number; r: number; g: number; b: number }[] {
  const data = imageData.data;
  const sampleStride = Math.max(
    1,
    Math.floor(Math.sqrt((imageData.width * imageData.height) / 12000)),
  );
  const samples: [number, number, number][] = [];
  for (let y = 0; y < imageData.height; y += sampleStride) {
    for (let x = 0; x < imageData.width; x += sampleStride) {
      const i = (y * imageData.width + x) * 4;
      if (data[i + 3] < 32) continue;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (samples.length === 0) return [];
  // k-means++ init
  const centroids: [number, number, number][] = [
    samples[Math.floor(Math.random() * samples.length)],
  ];
  while (centroids.length < k) {
    const dists = samples.map((s) => {
      let best = Infinity;
      for (const c of centroids) {
        const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        if (d < best) best = d;
      }
      return best;
    });
    const sum = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let idx = 0;
    for (; idx < dists.length; idx++) {
      r -= dists[idx];
      if (r <= 0) break;
    }
    centroids.push(samples[Math.min(idx, samples.length - 1)]);
  }
  const assign = new Int32Array(samples.length);
  for (let it = 0; it < maxIter; it++) {
    let moved = false;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      let best = 0,
        bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d =
          (s[0] - centroids[c][0]) ** 2 +
          (s[1] - centroids[c][1]) ** 2 +
          (s[2] - centroids[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const c = assign[i],
        s = samples[i];
      sums[c][0] += s[0];
      sums[c][1] += s[1];
      sums[c][2] += s[2];
      sums[c][3]++;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c][3])
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    }
    if (!moved) break;
  }
  const counts = new Array(centroids.length).fill(0);
  for (let i = 0; i < assign.length; i++) counts[assign[i]]++;
  return centroids
    .map((c, i) => ({
      r: c[0],
      g: c[1],
      b: c[2],
      hex: rgbToHex(c[0], c[1], c[2]),
      count: counts[i],
    }))
    .sort((a, b) => b.count - a.count);
}

export function nearestInk(r: number, g: number, b: number): { ink: Ink; deltaE: number } {
  const lab = rgbToLab(r, g, b);
  let best: Ink = INK_LIBRARY[0];
  let bestD = Infinity;
  for (const ink of INK_LIBRARY) {
    const [ir, ig, ib] = hexToRgb(ink.hex);
    const d = deltaE2000(lab, rgbToLab(ir, ig, ib));
    if (d < bestD) {
      bestD = d;
      best = ink;
    }
  }
  return { ink: best, deltaE: bestD };
}

// Mix recipe: express a target color as a weighted combo of pigment primaries
// using non-negative least squares on the RGB channels. Returns percentages
// (rounded, summing to 100) for each contributing pigment.
export const MIX_PRIMARIES: { name: string; hex: string }[] = [
  { name: "True Blue", hex: "#1f4ca8" },
  { name: "Lipstick Red", hex: "#c41e3a" },
  { name: "Bright Yellow", hex: "#f6d226" },
  { name: "Mint Green", hex: "#6ec39a" },
  { name: "Magenta", hex: "#c4248c" },
  { name: "Sunset Orange", hex: "#ee6b1f" },
  { name: "Royal Purple", hex: "#553089" },
  { name: "Tribal Black", hex: "#070708" },
  { name: "Distilled White", hex: "#f8f7f3" },
];

export function mixRecipe(targetHex: string): { name: string; hex: string; pct: number }[] {
  const [tr, tg, tb] = hexToRgb(targetHex);
  // Simple coordinate-descent NNLS on 9 pigments, minimizing weighted Lab distance.
  const N = MIX_PRIMARIES.length;
  const pigRgb = MIX_PRIMARIES.map((p) => hexToRgb(p.hex));
  let w = new Array(N).fill(1 / N);
  const blend = () => {
    let r = 0,
      g = 0,
      b = 0,
      s = 0;
    for (let i = 0; i < N; i++) {
      r += pigRgb[i][0] * w[i];
      g += pigRgb[i][1] * w[i];
      b += pigRgb[i][2] * w[i];
      s += w[i];
    }
    return s > 0 ? [r / s, g / s, b / s] : [255, 255, 255];
  };
  const cost = () => {
    const [r, g, b] = blend();
    return deltaE2000(rgbToLab(r, g, b), rgbToLab(tr, tg, tb));
  };
  const step = 0.04;
  for (let it = 0; it < 220; it++) {
    let improved = false;
    for (let i = 0; i < N; i++) {
      const base = cost();
      w[i] += step;
      const up = cost();
      w[i] -= 2 * step;
      if (w[i] < 0) w[i] = 0;
      const down = cost();
      if (down <= up && down < base) {
        /* keep */ improved = true;
      } else if (up < base) {
        w[i] += 2 * step;
        improved = true;
      } else {
        w[i] += step;
      }
    }
    if (!improved) break;
  }
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const pct = w.map((v) => (v / sum) * 100);
  // Keep only contributions >= 4%, then re-normalize and round.
  const filtered = pct
    .map((p, i) => ({ name: MIX_PRIMARIES[i].name, hex: MIX_PRIMARIES[i].hex, pct: p }))
    .filter((x) => x.pct >= 4)
    .sort((a, b) => b.pct - a.pct);
  const fSum = filtered.reduce((a, b) => a + b.pct, 0) || 1;
  const rounded = filtered.map((x) => ({ ...x, pct: Math.round((x.pct / fSum) * 100) }));
  // Fix rounding drift.
  const drift = 100 - rounded.reduce((a, b) => a + b.pct, 0);
  if (rounded.length) rounded[0].pct += drift;
  return rounded;
}

// HSL <-> RGB
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}
