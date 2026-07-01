// Lightweight client-side background remover — samples the 4 corners for a
// dominant background color and knocks out similar pixels with a feathered
// alpha falloff. Zero dependencies, runs instantly on any image. Not a
// semantic segmenter — swap for @imgly/background-removal later if needed.

export interface BgRemovalOptions {
  tolerance?: number; // 0-255 color distance, default 32
  feather?: number;   // 0-64 soft edge width, default 16
}

function sampleCornerColor(data: Uint8ClampedArray, w: number, h: number) {
  const pts = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)],
  ];
  let r = 0, g = 0, b = 0;
  for (const [x, y] of pts) {
    const i = (y * w + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2];
  }
  return [r / pts.length, g / pts.length, b / pts.length];
}

export async function removeBackground(
  image: HTMLImageElement | HTMLCanvasElement,
  opts: BgRemovalOptions = {},
): Promise<HTMLCanvasElement> {
  const tolerance = opts.tolerance ?? 32;
  const feather = opts.feather ?? 16;
  const w = "naturalWidth" in image ? image.naturalWidth : image.width;
  const h = "naturalHeight" in image ? image.naturalHeight : image.height;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [br, bg, bb] = sampleCornerColor(d, w, h);
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < tolerance) {
      d[i + 3] = 0;
    } else if (dist < tolerance + feather) {
      const t = (dist - tolerance) / feather;
      d[i + 3] = Math.round(d[i + 3] * t);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}