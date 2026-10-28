import { bilateral, gaussian } from "./filters";
import { clamp, percentile } from "./fieldops";

export interface PrepOptions {
  clip: number;
  mix: number;
  protectShadows: boolean;
}

export function prepOptionsFor(
  gray: Float32Array,
): PrepOptions {
  return percentile(gray, 0.5) < 110 / 255
    ? {
        clip: 1.4,
        mix: 0.5,
        protectShadows: true,
      }
    : {
        clip: 2,
        mix: 1,
        protectShadows: false,
      };
}

export function clahe(
  source: Float32Array,
  width: number,
  height: number,
  grid = 8,
  clip = 2,
): Float32Array {
  const bins = 256;
  const tileWidth = Math.ceil(width / grid);
  const tileHeight = Math.ceil(height / grid);
  const maps: Float32Array[] = [];

  for (let ty = 0; ty < grid; ty++) {
    for (let tx = 0; tx < grid; tx++) {
      const histogram = new Float32Array(bins);
      const map = new Float32Array(bins);

      let count = 0;

      for (
        let y = ty * tileHeight;
        y < Math.min(height, (ty + 1) * tileHeight);
        y++
      ) {
        for (
          let x = tx * tileWidth;
          x < Math.min(width, (tx + 1) * tileWidth);
          x++
        ) {
          const bin = clamp(
            Math.round(source[y * width + x] * 255),
            0,
            255,
          );

          histogram[bin]++;
          count++;
        }
      }

      if (count === 0) {
        for (let i = 0; i < bins; i++) {
          map[i] = i / 255;
        }

        maps.push(map);
        continue;
      }

      const limit = Math.max(1, count / bins * clip);

      let excess = 0;

      for (let i = 0; i < bins; i++) {
        if (histogram[i] > limit) {
          excess += histogram[i] - limit;
          histogram[i] = limit;
        }
      }

      let cumulative = 0;

      for (let i = 0; i < bins; i++) {
        cumulative += histogram[i] + excess / bins;
        map[i] = cumulative / count;
      }

      maps.push(map);
    }
  }

  const output = new Float32Array(source.length);

  for (let y = 0; y < height; y++) {
    const fy = clamp(
      (y - tileHeight / 2) / tileHeight,
      0,
      grid - 1,
    );

    const y0 = Math.floor(fy);
    const y1 = Math.min(grid - 1, y0 + 1);
    const wy = fy - y0;

    for (let x = 0; x < width; x++) {
      const fx = clamp(
        (x - tileWidth / 2) / tileWidth,
        0,
        grid - 1,
      );

      const x0 = Math.floor(fx);
      const x1 = Math.min(grid - 1, x0 + 1);
      const wx = fx - x0;

      const bin = clamp(
        Math.round(source[y * width + x] * 255),
        0,
        255,
      );

      const top =
        maps[y0 * grid + x0][bin] * (1 - wx) +
        maps[y0 * grid + x1][bin] * wx;

      const bottom =
        maps[y1 * grid + x0][bin] * (1 - wx) +
        maps[y1 * grid + x1][bin] * wx;

      output[y * width + x] =
        top * (1 - wy) + bottom * wy;
    }
  }

  return output;
}

export function prepTone(
  gray: Float32Array,
  width: number,
  height: number,
  options: PrepOptions,
): Float32Array {
  const denoised = bilateral(gray, width, height);
  const equalized = clahe(
    denoised,
    width,
    height,
    8,
    options.clip,
  );

  const weights = new Float32Array(gray.length);

  for (let i = 0; i < weights.length; i++) {
    weights[i] =
      options.protectShadows && denoised[i] < 70 / 255
        ? options.mix * 0.35
        : options.mix;
  }

  const smoothWeights = options.protectShadows
    ? gaussian(weights, width, height, 6)
    : weights;

  const output = new Float32Array(gray.length);

  for (let i = 0; i < output.length; i++) {
    output[i] =
      denoised[i] * (1 - smoothWeights[i]) +
      equalized[i] * smoothWeights[i];
  }

  return output;
}
