// Image adjustment engine for the Vault editor.
// All functions operate in-place on ImageData for zero-copy performance.

export interface AdjustmentValues {
  brightness?: number; // -100..100
  contrast?: number; // -100..100
  saturation?: number; // -100..100
  hue?: number; // -180..180 (degrees)
  exposure?: number; // -100..100 (stops * 100)
  temperature?: number; // -100..100 (cool..warm)
  tint?: number; // -100..100 (green..magenta)
  vibrance?: number; // -100..100
  gamma?: number; // 0.1..3.0 (default 1)
  invert?: boolean;
  grayscale?: boolean;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

export function applyAdjustments(imageData: ImageData, v: AdjustmentValues): ImageData {
  const data = imageData.data;
  const len = data.length;

  const brightness = (v.brightness ?? 0) * 2.55; // -255..255
  const contrastF = ((v.contrast ?? 0) + 100) / 100; // 0..2, pivot at 128
  const exposureMul = Math.pow(2, (v.exposure ?? 0) / 100); // 0.5..2
  const gamma = v.gamma ?? 1;
  const invGamma = 1 / gamma;
  const tempAmt = (v.temperature ?? 0) * 0.5; // shift red vs blue
  const tintAmt = (v.tint ?? 0) * 0.5; // shift green vs magenta
  const satAmt = (v.saturation ?? 0) / 100; // -1..1
  const vibAmt = (v.vibrance ?? 0) / 100;
  const hueShift = (v.hue ?? 0) / 360;
  const doHsl = satAmt !== 0 || vibAmt !== 0 || hueShift !== 0;
  const grayscale = !!v.grayscale;
  const invert = !!v.invert;

  for (let i = 0; i < len; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    // Exposure (multiplicative)
    if (exposureMul !== 1) { r *= exposureMul; g *= exposureMul; b *= exposureMul; }
    // Brightness (additive)
    if (brightness !== 0) { r += brightness; g += brightness; b += brightness; }
    // Contrast around 128
    if (contrastF !== 1) {
      r = (r - 128) * contrastF + 128;
      g = (g - 128) * contrastF + 128;
      b = (b - 128) * contrastF + 128;
    }
    // Temperature / tint
    if (tempAmt !== 0) { r += tempAmt; b -= tempAmt; }
    if (tintAmt !== 0) { g += tintAmt; }
    // Gamma
    if (gamma !== 1) {
      r = 255 * Math.pow(r / 255, invGamma);
      g = 255 * Math.pow(g / 255, invGamma);
      b = 255 * Math.pow(b / 255, invGamma);
    }

    r = clamp255(r); g = clamp255(g); b = clamp255(b);

    if (doHsl) {
      const [h, s, l] = rgbToHsl(r, g, b);
      let newH = h + hueShift; if (newH > 1) newH -= 1; if (newH < 0) newH += 1;
      let newS = s;
      if (satAmt !== 0) newS = satAmt >= 0 ? s + (1 - s) * satAmt : s * (1 + satAmt);
      if (vibAmt !== 0) {
        const boost = vibAmt * (1 - s);
        newS = Math.min(1, Math.max(0, newS + boost));
      }
      const [nr, ng, nb] = hslToRgb(newH, Math.min(1, Math.max(0, newS)), l);
      r = nr; g = ng; b = nb;
    }

    if (grayscale) {
      const y = r * 0.299 + g * 0.587 + b * 0.114;
      r = g = b = y;
    }
    if (invert) { r = 255 - r; g = 255 - g; b = 255 - b; }

    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
  return imageData;
}

export function applyAdjustmentsToCanvas(canvas: HTMLCanvasElement, v: AdjustmentValues): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyAdjustments(img, v);
  ctx.putImageData(img, 0, 0);
}