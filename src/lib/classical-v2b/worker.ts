import {
  exportV2,
  prepareV2,
  renderV2,
  type V2Prepared,
  type V2Rendered,
} from "./pipeline";

import type {
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

interface WorkerPort {
  onmessage:
    | ((event: MessageEvent<WorkerRequest>) => void)
    | null;

  postMessage(
    message: WorkerResponse,
    transfer?: Transferable[],
  ): void;
}

const port = self as unknown as WorkerPort;

let prepared: V2Prepared | undefined;
let rendered: V2Rendered | undefined;
let renderedRequestId: number | undefined;

port.onmessage = (
  event: MessageEvent<WorkerRequest>,
): void => {
  const request = event.data;

  try {
    const started = performance.now();

    if (request.type === "prepare") {
      prepared = prepareV2(
        request.rgba,
        request.width,
        request.height,
      );

      rendered = undefined;
      renderedRequestId = undefined;

      port.postMessage({
        id: request.id,
        type: "prepared",
        darkKeyed: prepared.darkKeyed,
        preparationTime: performance.now() - started,
      });

      return;
    }

    if (request.type === "render") {
      if (!prepared) {
        throw new Error("Prepare an image before rendering");
      }

      rendered = renderV2(prepared, request.options);
      renderedRequestId = request.id;

      // Transfer copies, retaining worker-owned render data.
      const ink = rendered.ink.slice();
      const lines = rendered.lines.slice();

      port.postMessage(
        {
          id: request.id,
          type: "rendered",
          ink,
          lines,
          strokeCount: rendered.hatch.strokes.length,
          renderTime: performance.now() - started,
        },
        [ink.buffer, lines.buffer],
      );

      return;
    }

    if (
      !rendered ||
      request.renderId !== renderedRequestId
    ) {
      throw new Error(
        "Export requested for a missing or superseded render",
      );
    }

    const mask = exportV2(
      rendered,
      request.specification,
    );

    port.postMessage(
      {
        id: request.id,
        type: "exported",
        mask,
        exportTime: performance.now() - started,
      },
      [mask.buffer],
    );
  } catch (error) {
    port.postMessage({
      id: request.id,
      type: "error",
      message: error instanceof Error
        ? error.message
        : String(error),
    });
  }
};
