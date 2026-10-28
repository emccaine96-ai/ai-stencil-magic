export const clamp = (
  value: number,
  min: number,
  max: number,
): number => Math.max(min, Math.min(max, value));

export function smoothstep(
  min: number,
  max: number,
  value: number,
): number {
  const t = clamp(
    (value - min) / Math.max(1e-8, max - min),
    0,
    1,
  );

  return t * t * (3 - 2 * t);
}

export function validateSize(
  width: number,
  height: number,
): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    !Number.isSafeInteger(width * height)
  ) {
    throw new Error(`Invalid dimensions: ${width}×${height}`);
  }
}

export function assertLength(
  value: ArrayLike<number>,
  expected: number,
  label: string,
): void {
  if (value.length !== expected) {
    throw new Error(
      `${label}: expected ${expected} values; got ${value.length}`,
    );
  }
}

export function hash01(
  x: number,
  y: number,
  seed: number,
): number {
  let n =
    Math.imul(x + 1, 374761393) ^
    Math.imul(y + 1, 668265263) ^
    Math.imul(seed + 1, 1274126177);

  n = Math.imul(n ^ (n >>> 13), 1274126177);

  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(
  x: number,
  y: number,
  seed: number,
): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = smoothstep(0, 1, x - ix);
  const sy = smoothstep(0, 1, y - iy);

  const a = hash01(ix, iy, seed);
  const b = hash01(ix + 1, iy, seed);
  const c = hash01(ix, iy + 1, seed);
  const d = hash01(ix + 1, iy + 1, seed);

  return (
    a * (1 - sx) * (1 - sy) +
    b * sx * (1 - sy) +
    c * (1 - sx) * sy +
    d * sx * sy
  );
}

export function sampleBilinear(
  source: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  x = clamp(x, 0, width - 1);
  y = clamp(y, 0, height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  return (
    source[y0 * width + x0] * (1 - tx) * (1 - ty) +
    source[y0 * width + x1] * tx * (1 - ty) +
    source[y1 * width + x0] * (1 - tx) * ty +
    source[y1 * width + x1] * tx * ty
  );
}

export function resampleBilinear(
  source: Float32Array,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
): Float32Array {
  validateSize(outWidth, outHeight);
  assertLength(source, width * height, "Resample source");

  const output = new Float32Array(outWidth * outHeight);

  for (let y = 0; y < outHeight; y++) {
    const fy = (y + 0.5) * height / outHeight - 0.5;

    for (let x = 0; x < outWidth; x++) {
      const fx = (x + 0.5) * width / outWidth - 0.5;

      output[y * outWidth + x] = sampleBilinear(
        source,
        width,
        height,
        fx,
        fy,
      );
    }
  }

  return output;
}

export function percentile(
  source: Float32Array,
  fraction: number,
  stride = 1,
): number {
  if (
    !Number.isFinite(fraction) ||
    !Number.isSafeInteger(stride) ||
    stride < 1
  ) {
    throw new Error("Invalid percentile arguments");
  }

  const values: number[] = [];

  for (let i = 0; i < source.length; i += stride) {
    if (Number.isFinite(source[i])) {
      values.push(source[i]);
    }
  }

  if (!values.length) return 0;

  values.sort((a, b) => a - b);

  const index = Math.min(
    values.length - 1,
    Math.floor(clamp(fraction, 0, 1) * values.length),
  );

  return values[index];
}

/**
 * Foreground distance to the nearest background pixel INSIDE
 * the image. All-foreground images use the documented 1e4 sentinel.
 *
 * Separate evaluation output avoids the prior input-overwrite bug.
 */
export function distanceInside(
  mask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  validateSize(width, height);
  assertLength(mask, width * height, "Distance mask");

  const INF = 1e20;
  const length = width * height;
  const maxDimension = Math.max(width, height);

  const grid = new Float64Array(length);
  const input = new Float64Array(maxDimension);
  const result = new Float64Array(maxDimension);
  const sites = new Int32Array(maxDimension);
  const boundaries = new Float64Array(maxDimension + 1);

  for (let i = 0; i < length; i++) {
    grid[i] = mask[i] ? INF : 0;
  }

  function pass(count: number): void {
    let k = 0;

    sites[0] = 0;
    boundaries[0] = -INF;
    boundaries[1] = INF;

    for (let q = 1; q < count; q++) {
      let intersection =
        (
          input[q] + q * q -
          input[sites[k]] - sites[k] * sites[k]
        ) /
        (2 * q - 2 * sites[k]);

      while (intersection <= boundaries[k]) {
        k--;

        intersection =
          (
            input[q] + q * q -
            input[sites[k]] - sites[k] * sites[k]
          ) /
          (2 * q - 2 * sites[k]);
      }

      k++;
      sites[k] = q;
      boundaries[k] = intersection;
      boundaries[k + 1] = INF;
    }

    k = 0;

    for (let q = 0; q < count; q++) {
      while (boundaries[k + 1] < q) k++;

      const delta = q - sites[k];

      result[q] =
        delta * delta +
        input[sites[k]];
    }

    input.set(result.subarray(0, count));
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      input[y] = grid[y * width + x];
    }

    pass(height);

    for (let y = 0; y < height; y++) {
      grid[y * width + x] = input[y];
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      input[x] = grid[y * width + x];
    }

    pass(width);

    for (let x = 0; x < width; x++) {
      grid[y * width + x] = input[x];
    }
  }

  const output = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    output[i] = grid[i] >= INF * 0.5
      ? 1e4
      : Math.sqrt(grid[i]);
  }

  return output;
}
