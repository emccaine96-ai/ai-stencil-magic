import type {
  ExportSpecification,
  V2Options,
} from "./pipeline";

export type WorkerRequest =
  | {
      id: number;
      type: "prepare";
      rgba: Uint8ClampedArray;
      width: number;
      height: number;
    }
  | {
      id: number;
      type: "render";
      options: V2Options;
    }
  | {
      id: number;
      type: "export";
      renderId: number;
      specification: ExportSpecification;
    };

export type WorkerResponse =
  | {
      id: number;
      type: "prepared";
      darkKeyed: boolean;
      preparationTime: number;
    }
  | {
      id: number;
      type: "rendered";
      ink: Float32Array;
      lines: Float32Array;
      strokeCount: number;
      renderTime: number;
    }
  | {
      id: number;
      type: "exported";
      mask: Uint8ClampedArray;
      exportTime: number;
    }
  | {
      id: number;
      type: "error";
      message: string;
    };
