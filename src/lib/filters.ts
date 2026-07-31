/* Pixel filters operating in-place on ImageData. */

export type FilterId =
  "brightness-contrast" | "hsl" | "invert" | "threshold" | "blur" | "sharpen" | "grayscale";

export interface FilterParams {
  brightness: number; // -100..100
  contrast: number; // -100..100
  hue: number; // -180..180
  saturation: number; // -100..100
  lightness: number; // -100..100
  threshold: number; // 0..255
  blurRadius: number; // 0..40 (px)
  sharpenAmount: number; // 0..200 (%)
}

export const FILTER_DEFAULTS: FilterParams = {
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
  lightness: 0,
  threshold: 128,
  blurRadius: 6,
  sharpenAmount: 50,
};

export const FILTER_LABELS: Record<FilterId, string> = {
  "brightness-contrast": "Brightness / Contrast",
  hsl: "Hue / Saturation",
  invert: "Invert",
  threshold: "Threshold",
  blur: "Gaussian Blur",
  sharpen: "Sharpen",
  grayscale: "Grayscale",
};

export function applyFilter(
  src: HTMLCanvasElement,
  id: FilterId,
  p: FilterParams,
  mask?: Uint8ClampedArray,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const octx = out.getContext("2d")!;

  if (id === "blur") {
    octx.filter = `blur(${p.blurRadius}px)`;
    octx.drawImage(src, 0, 0);
    octx.filter = "none";
  } else {
    octx.drawImage(src, 0, 0);
    const img = octx.getImageData(0, 0, out.width, out.height);
    switch (id) {
      case "brightness-contrast":
        brightnessContrast(img, p.brightness, p.contrast);
        break;
      case "hsl":
        hsl(img, p.hue, p.saturation, p.lightness);
        break;
      case "invert":
        invert(img);
        break;
      case "threshold":
        threshold(img, p.threshold);
        break;
      case "sharpen":
        sharpen(img, p.sharpenAmount / 100);
        break;
      case "grayscale":
        grayscale(img);
        break;
    }
    octx.putImageData(img, 0, 0);
  }

  if (mask) compositeWithMask(src, out, mask);
  return out;
}

function compositeWithMask(
  orig: HTMLCanvasElement,
  filtered: HTMLCanvasElement,
  mask: Uint8ClampedArray,
) {
  const fctx = filtered.getContext("2d")!;
  const w = filtered.width,
    h = filtered.height;
  const oimg = orig.getContext("2d")!.getImageData(0, 0, w, h);
  const fimg = fctx.getImageData(0, 0, w, h);
  for (let i = 0, m = 0; i < fimg.data.length; i += 4, m++) {
    const a = mask[m] / 255;
    const ia = 1 - a;
    fimg.data[i] = fimg.data[i] * a + oimg.data[i] * ia;
    fimg.data[i + 1] = fimg.data[i + 1] * a + oimg.data[i + 1] * ia;
    fimg.data[i + 2] = fimg.data[i + 2] * a + oimg.data[i + 2] * ia;
    fimg.data[i + 3] = fimg.data[i + 3] * a + oimg.data[i + 3] * ia;
  }
  fctx.putImageData(fimg, 0, 0);
}

function brightnessContrast(img: ImageData, b: number, c: number) {
  const bn = b * 2.55;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      let v = d[i + k] + bn;
      v = cf * (v - 128) + 128;
      d[i + k] = clamp(v);
    }
  }
}

function invert(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

function threshold(img: ImageData, t: number) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const v = lum >= t ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
}

function grayscale(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

function hsl(img: ImageData, hShift: number, sBoost: number, lBoost: number) {
  const d = img.data;
  const hs = hShift / 360;
  const ss = sBoost / 100;
  const ls = lBoost / 100;
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
    const nh = (h + hs + 1) % 1;
    const ns = clamp01(s * (1 + ss));
    const nl = clamp01(l + ls);
    const [r, g, b] = hsl2rgb(nh, ns, nl);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

function sharpen(img: ImageData, amt: number) {
  // 3x3 unsharp kernel mixed with amt (0..2)
  const w = img.width,
    h = img.height;
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  const k = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let ky = -1; ky <= 1; ky++)
          for (let kx = -1; kx <= 1; kx++) {
            acc += src[((y + ky) * w + (x + kx)) * 4 + c] * k[(ky + 1) * 3 + (kx + 1)];
          }
        const i = (y * w + x) * 4 + c;
        d[i] = clamp(src[i] * (1 - amt) + acc * amt);
      }
    }
  }
}

function clamp(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = 0;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  if (h < 0) h += 1;
  return [h, s, l];
}
function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}
function hue2rgb(p: number, q: number, t: number) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
