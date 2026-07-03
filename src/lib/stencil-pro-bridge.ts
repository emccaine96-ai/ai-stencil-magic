/**
 * Bridge for stencil-pro-worker.ts. Independent from worker-bridge.ts so
 * existing editor filters keep running on their own dedicated worker.
 */

export type StencilProOp =
  | "remove-bg" | "smooth" | "sobel" | "canny" | "adaptive-threshold"
  | "ml-segment" | "stencil" | "stencil-otsu" | "stencil-tonal" | "combined";

export type StencilColorKey =
  | "purple" | "deepPurple" | "violet" | "black" | "blue";

export type StencilStyle = "edge" | "tonal";

export interface RunOpParams {
  op: StencilProOp;
  data: ImageData;
  useML?: boolean;
  colorKey?: StencilColorKey;
  customColor?: { r: number; g: number; b: number };
  style?: StencilStyle;
  tolerance?: number;
  iterations?: number;
  blurIterations?: number;
  sigma?: number;
  lowThreshold?: number;
  highThreshold?: number;
  blockSize?: number;
  C?: number;
  smooth?: boolean;
  toneStrength?: number;
  stippleDensity?: number;
  hatchAngle?: number;
  useErrorDiff?: boolean;
}

export interface RunOpResult { ok: boolean; data?: ImageData; error?: string }

let worker: Worker | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (v: RunOpResult) => void; reject: (e: unknown) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./stencil-pro-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve({ ok: true, data: msg.data });
    else p.reject(new Error(msg.error ?? "worker error"));
  };
  worker.onerror = (e) => console.error("[stencil-pro]", e);
  return worker;
}

export function runProOp(params: RunOpParams): Promise<RunOpResult> {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    const copy = new ImageData(
      new Uint8ClampedArray(params.data.data),
      params.data.width,
      params.data.height
    );
    getWorker().postMessage({ id, ...params, data: copy }, [copy.data.buffer]);
  });
}

export function resetProWorker() {
  worker?.terminate();
  worker = null;
  pending.forEach(p => p.reject(new Error("Worker reset")));
  pending.clear();
}