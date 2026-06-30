/**
 * Promise wrapper around lanczos.worker.ts for high-fidelity image upscaling.
 * Falls back to canvas drawImage smoothing if Worker unavailable.
 */
export type UpscaleProgress = (p: number) => void;

export function lanczosResize(
  src: ImageData,
  dstW: number,
  dstH: number,
  onProgress?: UpscaleProgress,
): Promise<ImageData> {
  if (typeof Worker === "undefined") return Promise.resolve(fallbackResize(src, dstW, dstH));
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL("./lanczos.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      resolve(fallbackResize(src, dstW, dstH));
      return;
    }
    w.onmessage = (e: MessageEvent<{ type: string; p?: number; image?: ImageData }>) => {
      const m = e.data;
      if (m.type === "progress" && onProgress) onProgress(m.p ?? 0);
      else if (m.type === "done" && m.image) { w.terminate(); resolve(m.image); }
    };
    w.onerror = (err) => { w.terminate(); reject(err); };
    w.postMessage({ type: "resize", src, dstW, dstH }, [src.data.buffer]);
  });
}

function fallbackResize(src: ImageData, dstW: number, dstH: number): ImageData {
  const sc = document.createElement("canvas");
  sc.width = src.width; sc.height = src.height;
  sc.getContext("2d")!.putImageData(src, 0, 0);
  const dc = document.createElement("canvas");
  dc.width = dstW; dc.height = dstH;
  const dctx = dc.getContext("2d")!;
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = "high";
  dctx.drawImage(sc, 0, 0, dstW, dstH);
  return dctx.getImageData(0, 0, dstW, dstH);
}
