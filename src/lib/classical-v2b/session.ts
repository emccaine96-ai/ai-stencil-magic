import type {
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

import type {
  ExportSpecification,
  V2Options,
} from "./pipeline";

type PreparedResponse = Extract<
  WorkerResponse,
  { type: "prepared" }
>;

type RenderedResponse = Extract<
  WorkerResponse,
  { type: "rendered" }
>;

type ExportedResponse = Extract<
  WorkerResponse,
  { type: "exported" }
>;

interface Pending {
  id: number;
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
}

export class V2Session {
  private readonly worker: Worker;
  private nextId = 1;
  private pending?: Pending;
  private disposed = false;

  constructor() {
    this.worker = new Worker(
      new URL("./worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = (
      event: MessageEvent<WorkerResponse>,
    ) => {
      const response = event.data;

      if (
        !this.pending ||
        response.id !== this.pending.id
      ) {
        return;
      }

      const pending = this.pending;
      this.pending = undefined;

      if (response.type === "error") {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response);
      }
    };

    this.worker.onerror = event => {
      const error = new Error(
        event.message || "V2 worker failed",
      );

      this.pending?.reject(error);
      this.pending = undefined;

      this.dispose();
    };
  }

  private send(
    message: WorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<WorkerResponse> {
    if (this.disposed) {
      return Promise.reject(
        new Error("V2 session is disposed"),
      );
    }

    if (this.pending) {
      return Promise.reject(
        new Error(
          "V2 session is busy; coalesce or await requests",
        ),
      );
    }

    return new Promise((resolve, reject) => {
      this.pending = {
        id: message.id,
        resolve,
        reject,
      };

      try {
        this.worker.postMessage(message, transfer);
      } catch (error) {
        this.pending = undefined;

        reject(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
      }
    });
  }

  async prepare(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
  ): Promise<PreparedResponse> {
    const ownedCopy = rgba.slice();

    const response = await this.send(
      {
        id: this.nextId++,
        type: "prepare",
        rgba: ownedCopy,
        width,
        height,
      },
      [ownedCopy.buffer],
    );

    if (response.type !== "prepared") {
      throw new Error("Unexpected prepare response");
    }

    return response;
  }

  async render(
    options: V2Options = {},
  ): Promise<RenderedResponse> {
    const response = await this.send({
      id: this.nextId++,
      type: "render",
      options,
    });

    if (response.type !== "rendered") {
      throw new Error("Unexpected render response");
    }

    return response;
  }

  async export(
    renderId: number,
    specification: ExportSpecification,
  ): Promise<ExportedResponse> {
    const response = await this.send({
      id: this.nextId++,
      type: "export",
      renderId,
      specification,
    });

    if (response.type !== "exported") {
      throw new Error("Unexpected export response");
    }

    return response;
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    this.pending?.reject(
      new Error("V2 session cancelled or disposed"),
    );

    this.pending = undefined;
    this.worker.terminate();
  }
}
