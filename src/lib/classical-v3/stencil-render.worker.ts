// src/lib/classical-v3/stencil-render.worker.ts
/**
 * Web Worker that runs the Hectograph V3 pipeline off the main thread, so the UI never freezes while a
 * stencil renders (the handoff flags main-thread generation as a low-end-Android problem).
 *
 * Classical only. The optional neural line-art step is deliberately NOT included: it needs an approved
 * onnxruntime-web dependency, a self-hosted model and WASM with a pinned SHA-256, and recorded licenses
 * before it may ship. The engine still accepts a `neuralEdgeMap`, so it can be re-attached later without
 * changing the engine.
 *
 */
import {
  HECTOGRAPH_V3_DEFAULT_CONFIG,
  renderHectographV3,
  type HectographV3Config,
} from './engine-api';

export interface WorkerRenderRequest {
  type: 'RENDER_STENCIL_V3';
  jobId: number;
  imageBuffer: ArrayBuffer;
  width: number;
  height: number;
  config: Partial<HectographV3Config>;
}

export type WorkerResponse =
  | {
      type: 'RENDER_COMPLETE';
      jobId: number;
      resultBuffer: ArrayBuffer;
      width: number;
      height: number;
      durationMs: number;
    }
  | { type: 'RENDER_ERROR'; jobId: number; message: string };

self.onmessage = (event: MessageEvent<WorkerRenderRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'RENDER_STENCIL_V3') return;

  const t0 = performance.now();
  try {
    const rgba = new Uint8ClampedArray(msg.imageBuffer);
    const input = new ImageData(rgba, msg.width, msg.height);

    const mergedConfig: Partial<HectographV3Config> = {
      ...HECTOGRAPH_V3_DEFAULT_CONFIG,
      ...msg.config,
    };
    const output = renderHectographV3(input, mergedConfig);

    const resultBuffer = output.data.buffer as ArrayBuffer;
    const response: WorkerResponse = {
      type: 'RENDER_COMPLETE',
      jobId: msg.jobId,
      resultBuffer,
      width: msg.width,
      height: msg.height,
      durationMs: Math.round(performance.now() - t0),
    };
    // transfer the buffer back zero-copy
    (self as unknown as Worker).postMessage(response, [resultBuffer]);
  } catch (err) {
    const errorMsg: WorkerResponse = {
      type: 'RENDER_ERROR',
      jobId: msg.jobId,
      message: (err as Error)?.message || 'Client-side stencil render failed',
    };
    self.postMessage(errorMsg);
  }
};
