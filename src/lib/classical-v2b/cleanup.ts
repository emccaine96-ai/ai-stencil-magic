export function removeSmallComponents(
  ink: Float32Array,
  width: number,
  height: number,
  minimumPixels: number,
  threshold = 0.4,
): Float32Array {
  const length = width * height;
  // Float32Array stores values at float32 precision, so compare against the
  // float32-rounded threshold. Otherwise a pixel stored as exactly "0.4" (which
  // is 0.4000000059...) would count as ink against the double 0.4.
  threshold = Math.fround(threshold);
  const visited = new Uint8Array(length);
  const keep = new Uint8Array(length);
  const queue = new Int32Array(length);

  for (let start = 0; start < length; start++) {
    if (visited[start] || ink[start] <= threshold) continue;

    let head = 0;
    let tail = 0;

    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];

      for (const next of neighbors) {
        if (
          next >= 0 &&
          !visited[next] &&
          ink[next] > threshold
        ) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    if (tail >= minimumPixels) {
      for (let i = 0; i < tail; i++) {
        keep[queue[i]] = 1;
      }
    }
  }

  const output = new Float32Array(length);

  // Restore soft coverage near retained thresholded components.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nearby = false;

      for (let dy = -1; dy <= 1 && !nearby; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;

          if (
            xx >= 0 &&
            yy >= 0 &&
            xx < width &&
            yy < height &&
            keep[yy * width + xx]
          ) {
            nearby = true;
            break;
          }
        }
      }

      if (nearby) {
        output[y * width + x] = ink[y * width + x];
      }
    }
  }

  return output;
}
