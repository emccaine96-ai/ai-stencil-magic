import type { V2Options } from "./pipeline";

export interface V2Tuning {
  lineSensitivity: number;
  lineCrispness: number;
  shadingStart: number;
  hatchSpacing: number;
  strokeWeight: number;
  speckCleanup: number;
}

export const DEFAULT_TUNING: V2Tuning = {
  lineSensitivity: 0,
  lineCrispness: 0,
  shadingStart: 0,
  hatchSpacing: 0,
  strokeWeight: 0,
  speckCleanup: 0.5,
};

export function tuningToOptions(
  tuning: V2Tuning,
  darkKeyed: boolean,
): V2Options {
  const baseEpsilon = darkKeyed ? 0.02 : 0;
  const spacingFactor = Math.pow(
    1.6,
    -tuning.hatchSpacing,
  );

  return {
    style: "hatching",

    xdog: {
      epsilon:
        baseEpsilon +
        tuning.lineSensitivity * 0.05,

      phi:
        10 *
        Math.pow(2.2, tuning.lineCrispness),
    },

    minimumContourPixels: Math.max(
      2,
      Math.round(
        20 *
        Math.pow(
          3,
          (tuning.speckCleanup - 0.5) * 2,
        ),
      ),
    ),

    hatch: {
      levels: [0.55, 0.36, 0.2].map(
        value => Math.max(
          0.05,
          Math.min(
            0.9,
            value + tuning.shadingStart * 0.12,
          ),
        ),
      ),

      spacing: [
        Math.max(2.5, 6 * spacingFactor),
        Math.max(4, 13 * spacingFactor),
      ],

      width: Math.max(
        0.5,
        Math.min(
          2.2,
          Math.pow(1.8, tuning.strokeWeight),
        ),
      ),
    },
  };
}
