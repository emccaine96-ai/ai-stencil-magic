/**
 * Promise wrapper around editor-worker.ts. Lazily spins up one worker per
 * tab; falls back to in-thread execution if Worker is missing (SSR, ancient
 * mobile browsers).
 */

type Op =
  | { op: "threshold"; data: ImageData; level: number }
  | { op: "otsu"; data: ImageData }
  | { op: "morph"; data: ImageData; passes: number; kind: "erode" | "dilate" | "open" | "close" }
  | { op: "thermal-blue"; data: ImageData }
  | { op: "thermal-purple"; data: ImageData }
  | { op: "stipple"; data: ImageData; density: number; size: number };

let _worker: Worker | null = null;
let _seq = 0;
const _pending = new Map<number, (v: ImageData) => void>();
const _failed = new Map<number, (e: Error) => void>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (_worker) return _worker;
  try {
    _worker = new Worker(new URL("./editor-worker.ts", import.meta.url), { type: "module" });
    _worker.onmessage = (
      e: MessageEvent<{ id: number; ok: boolean; data?: ImageData; error?: string }>,
    ) => {
      const { id, ok, data, error } = e.data;
      const okCb = _pending.get(id);
      const failCb = _failed.get(id);
      _pending.delete(id);
      _failed.delete(id);
      if (ok && data && okCb) okCb(data);
      else if (failCb) failCb(new Error(error || "worker error"));
    };
    _worker.onerror = () => {
      _worker = null;
    };
  } catch (err) {
    console.warn("[worker-bridge] failed to spawn worker, using main thread", err);
    _worker = null;
  }
  return _worker;
}

export function runOp(op: Op): Promise<ImageData> {
  const w = getWorker();
  if (!w) return Promise.resolve(fallback(op));
  return new Promise((resolve, reject) => {
    const id = ++_seq;
    _pending.set(id, resolve);
    _failed.set(id, reject);
    try {
      w.postMessage({ id, ...op }, [op.data.data.buffer]);
    } catch {
      _pending.delete(id);
      _failed.delete(id);
      resolve(fallback(op));
    }
  });
}

/* --- main-thread fallback (smaller, no morph) ----------------------------- */
function fallback(op: Op): ImageData {
  const w = op.data.width,
    h = op.data.height;
  const out = new ImageData(new Uint8ClampedArray(op.data.data), w, h);
  const d = out.data;
  const Y = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  if (op.op === "threshold" || op.op === "otsu") {
    const level = op.op === "threshold" ? op.level : 128;
    for (let i = 0; i < d.length; i += 4) {
      const v = Y(i) < level ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else if (op.op === "thermal-blue") {
    const C = { r: 0x2b, g: 0x3a, b: 0x8c },
      K = { r: 0xfa, g: 0xf6, b: 0xea };
    for (let i = 0; i < d.length; i += 4) {
      const t = Math.pow(Y(i) / 255, 1.4);
      d[i] = Math.round(C.r * (1 - t) + K.r * t);
      d[i + 1] = Math.round(C.g * (1 - t) + K.g * t);
      d[i + 2] = Math.round(C.b * (1 - t) + K.b * t);
    }
  } else if (op.op === "thermal-purple") {
    for (let i = 0; i < d.length; i += 4) {
      const l = Y(i) / 255;
      d[i] = Math.round(60 + (255 - 60) * Math.pow(l, 1.2));
      d[i + 1] = Math.round(35 + (245 - 35) * Math.pow(l, 1.7));
      d[i + 2] = Math.round(95 + (235 - 95) * Math.pow(l, 1.1));
    }
  }
  // morph + stipple fallback: skip — return input. Worker is widely supported.
  return out;
}
