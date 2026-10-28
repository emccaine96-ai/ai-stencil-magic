import { grayFromRGBA } from "./filters";
import { assertLength, resampleBilinear } from "./fieldops";
import { prepOptionsFor, prepTone } from "./tone";
import { xdogInk, type XDoGParams } from "./xdog";
import { buildOrientation } from "./orientation";
import { removeSmallComponents } from "./cleanup";

import {
  DEFAULT_HATCH,
  renderHatch,
  rasterizeHatchExport,
  type HatchContext,
  type HatchOptions,
  type HatchResult,
} from "./hatch";

export interface V2Options {
  style?: "hatching";
  xdog?: Partial<XDoGParams>;
  hatch?: Partial<HatchOptions>;
  localContrast?: number;
  minimumContourPixels?: number;
}

export interface V2Prepared {
  width: number;
  height: number;
  tone: Float32Array;
  orientation: Float32Array;
  trust: Float32Array;
  darkKeyed: boolean;
}

export interface V2Rendered {
  prepared: V2Prepared;
  context: HatchContext;
  hatch: HatchResult;
  lines: Float32Array;
  ink: Float32Array;
}

export interface ExportSpecification {
  width: number;
  height: number;
  minimumHatchWidthPx: number;
  minimumHatchRunPx: number;
  hatchSupportThreshold: number;

  /**
   * Binary exclusion mask in ANALYSIS coordinates.
   * Any nonzero value excludes that analysis pixel.
   */
  exclusion?: Uint8Array;
}

export function prepareV2(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): V2Prepared {
  const gray = grayFromRGBA(rgba, width, height);
  const prep = prepOptionsFor(gray);
  const tone = prepTone(gray, width, height, prep);
  const field = buildOrientation(tone, width, height);

  return {
    width,
    height,
    tone,
    orientation: field.angle,
    trust: field.trust,
    darkKeyed: prep.protectShadows,
  };
}

export function renderV2(
  prepared: V2Prepared,
  options: V2Options = {},
): V2Rendered {
  const { width, height, tone } = prepared;

  if (options.style && options.style !== "hatching") {
    throw new Error("This V2 candidate supports hatching only");
  }

  const rawLines = xdogInk(
    tone,
    width,
    height,
    {
      epsilon: prepared.darkKeyed ? 0.02 : 0,
      ...options.xdog,
    },
    options.localContrast ?? 0.5,
  );

  const lines = removeSmallComponents(
    rawLines,
    width,
    height,
    options.minimumContourPixels ?? 20,
    0.4,
  );

  const hatchOptions: HatchOptions = {
    ...DEFAULT_HATCH,
    ...options.hatch,
  };

  if (hatchOptions.gate) {
    assertLength(
      hatchOptions.gate,
      width * height,
      "Hatch gate",
    );
  }

  const context: HatchContext = {
    width,
    height,
    tone,
    orientation: prepared.orientation,
    trust: prepared.trust,
    options: hatchOptions,
  };

  const hatch = renderHatch(context);
  const ink = new Float32Array(width * height);

  for (let i = 0; i < ink.length; i++) {
    ink[i] = Math.max(lines[i], hatch.display[i]);
  }

  return {
    prepared,
    context,
    hatch,
    lines,
    ink,
  };
}

export function exportV2(
  rendered: V2Rendered,
  specification: ExportSpecification,
): Uint8ClampedArray {
  const { width, height } = rendered.prepared;

  if (specification.exclusion) {
    assertLength(
      specification.exclusion,
      width * height,
      "Exclusion",
    );
  }

  const hatch = rasterizeHatchExport(
    rendered.context,
    rendered.hatch.strokes,
    {
      width: specification.width,
      height: specification.height,
      minimumWidthPx: specification.minimumHatchWidthPx,
      minimumRunLengthPx: specification.minimumHatchRunPx,
      supportThreshold: specification.hatchSupportThreshold,
    },
  );

  // Contours remain raster-based in this candidate.
  const contours = resampleBilinear(
    rendered.lines,
    width,
    height,
    specification.width,
    specification.height,
  );

  const output = new Uint8ClampedArray(hatch.length);

  for (let y = 0; y < specification.height; y++) {
    for (let x = 0; x < specification.width; x++) {
      const index = y * specification.width + x;

      const ax = Math.min(
        width - 1,
        Math.floor((x + 0.5) * width / specification.width),
      );

      const ay = Math.min(
        height - 1,
        Math.floor((y + 0.5) * height / specification.height),
      );

      const excluded =
        specification.exclusion?.[ay * width + ax] !== undefined &&
        specification.exclusion![ay * width + ax] !== 0;

      output[index] = excluded
        ? 0
        : contours[index] >= 0.5 || hatch[index] === 255
          ? 255
          : 0;
    }
  }

  return output;
}
