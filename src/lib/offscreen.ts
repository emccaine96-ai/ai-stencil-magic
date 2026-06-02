/**
 * OffscreenCanvas helpers — keeps heavy filter/stroke work off the main thread
 * on supporting browsers. Gracefully degrades to in-thread otherwise.
 */

export function supportsOffscreen(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

export function createOffscreen(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (supportsOffscreen()) return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Run a serializable pure function in a Worker (if available). */
export async function runInWorker<T, R>(fn: (input: T) => R, input: T): Promise<R> {
  if (typeof Worker === "undefined") return fn(input);
  const src = "self.onmessage = (e) => { const fn = (" + fn.toString() + "); try { const out = fn(e.data); postMessage({ ok: true, out }); } catch (err) { postMessage({ ok: false, err: String(err) }); } };";
  const url = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
  return new Promise((resolve, reject) => {
    const w = new Worker(url);
    w.onmessage = (ev) => {
      URL.revokeObjectURL(url); w.terminate();
      ev.data.ok ? resolve(ev.data.out) : reject(new Error(ev.data.err));
    };
    w.onerror = (err) => { URL.revokeObjectURL(url); w.terminate(); reject(err); };
    w.postMessage(input);
  });
}