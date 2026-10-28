import {
  assertLength,
  clamp,
  validateSize,
} from "./fieldops";

export function grayFromRGBA(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  validateSize(width, height);
  assertLength(rgba, width * height * 4, "RGBA");

  const output = new Float32Array(width * height);

  for (let p = 0; p < output.length; p++) {
    const i = p * 4;
    const alpha = rgba[i + 3] / 255;

    const luminance =
      0.299 * rgba[i] +
      0.587 * rgba[i + 1] +
      0.114 * rgba[i + 2];

    output[p] =
      (luminance * alpha + 255 * (1 - alpha)) / 255;
  }

  return output;
}

export function gaussian(
  source: Float32Array,
  width: number,
  height: number,
  sigma: number,
): Float32Array {
  if (!Number.isFinite(sigma) || sigma < 0) {
    throw new Error("Invalid Gaussian sigma");
  }

  if (sigma <= 0.01) return source.slice();

  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(2 * radius + 1);

  let total = 0;

  for (let offset = -radius; offset <= radius; offset++) {
    const value = Math.exp(
      -(offset * offset) / (2 * sigma * sigma),
    );

    kernel[offset + radius] = value;
    total += value;
  }

  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= total;
  }

  const temporary = new Float32Array(source.length);
  const output = new Float32Array(source.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;

      for (let k = -radius; k <= radius; k++) {
        const xx = clamp(x + k, 0, width - 1);

        sum +=
          source[y * width + xx] *
          kernel[k + radius];
      }

      temporary[y * width + x] = sum;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;

      for (let k = -radius; k <= radius; k++) {
        const yy = clamp(y + k, 0, height - 1);

        sum +=
          temporary[yy * width + x] *
          kernel[k + radius];
      }

      output[y * width + x] = sum;
    }
  }

  return output;
}

export function bilateral(
  source: Float32Array,
  width: number,
  height: number,
  radius = 4,
  sigmaSpatial = 5,
  sigmaRange = 28 / 255,
): Float32Array {
  const output = new Float32Array(source.length);
  const side = 2 * radius + 1;
  const spatial = new Float32Array(side * side);
  const range = new Float32Array(1025);

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      spatial[(dy + radius) * side + dx + radius] =
        Math.exp(
          -(dx * dx + dy * dy) /
          (2 * sigmaSpatial * sigmaSpatial),
        );
    }
  }

  for (let i = 0; i <= 1024; i++) {
    const difference = i / 1024;

    range[i] = Math.exp(
      -(difference * difference) /
      (2 * sigmaRange * sigmaRange),
    );
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = source[y * width + x];

      let weightSum = 0;
      let valueSum = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = clamp(x + dx, 0, width - 1);
          const yy = clamp(y + dy, 0, height - 1);
          const value = source[yy * width + xx];

          const rangeIndex = Math.min(
            1024,
            Math.floor(Math.abs(value - center) * 1024),
          );

          const weight =
            spatial[(dy + radius) * side + dx + radius] *
            range[rangeIndex];

          weightSum += weight;
          valueSum += weight * value;
        }
      }

      output[y * width + x] =
        weightSum > 0 ? valueSum / weightSum : center;
    }
  }

  return output;
}
