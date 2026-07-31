/// <reference lib="webworker" />
// Lanczos-3 (a=3) high-fidelity resampler. Runs entirely in a Web Worker so
// the UI thread never freezes. Reports linear progress 0..1 then a final
// ImageData payload as a transferable.

type Req = {
  type: "resize";
  src: ImageData;
  dstW: number;
  dstH: number;
};

const A = 3; // Lanczos lobes

function sinc(x: number) {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}
function lanczos(x: number) {
  if (x <= -A || x >= A) return 0;
  return sinc(x) * sinc(x / A);
}

// Precomputes per-output-pixel sample indices + normalized weights along one axis.
function buildWeights(srcLen: number, dstLen: number) {
  const scale = dstLen / srcLen;
  const support = scale < 1 ? A / scale : A;
  const filterScale = scale < 1 ? scale : 1;
  const weights: { start: number; w: Float32Array }[] = new Array(dstLen);
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) / scale - 0.5;
    const start = Math.max(0, Math.floor(center - support) + 1);
    const end = Math.min(srcLen - 1, Math.floor(center + support));
    const w = new Float32Array(end - start + 1);
    let sum = 0;
    for (let j = start; j <= end; j++) {
      const v = lanczos((j - center) * filterScale);
      w[j - start] = v;
      sum += v;
    }
    if (sum !== 0) for (let k = 0; k < w.length; k++) w[k] /= sum;
    weights[i] = { start, w };
  }
  return weights;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const msg = e.data;
  if (msg.type !== "resize") return;
  const { src, dstW, dstH } = msg;
  const srcW = src.width,
    srcH = src.height;
  const sp = src.data;

  const wx = buildWeights(srcW, dstW);
  const wy = buildWeights(srcH, dstH);

  // Horizontal pass -> intermediate float buffer (RGBA, dstW x srcH).
  const interm = new Float32Array(dstW * srcH * 4);
  for (let y = 0; y < srcH; y++) {
    const rowS = y * srcW * 4;
    const rowD = y * dstW * 4;
    for (let x = 0; x < dstW; x++) {
      const { start, w } = wx[x];
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let k = 0; k < w.length; k++) {
        const off = rowS + (start + k) * 4;
        const wt = w[k];
        r += sp[off] * wt;
        g += sp[off + 1] * wt;
        b += sp[off + 2] * wt;
        a += sp[off + 3] * wt;
      }
      const o = rowD + x * 4;
      interm[o] = r;
      interm[o + 1] = g;
      interm[o + 2] = b;
      interm[o + 3] = a;
    }
    if ((y & 31) === 0) (self as any).postMessage({ type: "progress", p: (y / srcH) * 0.5 });
  }

  // Vertical pass -> final ImageData.
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const { start, w } = wy[y];
    const rowD = y * dstW * 4;
    for (let x = 0; x < dstW; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let k = 0; k < w.length; k++) {
        const off = ((start + k) * dstW + x) * 4;
        const wt = w[k];
        r += interm[off] * wt;
        g += interm[off + 1] * wt;
        b += interm[off + 2] * wt;
        a += interm[off + 3] * wt;
      }
      const o = rowD + x * 4;
      out[o] = r < 0 ? 0 : r > 255 ? 255 : r;
      out[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      out[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      out[o + 3] = a < 0 ? 0 : a > 255 ? 255 : a;
    }
    if ((y & 31) === 0) (self as any).postMessage({ type: "progress", p: 0.5 + (y / dstH) * 0.5 });
  }

  const result = new ImageData(out, dstW, dstH);
  (self as any).postMessage({ type: "done", image: result }, [out.buffer]);
};

export {};
